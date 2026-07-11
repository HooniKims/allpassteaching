export class UpstageDocumentError extends Error {
    constructor(code, status, message = code) { super(message); this.name = 'UpstageDocumentError'; this.code = code; this.status = status; }
}

function decodeEntities(value) {
    const entities = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
    return value.replace(/&([^;]+);/g, (match, name) => {
        if (entities[name] !== undefined) return entities[name];
        if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
        if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
        return match;
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

export function normalizeDocumentText(payload) {
    const primary = payload?.content?.text?.trim() || (payload?.content?.html ? htmlToText(payload.content.html) : '');
    if (primary) return primary;
    const values = (payload?.elements ?? []).map(element => element?.content?.text?.trim() || element?.text?.trim() || (element?.content?.html ? htmlToText(element.content.html) : '')).filter(Boolean);
    return [...new Set(values)].join('\n').trim();
}

export async function parseDocument(file, { timeoutMs = 120000 } = {}) {
    if (!process.env.UPSTAGE_API_KEY) throw new UpstageDocumentError('missing_key', 503, 'Upstage API 키가 설정되지 않았습니다.');
    const form = new FormData();
    form.set('document', file, 'submission.pdf');
    form.set('model', 'document-parse');
    form.set('ocr', 'force');
    let response;
    try {
        response = await fetch('https://api.upstage.ai/v1/document-digitization', { method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: { Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}` }, body: form });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') throw new UpstageDocumentError('timeout', 504, '문서 인식 시간이 초과되었습니다.');
        throw error;
    }
    if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new UpstageDocumentError(details.error?.code || 'upstream_error', response.status, details.error?.message || '문서 인식 요청에 실패했습니다.');
    }
    const payload = await response.json();
    const extractedText = normalizeDocumentText(payload);
    if (!extractedText) throw new UpstageDocumentError('empty_document', 422, '문서에서 읽을 수 있는 내용을 찾지 못했습니다.');
    if (extractedText.length > MAX_OCR_TEXT_LENGTH) throw new UpstageDocumentError('document_too_long', 422, '추출 내용이 너무 깁니다. PDF를 나누어 다시 업로드해주세요.');
    const pageCount = Number(payload.usage?.pages ?? payload.page_count ?? payload.pages?.length ?? 1);
    return { extractedText, ocrModel: 'document-parse', pageCount };
}
import { MAX_OCR_TEXT_LENGTH } from '../grading-schema.js';
