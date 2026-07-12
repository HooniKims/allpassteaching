import { parseDocument, UpstageDocumentError } from '@/lib/upstage/document-parse';
import { readBoundedRequestBytes } from '@/lib/api-request-boundary';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD = 64 * 1024;
const MAX_MULTIPART_REQUEST_SIZE = MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function json(body, status = 200) {
    return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function parseBooleanLike(value) {
    if (value === null) return { ok: true, value: false };
    if (typeof value !== 'string') return { ok: false };
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'on', 'yes'].includes(normalized)) return { ok: true, value: true };
    if (['false', '0', 'off', 'no', ''].includes(normalized)) return { ok: true, value: false };
    return { ok: false };
}

export async function POST(request) {
    const read = await readBoundedRequestBytes(request, MAX_MULTIPART_REQUEST_SIZE);
    if (!read.ok) {
        const status = read.reason === 'too_large' ? 413 : 400;
        const code = read.reason === 'too_large' ? 'request_too_large' : 'invalid_form';
        const message = read.reason === 'too_large' ? '업로드 요청이 너무 큽니다. PDF는 파일당 10MB 이하만 업로드할 수 있습니다.' : '업로드 형식을 확인해주세요.';
        return json({ code, message }, status);
    }
    const headers = new request.headers.constructor(request.headers);
    headers.delete('content-length');
    const bufferedRequest = new request.constructor(request.url, { method: 'POST', headers, body: read.bytes });
    let form;
    try {
        form = await bufferedRequest.formData();
    } catch {
        return json({ code: 'invalid_form', message: '업로드 형식을 확인해주세요.' }, 400);
    }
    const visualAnalysis = parseBooleanLike(form.get('visualAnalysis'));
    if (!visualAnalysis.ok) return json({ code: 'invalid_visual_analysis', message: '시각 답안 분석 설정을 확인해주세요.' }, 400);
    const file = form.get('document');
    if (!file || typeof file !== 'object' || typeof file.name !== 'string' || typeof file.size !== 'number') return json({ code: 'missing_document', message: 'PDF 파일을 선택해주세요.' }, 400);
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) return json({ code: 'unsupported_file', message: 'PDF 파일만 업로드할 수 있습니다.' }, 415);
    if (file.size > MAX_FILE_SIZE) return json({ code: 'file_too_large', message: 'PDF는 파일당 10MB 이하만 업로드할 수 있습니다.' }, 413);
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== '%PDF-') return json({ code: 'invalid_pdf', message: '올바른 PDF 파일인지 확인해주세요.' }, 415);
    try {
        return json(await parseDocument(file, { visualAnalysis: visualAnalysis.value }));
    } catch (error) {
        if (error instanceof UpstageDocumentError) return json({ code: error.code, message: error.message }, error.status);
        throw error;
    }
}
