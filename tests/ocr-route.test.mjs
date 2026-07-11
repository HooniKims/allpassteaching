import { afterEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/ocr/route';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
function request(file) { const form = new FormData(); if (file) form.set('document', file); return { formData: async () => form }; }

test('rejects non-PDF and oversized submissions before calling Upstage', async () => {
    expect((await POST(request(new File(['text'], '학생.txt', { type: 'text/plain' })))).status).toBe(415);
    expect((await POST(request(new File([new Uint8Array(10 * 1024 * 1024 + 1)], '학생.pdf', { type: 'application/pdf' })))).status).toBe(413);
});

test('rejects a renamed non-PDF before calling Upstage', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const response = await POST(request(new File(['not a pdf'], '학생.pdf', { type: 'application/pdf' })));
    expect(response.status).toBe(415);
    expect(fetch).not.toHaveBeenCalled();
});

test('returns only normalized OCR fields', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ content: { html: '<p>관찰한 뿌리에는 가는 털이 있었다.</p>' }, usage: { pages: 1 }, secret: 'raw payload' })));

    const response = await POST(request(new File(['%PDF-test'], '김학생.pdf', { type: 'application/pdf' })));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ extractedText: '관찰한 뿌리에는 가는 털이 있었다.', ocrModel: 'document-parse', pageCount: 1 });
    expect(body).not.toHaveProperty('secret');
});
