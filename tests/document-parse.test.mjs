import { afterEach, expect, test, vi } from 'vitest';
import { normalizeDocumentElements, normalizeDocumentText, parseDocument, UpstageDocumentError } from '@/lib/upstage/document-parse';

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.UPSTAGE_API_KEY;
    delete process.env.UPSTAGE_DOCUMENT_PARSE_ENHANCED_MODEL;
});

test('normalizes only bounded source evidence fields', () => {
    const elements = normalizeDocumentElements({ elements: [{
        id: 7,
        category: 'equation',
        page: 2,
        coordinates: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.3 }],
        content: { text: 'x²=4', raw: 'private' },
        confidence: 0.71,
        base64: 'data:application/pdf;base64,private',
        secret: 'private',
    }] });

    expect(elements).toEqual([{
        id: '7', category: 'equation', page: 2, text: 'x²=4',
        coordinates: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.3 }], confidence: 0.71,
    }]);
    expect(JSON.stringify(elements)).not.toMatch(/raw|base64|secret|private/);
});

test('drops invalid pages and coordinates instead of returning non-finite or unbounded evidence', () => {
    const elements = normalizeDocumentElements({ elements: [
        { id: 1, category: 'paragraph', page: Number.NaN, coordinates: [{ x: 0.1, y: 0.2 }], content: { text: 'bad page' } },
        { id: 2, category: 'paragraph', page: 1, coordinates: [{ x: Number.POSITIVE_INFINITY, y: 0.2 }], content: { text: 'bad coordinate' } },
        { id: 3, category: 'paragraph', page: 1, coordinates: [{ x: -0.1, y: 1.1 }], content: { text: 'outside coordinate' } },
    ] });

    expect(elements).toEqual([
        { id: '2', category: 'paragraph', page: 1, text: 'bad coordinate', coordinates: [] },
        { id: '3', category: 'paragraph', page: 1, text: 'outside coordinate', coordinates: [] },
    ]);
    expect(JSON.stringify(elements)).not.toMatch(/Infinity|NaN|-0\.1|1\.1/);
});

test('keeps normalized element ids unique when generated suffixes collide with upstream ids', () => {
    const elements = normalizeDocumentElements({ elements: [
        { id: 'a', category: 'text', page: 1, content: { text: '첫째' } },
        { id: 'a', category: 'text', page: 1, content: { text: '둘째' } },
        { id: 'a-2', category: 'text', page: 1, content: { text: '셋째' } },
    ] });

    expect(new Set(elements.map(element => element.id)).size).toBe(3);
});

test.each([
    ['object', { x: 0.1, y: 0.2 }],
    ['string', '0.1,0.2'],
    ['null', null],
    ['too short', [{ x: 0.1, y: 0.2 }]],
    ['too long', Array.from({ length: 17 }, () => ({ x: 0.1, y: 0.2 }))],
    ['nested mixed', [{ x: 0.1, y: 0.2 }, [{ x: 0.3, y: 0.4 }]]],
    ['non-finite', [{ x: 0.1, y: 0.2 }, { x: Number.NaN, y: 0.4 }]],
    ['identical', [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }]],
    ['zero width', [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.5 }]],
    ['zero height', [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.2 }]],
    ['collapsed polygon', [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }]],
])('forces teacher review when supplied coordinates are %s', async (_label, coordinates) => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
        content: { text: 'Synthetic evidence reference' }, usage: { pages: 1 },
        elements: [{ id: 1, category: 'paragraph', page: 1, coordinates, content: { text: 'Synthetic evidence' }, confidence: 0.99 }],
    })));

    const result = await parseDocument(new File(['%PDF-test'], 'synthetic.pdf', { type: 'application/pdf' }));

    expect(result.elements[0].coordinates).toEqual([]);
    expect(result.reviewReasons).toContain('invalid_coordinates');
    expect(result.reviewState).toBe('teacher_review');
    expect(result.autoScoreAllowed).toBe(false);
});

test('drops an element page beyond the reported document page count and requires teacher review', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
        content: { text: 'Synthetic evidence reference' }, usage: { pages: 1 },
        elements: [{ id: 1, category: 'paragraph', page: 2, coordinates: [{ x: .1, y: .2 }, { x: .4, y: .5 }], content: { text: 'Synthetic evidence' }, confidence: .99 }],
    })));

    const result = await parseDocument(new File(['%PDF-test'], 'synthetic.pdf', { type: 'application/pdf' }));

    expect(result.elements).toEqual([]);
    expect(result.reviewReasons).toContain('invalid_page');
    expect(result.reviewState).toBe('teacher_review');
});

test('forces teacher review when a source element has no original location', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
        content: { text: 'Synthetic evidence reference' }, usage: { pages: 1 },
        elements: [{ id: 1, category: 'paragraph', page: 1, content: { text: 'Synthetic evidence' }, confidence: 0.99 }],
    })));

    const result = await parseDocument(new File(['%PDF-test'], 'synthetic.pdf', { type: 'application/pdf' }));

    expect(result.elements[0].coordinates).toEqual([]);
    expect(result.reviewReasons).toContain('missing_coordinates');
    expect(result.reviewState).toBe('teacher_review');
    expect(result.autoScoreAllowed).toBe(false);
});

test('keeps a valid two-point source location available for rubric evidence', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    const coordinates = [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
        content: { text: 'Synthetic evidence reference' }, usage: { pages: 1 },
        elements: [{ id: 1, category: 'paragraph', page: 1, coordinates, content: { text: 'Synthetic evidence' }, confidence: 0.99 }],
    })));

    const result = await parseDocument(new File(['%PDF-test'], 'synthetic.pdf', { type: 'application/pdf' }));

    expect(result.elements[0].coordinates).toEqual(coordinates);
    expect(result.reviewReasons).not.toContain('invalid_coordinates');
    expect(result.reviewReasons).not.toContain('missing_coordinates');
    expect(result.reviewState).toBe('ready_for_rubric_review');
    expect(result.autoScoreAllowed).toBe(true);
});

test('caps element count and per-element text at the documented boundaries', () => {
    const elements = normalizeDocumentElements({ elements: Array.from({ length: 2001 }, (_, index) => ({
        id: index,
        category: 'paragraph',
        page: 1,
        coordinates: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        content: { text: index === 0 ? 'a'.repeat(2001) : `safe-${index}` },
    })) });

    expect(elements).toHaveLength(2000);
    expect(elements[0].text).toHaveLength(2000);
});

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

test('falls back to element HTML when Upstage returns an empty element text field', () => {
    const text = normalizeDocumentText({ elements: [{ content: { text: '', html: '<p>SYNTHETIC SCIENCE EVIDENCE</p>' } }] });

    expect(text).toBe('SYNTHETIC SCIENCE EVIDENCE');
});

test('posts the PDF as multipart document-parse with forced OCR', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ content: { text: '식물 기관 관찰 결과' }, usage: { pages: 2 } })));
    const file = new File(['%PDF-test'], '학생.pdf', { type: 'application/pdf' });

    const result = await parseDocument(file);

    expect(result).toMatchObject({
        extractedText: '식물 기관 관찰 결과', elements: [], elementsTruncated: false,
        ocrModel: 'document-parse', ocrMode: 'standard', pageCount: 2,
        requiresVisualReview: false, reviewState: 'ready_for_rubric_review', autoScoreAllowed: true,
        visualAnalysisStatus: 'not_requested',
    });
    const body = fetch.mock.calls[0][1].body;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('model')).toBe('document-parse');
    expect(body.get('ocr')).toBe('force');
    expect(body.get('mode')).toBe('standard');
    expect(body.get('document').name).toBe('submission.pdf');
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Content-Type');
});

test('requires teacher review for visual, low-confidence, and truncated evidence', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
        content: { text: '시각 증거 참고' }, usage: { pages: 1 },
        elements: [
            { id: 1, category: 'equation', page: 1, coordinates: [{ x: 0.1, y: 0.2 }], content: { text: 'x²=4' }, confidence: 0.99 },
            { id: 2, category: 'paragraph', page: 1, coordinates: [{ x: 0.2, y: 0.3 }], content: { text: '확신도 낮음' }, confidence: 0.84 },
            ...Array.from({ length: 1999 }, (_, index) => ({ id: index + 3, category: 'paragraph', page: 1, content: { text: 'safe' } })),
        ],
    })));

    const result = await parseDocument(new File(['%PDF-test'], '합성.pdf', { type: 'application/pdf' }));

    expect(result.elements).toHaveLength(2000);
    expect(result.elementsTruncated).toBe(true);
    expect(result.requiresVisualReview).toBe(true);
    expect(result.reviewState).toBe('teacher_review');
    expect(result.autoScoreAllowed).toBe(false);
    expect(result.reviewReasons).toEqual(expect.arrayContaining(['visual_element', 'low_confidence', 'elements_truncated']));
});

test('keeps Standard evidence as teacher-review reference when Enhanced is not configured', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
        content: { text: '표준 모드 참고 결과' }, usage: { pages: 1 },
        elements: [{ id: 1, category: 'paragraph', page: 1, coordinates: [{ x: 0.1, y: 0.1 }], content: { text: '참고' } }],
    })));

    const result = await parseDocument(new File(['%PDF-test'], '합성.pdf', { type: 'application/pdf' }), { visualAnalysis: true });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
        extractedText: '표준 모드 참고 결과', ocrMode: 'standard_reference',
        visualAnalysisStatus: 'enhanced_unavailable', requiresVisualReview: true,
        reviewState: 'teacher_review', autoScoreAllowed: false,
    });
    expect(result.reviewReasons).toContain('enhanced_unavailable');
});

test('uses only the configured Enhanced model and mode after retaining a Standard reference', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    process.env.UPSTAGE_DOCUMENT_PARSE_ENHANCED_MODEL = 'configured-enhanced-model';
    vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(Response.json({ content: { text: '표준 참고' }, usage: { pages: 1 }, elements: [] }))
        .mockResolvedValueOnce(Response.json({ content: { text: 'Enhanced 참고' }, usage: { pages: 1 }, elements: [] })));

    const result = await parseDocument(new File(['%PDF-test'], '합성.pdf', { type: 'application/pdf' }), { visualAnalysis: true });

    expect(fetch).toHaveBeenCalledTimes(2);
    const enhancedBody = fetch.mock.calls[1][1].body;
    expect(enhancedBody.get('model')).toBe('configured-enhanced-model');
    expect(enhancedBody.get('mode')).toBe('enhanced');
    expect(result).toMatchObject({ ocrModel: 'configured-enhanced-model', ocrMode: 'enhanced', visualAnalysisStatus: 'enhanced_used' });
});

test('does not silently score Standard evidence when configured Enhanced fails', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    process.env.UPSTAGE_DOCUMENT_PARSE_ENHANCED_MODEL = 'configured-enhanced-model';
    vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(Response.json({ content: { text: '표준 참고' }, usage: { pages: 1 }, elements: [] }))
        .mockResolvedValueOnce(Response.json({ error: { code: 'enhanced_failed', message: 'raw upstream detail' } }, { status: 503 })));

    const result = await parseDocument(new File(['%PDF-test'], '합성.pdf', { type: 'application/pdf' }), { visualAnalysis: true });

    expect(result).toMatchObject({
        extractedText: '표준 참고', ocrMode: 'standard_reference',
        visualAnalysisStatus: 'enhanced_failed', reviewState: 'teacher_review', autoScoreAllowed: false,
    });
    expect(JSON.stringify(result)).not.toContain('raw upstream detail');
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
