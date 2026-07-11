import { expect, test } from 'vitest';
import { POST } from '@/app/api/export-workflow/[kind]/route';
import { makeWorksheet } from './fixtures/workflow.mjs';

const request = body => new Request('http://localhost/api/export-workflow/worksheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('exports a validated workflow document as PDF', async () => {
    const response = await POST(request(makeWorksheet()), { params: Promise.resolve({ kind: 'worksheet' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('rejects invalid workflow documents and unsupported kinds', async () => {
    expect((await POST(request({}), { params: Promise.resolve({ kind: 'worksheet' }) })).status).toBe(400);
    expect((await POST(request(makeWorksheet()), { params: Promise.resolve({ kind: 'unknown' }) })).status).toBe(404);
});
