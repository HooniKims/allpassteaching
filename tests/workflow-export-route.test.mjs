import { expect, test } from 'vitest';
import { POST } from '@/app/api/export-workflow/[kind]/route';
import { makeAssessment, makeWorksheet } from './fixtures/workflow.mjs';

const request = body => new Request('http://localhost/api/export-workflow/worksheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('exports a validated workflow document as PDF', async () => {
    const response = await POST(request(makeWorksheet()), { params: Promise.resolve({ kind: 'worksheet' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
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
