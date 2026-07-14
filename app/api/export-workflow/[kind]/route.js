import { worksheetOutputSchema } from '@/lib/worksheet-schema';
import { assessmentOutputSchema, assessmentRenderBudgetExceeded } from '@/lib/assessment-schema';
import { buildWorkflowPdf, CoverPageOverflowError, WorkflowPdfLimitError } from '@/lib/export/workflow-pdf';
import { buildWorkflowHwpx } from '@/lib/export/workflow-hwpx';
import { upgradeAssessmentStudentSheet } from '@/lib/assessment-student-sheet';

const schemas = { worksheet: worksheetOutputSchema, 'worksheet-student': worksheetOutputSchema, 'worksheet-teacher': worksheetOutputSchema, assessment: assessmentOutputSchema, 'assessment-cover': assessmentOutputSchema, 'assessment-sheet': assessmentOutputSchema };
const formats = {
    pdf: { build: buildWorkflowPdf, contentType: 'application/pdf' },
    hwpx: { build: buildWorkflowHwpx, contentType: 'application/hwp+zip' },
};
const MAX_WORKFLOW_EXPORT_REQUEST_BYTES = 500_000;
const MAX_JSON_ARRAY_ITEMS = 100;
const MAX_JSON_OBJECT_KEYS = 100;
const MAX_JSON_NODES = 10_000;
const MAX_VALIDATION_ISSUES = 20;

function jsonStructureTooLarge(value) {
    const pending = [value];
    let visited = 0;
    while (pending.length) {
        const item = pending.pop();
        visited += 1;
        if (visited > MAX_JSON_NODES) return true;
        if (Array.isArray(item)) {
            if (item.length > MAX_JSON_ARRAY_ITEMS) return true;
            for (const child of item) pending.push(child);
        } else if (item && typeof item === 'object') {
            const values = Object.values(item);
            if (values.length > MAX_JSON_OBJECT_KEYS) return true;
            for (const child of values) pending.push(child);
        }
    }
    return false;
}

const requestTooLarge = () => Response.json({
    code: 'request_too_large',
    message: '저장할 문서 내용이 너무 깁니다. 내용을 줄인 뒤 다시 시도해주세요.',
}, { status: 413 });
const assessmentTooLong = () => Response.json({
    code: 'document_too_long',
    message: '수행평가 문서 내용이 너무 깁니다. 평가영역 또는 설명을 줄인 뒤 다시 시도해주세요.',
}, { status: 422 });

export async function POST(request, context) {
    const { kind } = await context.params;
    const schema = Object.hasOwn(schemas, kind) ? schemas[kind] : null;
    const format = new URL(request.url).searchParams.get('format') ?? 'pdf';
    const exporter = Object.hasOwn(formats, format) ? formats[format] : null;
    if (!schema) return Response.json({ code: 'not_found', message: '지원하지 않는 문서 종류입니다.' }, { status: 404 });
    if (!exporter) return Response.json({ code: 'unsupported_format', message: '지원하지 않는 파일 형식입니다.' }, { status: 404 });
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WORKFLOW_EXPORT_REQUEST_BYTES) return requestTooLarge();
    let body = '';
    try {
        const reader = request.body?.getReader();
        if (reader) {
            const decoder = new TextDecoder('utf-8', { fatal: true });
            let receivedBytes = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                receivedBytes += value.byteLength;
                if (receivedBytes > MAX_WORKFLOW_EXPORT_REQUEST_BYTES) {
                    await reader.cancel();
                    return requestTooLarge();
                }
                body += decoder.decode(value, { stream: true });
            }
            body += decoder.decode();
        }
    } catch { return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    try { body = JSON.parse(body); } catch { return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    if (jsonStructureTooLarge(body)) return Response.json({ code: 'invalid_document', message: '저장할 문서 구조가 너무 큽니다. 항목 수를 줄여주세요.' }, { status: 400 });
    const parsed = schema.safeParse(kind.startsWith('assessment') ? upgradeAssessmentStudentSheet(body) : body);
    if (!parsed.success) {
        const onlyRenderBudgetIssue = parsed.error.issues.every(issue => issue.path.length === 0 && issue.message.includes('PDF 전체 글자 수'));
        const renderBudgetIssue = kind.startsWith('assessment') && onlyRenderBudgetIssue && assessmentRenderBudgetExceeded(body);
        if (renderBudgetIssue) return assessmentTooLong();
        return Response.json({ code: 'invalid_document', message: '저장할 문서 내용을 확인해주세요.', issues: parsed.error.issues.slice(0, MAX_VALIDATION_ISSUES) }, { status: 400 });
    }
    if (kind === 'assessment-cover' && !parsed.data.includeStudentCover) return Response.json({ code: 'cover_disabled', message: '학생당 안내 표지를 사용하지 않는 평가입니다.' }, { status: 409 });
    try {
        const bytes = await exporter.build(kind, parsed.data);
        return new Response(bytes, { status: 200, headers: { 'Content-Type': exporter.contentType, 'Content-Disposition': `attachment; filename="allpass-${kind}.${format}"`, 'Cache-Control': 'no-store' } });
    } catch (error) {
        if (error instanceof CoverPageOverflowError) return Response.json({ code: 'cover_overflow', message: error.message }, { status: 422 });
        if (error instanceof WorkflowPdfLimitError) return assessmentTooLong();
        throw error;
    }
}
