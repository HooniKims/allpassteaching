import { expect, test } from 'vitest';
import { POST } from '@/app/api/export-workflow/[kind]/route';
import { makeAssessment, makeWorksheet } from './fixtures/workflow.mjs';

const MAX_WORKFLOW_EXPORT_REQUEST_BYTES = 500_000;
const request = body => new Request('http://localhost/api/export-workflow/worksheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('exports a validated workflow document as PDF', async () => {
    const response = await POST(request(makeWorksheet()), { params: Promise.resolve({ kind: 'worksheet' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('exports separate student and teacher worksheet documents', async () => {
    const worksheet = makeWorksheet();
    const student = await POST(request(worksheet), { params: Promise.resolve({ kind: 'worksheet-student' }) });
    const teacher = await POST(request(worksheet), { params: Promise.resolve({ kind: 'worksheet-teacher' }) });

    expect(student.status).toBe(200);
    expect(teacher.status).toBe(200);
    expect(Buffer.from(await student.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect(Buffer.from(await teacher.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('exports cover-only and full assessment documents from the same validated assessment', async () => {
    const assessment = makeAssessment();
    const coverRequest = new Request('http://localhost/api/export-workflow/assessment-cover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assessment) });
    const fullRequest = new Request('http://localhost/api/export-workflow/assessment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assessment) });

    const cover = await POST(coverRequest, { params: Promise.resolve({ kind: 'assessment-cover' }) });
    const full = await POST(fullRequest, { params: Promise.resolve({ kind: 'assessment' }) });

    expect(cover.status).toBe(200);
    expect(full.status).toBe(200);
    expect(Buffer.from(await cover.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect(Buffer.from(await full.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('rejects invalid workflow documents and unsupported kinds', async () => {
    expect((await POST(request({}), { params: Promise.resolve({ kind: 'worksheet' }) })).status).toBe(400);
    expect((await POST(request(makeWorksheet()), { params: Promise.resolve({ kind: 'unknown' }) })).status).toBe(404);
});

test('학생 표지를 끈 평가의 표지 전용 내보내기를 거부한다', async () => {
    const assessment = makeAssessment(); assessment.includeStudentCover = false;
    const coverRequest = new Request('http://localhost/api/export-workflow/assessment-cover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(assessment) });

    const response = await POST(coverRequest, { params: Promise.resolve({ kind: 'assessment-cover' }) });

    expect(response.status).toBe(409);
});

test('rejects a declared workflow export body above 500 KB with a safe 413 response', async () => {
    const declared = new Request('http://localhost/api/export-workflow/worksheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(MAX_WORKFLOW_EXPORT_REQUEST_BYTES + 1) },
        body: JSON.stringify(makeWorksheet()),
    });

    const response = await POST(declared, { params: Promise.resolve({ kind: 'worksheet' }) });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
        code: 'request_too_large',
        message: 'PDF로 저장할 내용이 너무 깁니다. 내용을 줄인 뒤 다시 시도해주세요.',
    });
});

test('rejects an actual UTF-8 workflow export body above 500 KB without echoing input', async () => {
    const oversizedBody = JSON.stringify({ padding: '가'.repeat(Math.ceil(MAX_WORKFLOW_EXPORT_REQUEST_BYTES / 3)) });
    expect(oversizedBody.length).toBeLessThan(MAX_WORKFLOW_EXPORT_REQUEST_BYTES);
    expect(new TextEncoder().encode(oversizedBody).byteLength).toBeGreaterThan(MAX_WORKFLOW_EXPORT_REQUEST_BYTES);
    const actual = new Request('http://localhost/api/export-workflow/worksheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: oversizedBody,
    });

    const response = await POST(actual, { params: Promise.resolve({ kind: 'worksheet' }) });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
        code: 'request_too_large',
        message: 'PDF로 저장할 내용이 너무 깁니다. 내용을 줄인 뒤 다시 시도해주세요.',
    });
});

test('counts a stripped UTF-8 BOM toward the actual 500 KB request limit', async () => {
    const emptyEnvelope = JSON.stringify({ padding: '' });
    const decodedBody = JSON.stringify({ padding: 'A'.repeat(MAX_WORKFLOW_EXPORT_REQUEST_BYTES - 2 - emptyEnvelope.length) });
    const encodedBody = new TextEncoder().encode(decodedBody);
    expect(encodedBody.byteLength).toBe(MAX_WORKFLOW_EXPORT_REQUEST_BYTES - 2);
    const body = new ReadableStream({
        start(controller) {
            controller.enqueue(Uint8Array.of(0xef, 0xbb, 0xbf));
            controller.enqueue(encodedBody);
            controller.close();
        },
    });
    const actual = new Request('http://localhost/api/export-workflow/worksheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, duplex: 'half',
    });

    const response = await POST(actual, { params: Promise.resolve({ kind: 'worksheet' }) });

    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe('request_too_large');
});

test('allows exactly 500 KB through the byte gate and returns a safe validation error', async () => {
    const emptyEnvelope = JSON.stringify({ padding: '' });
    const exactBody = JSON.stringify({ padding: 'A'.repeat(MAX_WORKFLOW_EXPORT_REQUEST_BYTES - emptyEnvelope.length) });
    expect(new TextEncoder().encode(exactBody).byteLength).toBe(MAX_WORKFLOW_EXPORT_REQUEST_BYTES);
    const exact = new Request('http://localhost/api/export-workflow/worksheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: exactBody,
    });

    const response = await POST(exact, { params: Promise.resolve({ kind: 'worksheet' }) });

    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.code).toBe('invalid_document');
    expect(JSON.stringify(payload)).not.toContain('AAAAAA');
});
