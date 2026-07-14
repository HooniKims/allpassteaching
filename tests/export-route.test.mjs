import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import { MAX_EXPORT_REQUEST_BYTES, POST } from '@/app/api/export/[format]/route';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

describe('lesson plan export route', () => {
    for (const [format, contentType] of [['hwpx', 'application/hwp+zip'], ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['pdf', 'application/pdf']]) {
        test(`exports ${format}`, async () => {
            const request = new Request(`http://localhost/api/export/${format}`, { method: 'POST', body: JSON.stringify(makeGeneratedPlan()) });
            const response = await POST(request, { params: Promise.resolve({ format }) });
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain(contentType);
            expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
        });
    }

    test('exports the simple HWPX variant with an HWPX filename', async () => {
        // Given a teacher chooses the table-free HWPX download
        const request = new Request('http://localhost/api/export/hwpx?variant=simple', { method: 'POST', body: JSON.stringify(makeGeneratedPlan()) });

        // When the export route receives the request
        const response = await POST(request, { params: Promise.resolve({ format: 'hwpx' }) });

        // Then it returns a normal HWPX attachment whose section has no table layout
        const bytes = new Uint8Array(await response.arrayBuffer());
        const zip = await JSZip.loadAsync(bytes);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('application/hwp+zip');
        expect(response.headers.get('content-disposition')).toContain('.hwpx');
        expect(await zip.file('Contents/section0.xml').async('string')).not.toContain('<hp:tbl');
    });

    test('rejects an unsupported format', async () => {
        const response = await POST(new Request('http://localhost/api/export/txt', { method: 'POST', body: '{' }), { params: Promise.resolve({ format: 'txt' }) });
        expect(response.status).toBe(404);
    });

    test('returns a consistent 400 response for malformed JSON', async () => {
        const response = await POST(new Request('http://localhost/api/export/docx', { method: 'POST', body: '{' }), { params: Promise.resolve({ format: 'docx' }) });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ code: 'invalid_request', message: '요청 형식이 올바르지 않습니다.' });
    });

    test('rejects an oversized Content-Length before reading the request body', async () => {
        const response = await POST(new Request('http://localhost/api/export/docx', {
            method: 'POST',
            headers: { 'Content-Length': String(MAX_EXPORT_REQUEST_BYTES + 1) },
            body: JSON.stringify(makeGeneratedPlan()),
        }), { params: Promise.resolve({ format: 'docx' }) });

        expect(response.status).toBe(413);
        expect(await response.json()).toEqual({ code: 'request_too_large', message: '지도안 내용이 너무 깁니다. 내용을 줄인 뒤 다시 시도해주세요.' });
    });

    test('measures the actual UTF-8 bytes of a multibyte request body', async () => {
        const oversized = `"${'가'.repeat(Math.ceil(MAX_EXPORT_REQUEST_BYTES / 3))}"`;
        expect(new TextEncoder().encode(oversized).byteLength).toBeGreaterThan(MAX_EXPORT_REQUEST_BYTES);

        const response = await POST(new Request('http://localhost/api/export/docx', { method: 'POST', body: oversized }), { params: Promise.resolve({ format: 'docx' }) });

        expect(response.status).toBe(413);
        expect((await response.json()).code).toBe('request_too_large');
    });

    test('rejects 1000 assessment rows before export rendering', async () => {
        const plan = makeGeneratedPlan();
        plan.assessment = Array.from({ length: 1000 }, () => structuredClone(plan.assessment[0]));

        const response = await POST(new Request('http://localhost/api/export/docx', { method: 'POST', body: JSON.stringify(plan) }), { params: Promise.resolve({ format: 'docx' }) });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual(expect.objectContaining({
            code: 'invalid_plan',
            message: expect.any(String),
            issues: expect.any(Array),
        }));
    });
});
