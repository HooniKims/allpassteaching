// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/ocr/route';

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.UPSTAGE_API_KEY;
    delete process.env.UPSTAGE_DOCUMENT_PARSE_ENHANCED_MODEL;
});
function request(file, visualAnalysis) {
    const form = new FormData();
    if (file) form.set('document', file);
    if (visualAnalysis !== undefined) form.set('visualAnalysis', visualAnalysis);
    return new Request('http://localhost/api/ocr', { method: 'POST', body: form });
}

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
    expect(body).toMatchObject({
        extractedText: '관찰한 뿌리에는 가는 털이 있었다.', elements: [], elementsTruncated: false,
        ocrModel: 'document-parse', ocrMode: 'standard', pageCount: 1,
        requiresVisualReview: false, reviewState: 'ready_for_rubric_review', autoScoreAllowed: true,
    });
    expect(body).not.toHaveProperty('secret');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
});

test('accepts the exact true visual-analysis flag and returns safe capability and review state', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ content: { text: '표준 참고' }, usage: { pages: 1 }, elements: [] })));

    const response = await POST(request(new File(['%PDF-test'], '합성.pdf', { type: 'application/pdf' }), 'true'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ visualAnalysisStatus: 'enhanced_unavailable', requiresVisualReview: true, reviewState: 'teacher_review', autoScoreAllowed: false });
    expect(fetch.mock.calls[0][1].body.get('mode')).toBe('standard');
});

test.each([
    ['omitted', undefined],
    ['explicit false', 'false'],
])('treats %s visual-analysis mode deterministically as not requested', async (_label, visualAnalysis) => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ content: { text: '표준 OCR 결과' }, usage: { pages: 1 }, elements: [] })));

    const response = await POST(request(new File(['%PDF-test'], '서술형.pdf', { type: 'application/pdf' }), visualAnalysis));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ visualAnalysisStatus: 'not_requested', requiresVisualReview: false, reviewState: 'ready_for_rubric_review', autoScoreAllowed: true });
    expect(fetch.mock.calls[0][1].body.get('mode')).toBe('standard');
});

test.each([
    ['unknown text', 'sometimes'],
    ['file value', new File(['true'], 'flag.txt', { type: 'text/plain' })],
])('rejects invalid visual analysis flags supplied as %s without calling Upstage', async (_label, visualAnalysis) => {
    vi.stubGlobal('fetch', vi.fn());

    const response = await POST(request(new File(['%PDF-test'], '합성.pdf', { type: 'application/pdf' }), visualAnalysis));

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
});

test('never logs or returns API keys, file names, raw response bodies, or upstream messages', async () => {
    process.env.UPSTAGE_API_KEY = 'private-api-key';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
        error: { code: 'invalid_document', message: '김학생.pdf private-api-key raw-body' },
        raw: '김학생.pdf private-api-key raw-body',
    }, { status: 400 })));

    const response = await POST(request(new File(['%PDF-test'], '김학생.pdf', { type: 'application/pdf' })));
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).not.toMatch(/김학생|private-api-key|raw-body/);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
});
