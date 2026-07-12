import { MAX_OCR_TEXT_LENGTH } from '../grading-schema.js';
import { normalizeEvidenceCoordinates } from '../evidence-coordinates.js';
import { ocrElementNeedsTeacherReview } from '../grading-evidence.js';

const DOCUMENT_PARSE_ENDPOINT = 'https://api.upstage.ai/v1/document-digitization';
const STANDARD_MODEL = 'document-parse';
const MAX_ELEMENTS = 2000;
const MAX_ELEMENT_TEXT_LENGTH = 2000;
const MAX_PAGE = 10000;
const LOW_CONFIDENCE = 0.85;
const VISUAL_CATEGORIES = new Set(['equation', 'chart', 'figure']);

export class UpstageDocumentError extends Error {
    constructor(code, status, message = code) {
        super(message);
        this.name = 'UpstageDocumentError';
        this.code = code;
        this.status = status;
    }
}

function decodeEntities(value) {
    const entities = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
    return value.replace(/&([^;]+);/g, (match, name) => {
        if (entities[name] !== undefined) return entities[name];
        const radix = name.startsWith('#x') ? 16 : 10;
        const digits = name.startsWith('#x') ? name.slice(2) : name.startsWith('#') ? name.slice(1) : '';
        if (!digits) return match;
        const codePoint = Number.parseInt(digits, radix);
        return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
            ? String.fromCodePoint(codePoint)
            : match;
    });
}

function htmlToText(value) {
    return decodeEntities(String(value))
        .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function elementText(element) {
    const contentText = typeof element?.content?.text === 'string' ? element.content.text.trim() : '';
    if (contentText) return contentText;
    const directText = typeof element?.text === 'string' ? element.text.trim() : '';
    if (directText) return directText;
    return typeof element?.content?.html === 'string' ? htmlToText(element.content.html) : '';
}

export function normalizeDocumentText(payload) {
    const contentText = typeof payload?.content?.text === 'string' ? payload.content.text.trim() : '';
    const primary = contentText || (typeof payload?.content?.html === 'string' ? htmlToText(payload.content.html) : '');
    if (primary) return primary;
    const values = (Array.isArray(payload?.elements) ? payload.elements : []).map(elementText).filter(Boolean);
    return [...new Set(values)].join('\n').trim();
}

function safeCategory(value) {
    const category = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return /^[a-z][a-z0-9_-]{0,49}$/.test(category) ? category : 'unknown';
}

function safeCoordinates(value) {
    return normalizeEvidenceCoordinates(value);
}

function coordinateState(element) {
    if (!element || typeof element !== 'object' || !Object.prototype.hasOwnProperty.call(element, 'coordinates')) return 'missing';
    return safeCoordinates(element.coordinates).length > 0 ? 'valid' : 'invalid';
}

function safeElementId(value, index) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    const candidate = typeof value === 'string' ? value.trim() : '';
    return /^[a-z0-9._:-]{1,128}$/i.test(candidate) ? candidate : String(index + 1);
}

export function normalizeDocumentElements(payload) {
    const source = Array.isArray(payload?.elements) ? payload.elements.slice(0, MAX_ELEMENTS) : [];
    const usedIds = new Set();
    return source.flatMap((element, index) => {
        if (!element || !Number.isInteger(element.page) || element.page < 1 || element.page > MAX_PAGE) return [];
        const confidence = Number.isFinite(element.confidence) && element.confidence >= 0 && element.confidence <= 1
            ? element.confidence
            : undefined;
        const baseId = safeElementId(element.id, index);
        let id = baseId;
        let suffix = 2;
        while (usedIds.has(id)) { id = `${baseId}-${suffix}`; suffix += 1; }
        usedIds.add(id);
        const normalized = {
            id,
            category: safeCategory(element.category),
            page: element.page,
            text: elementText(element).slice(0, MAX_ELEMENT_TEXT_LENGTH),
            coordinates: safeCoordinates(element.coordinates),
        };
        return confidence === undefined ? [normalized] : [{ ...normalized, confidence }];
    });
}

function normalizationReasons(payload, elements, pageCount) {
    const source = Array.isArray(payload?.elements) ? payload.elements : [];
    const reasons = new Set();
    if (source.length > MAX_ELEMENTS) reasons.add('elements_truncated');
    if (source.some(element => elementText(element).length > MAX_ELEMENT_TEXT_LENGTH)) reasons.add('element_text_truncated');
    if (source.slice(0, MAX_ELEMENTS).some(element => !Number.isInteger(element?.page) || element.page < 1 || element.page > MAX_PAGE || element.page > pageCount)) reasons.add('invalid_page');
    const coordinateStates = source.slice(0, MAX_ELEMENTS).map(coordinateState);
    if (coordinateStates.includes('missing')) reasons.add('missing_coordinates');
    if (coordinateStates.includes('invalid')) reasons.add('invalid_coordinates');
    if (elements.some(element => VISUAL_CATEGORIES.has(element.category))) reasons.add('visual_element');
    if (elements.some(ocrElementNeedsTeacherReview)) reasons.add('teacher_review_element');
    if (elements.some(element => element.confidence !== undefined && element.confidence < LOW_CONFIDENCE)) reasons.add('low_confidence');
    return [...reasons];
}

function safePageCount(payload, elements) {
    const candidate = Number(payload?.usage?.pages ?? payload?.page_count ?? payload?.pages?.length);
    if (Number.isInteger(candidate) && candidate >= 1 && candidate <= MAX_PAGE) return candidate;
    return Math.max(1, ...elements.map(element => element.page));
}

function safeErrorCode(value) {
    return typeof value === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : 'upstream_error';
}

async function requestDocument(file, { model, mode, timeoutMs }) {
    const form = new FormData();
    form.set('document', file, 'submission.pdf');
    form.set('model', model);
    form.set('ocr', 'force');
    form.set('mode', mode);
    let response;
    try {
        response = await fetch(DOCUMENT_PARSE_ENDPOINT, {
            method: 'POST',
            signal: AbortSignal.timeout(timeoutMs),
            headers: { Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}` },
            body: form,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') {
            throw new UpstageDocumentError('timeout', 504, '문서 인식 시간이 초과되었습니다.');
        }
        throw new UpstageDocumentError('network_error', 502, 'Upstage 문서 인식 연결에 실패했습니다.');
    }
    let payload;
    try {
        payload = await response.json();
    } catch {
        throw new UpstageDocumentError('invalid_response', 502, 'Upstage 문서 인식 응답을 확인할 수 없습니다.');
    }
    if (!response.ok) {
        throw new UpstageDocumentError(safeErrorCode(payload?.error?.code), response.status, '문서 인식 요청에 실패했습니다.');
    }
    return payload;
}

function normalizeResult(payload, { model, mode, visualAnalysisStatus, extraReasons = [] }) {
    const extractedText = normalizeDocumentText(payload);
    if (!extractedText) throw new UpstageDocumentError('empty_document', 422, '문서에서 읽을 수 있는 내용을 찾지 못했습니다.');
    if (extractedText.length > MAX_OCR_TEXT_LENGTH) throw new UpstageDocumentError('document_too_long', 422, '추출 내용이 너무 깁니다. PDF를 나누어 다시 업로드해주세요.');
    const normalizedElements = normalizeDocumentElements(payload);
    const pageCount = safePageCount(payload, normalizedElements);
    const elements = normalizedElements.filter(element => element.page <= pageCount);
    const reviewReasons = [...new Set([...normalizationReasons(payload, elements, pageCount), ...extraReasons])];
    const requiresVisualReview = reviewReasons.length > 0;
    return {
        extractedText,
        elements,
        elementsTruncated: reviewReasons.includes('elements_truncated'),
        ocrModel: model,
        ocrMode: mode,
        pageCount,
        requiresVisualReview,
        reviewState: requiresVisualReview ? 'teacher_review' : 'ready_for_rubric_review',
        autoScoreAllowed: !requiresVisualReview,
        visualAnalysisStatus,
        reviewReasons,
    };
}

function configuredEnhancedModel() {
    const model = process.env.UPSTAGE_DOCUMENT_PARSE_ENHANCED_MODEL?.trim() ?? '';
    return /^[a-z0-9._:-]{1,100}$/i.test(model) ? model : '';
}

export async function parseDocument(file, { timeoutMs = 120000, visualAnalysis = false } = {}) {
    if (!process.env.UPSTAGE_API_KEY?.trim()) throw new UpstageDocumentError('missing_key', 503, 'Upstage API 키가 설정되지 않았습니다.');
    const standardPayload = await requestDocument(file, { model: STANDARD_MODEL, mode: 'standard', timeoutMs });
    if (!visualAnalysis) {
        return normalizeResult(standardPayload, { model: STANDARD_MODEL, mode: 'standard', visualAnalysisStatus: 'not_requested' });
    }
    const enhancedModel = configuredEnhancedModel();
    if (!enhancedModel) {
        return normalizeResult(standardPayload, {
            model: STANDARD_MODEL, mode: 'standard_reference', visualAnalysisStatus: 'enhanced_unavailable',
            extraReasons: ['enhanced_unavailable'],
        });
    }
    try {
        const enhancedPayload = await requestDocument(file, { model: enhancedModel, mode: 'enhanced', timeoutMs });
        return normalizeResult(enhancedPayload, { model: enhancedModel, mode: 'enhanced', visualAnalysisStatus: 'enhanced_used' });
    } catch (error) {
        if (!(error instanceof UpstageDocumentError)) throw error;
        return normalizeResult(standardPayload, {
            model: STANDARD_MODEL, mode: 'standard_reference', visualAnalysisStatus: 'enhanced_failed',
            extraReasons: ['enhanced_failed'],
        });
    }
}
