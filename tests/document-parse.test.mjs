import { afterEach, expect, test, vi } from 'vitest';
import { normalizeDocumentText, parseDocument, UpstageDocumentError } from '@/lib/upstage/document-parse';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });

test('normalizes Document Parse HTML without leaking tags', () => {
    const text = normalizeDocumentText({ content: { html: '<h1>탐구 보고서</h1><p>뿌리는 물을&nbsp;흡수한다.</p><ul><li>관찰 1</li></ul>' } });

    expect(text).toContain('탐구 보고서');
    expect(text).toContain('뿌리는 물을 흡수한다.');
    expect(text).toContain('관찰 1');
    expect(text).not.toContain('<p>');
});

test('falls back to ordered element text and removes duplicates', () => {
    const text = normalizeDocumentText({ elements: [
        { content: { text: '첫 문장' } }, { content: { text: '둘째 문장' } }, { content: { text: '첫 문장' } },
    ] });
    expect(text).toBe('첫 문장\n둘째 문장');
});

test('posts the PDF as multipart document-parse with forced OCR', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ content: { text: '식물 기관 관찰 결과' }, usage: { pages: 2 } })));
    const file = new File(['%PDF-test'], '학생.pdf', { type: 'application/pdf' });

    const result = await parseDocument(file);

    expect(result).toEqual({ extractedText: '식물 기관 관찰 결과', ocrModel: 'document-parse', pageCount: 2 });
    const body = fetch.mock.calls[0][1].body;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('model')).toBe('document-parse');
    expect(body.get('ocr')).toBe('force');
    expect(body.get('document').name).toBe('submission.pdf');
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Content-Type');
});

test('surfaces upstream errors without including the document response', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'invalid_document', message: 'bad pdf' } }, { status: 400 })));

    await expect(parseDocument(new File(['bad'], '학생.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({ name: 'UpstageDocumentError', code: 'invalid_document', status: 400 });
    expect(UpstageDocumentError).toBeTypeOf('function');
});

test('rejects OCR text that cannot fit through the grading contract', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ content: { text: '가'.repeat(100001) }, usage: { pages: 40 } })));
    await expect(parseDocument(new File(['%PDF'], '장문.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({ code: 'document_too_long', status: 422 });
});
