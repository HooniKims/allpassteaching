import { describe, expect, test } from 'vitest';
import { POST } from '@/app/api/export/[format]/route';
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

    test('rejects an unsupported format', async () => {
        const response = await POST(new Request('http://localhost/api/export/txt', { method: 'POST', body: '{}' }), { params: Promise.resolve({ format: 'txt' }) });
        expect(response.status).toBe(404);
    });
});
