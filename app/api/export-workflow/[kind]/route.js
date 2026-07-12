import { worksheetOutputSchema } from '@/lib/worksheet-schema';
import { assessmentOutputSchema } from '@/lib/assessment-schema';
import { buildWorkflowPdf, CoverPageOverflowError } from '@/lib/export/workflow-pdf';

const schemas = { worksheet: worksheetOutputSchema, 'worksheet-student': worksheetOutputSchema, 'worksheet-teacher': worksheetOutputSchema, assessment: assessmentOutputSchema, 'assessment-cover': assessmentOutputSchema };
const MAX_WORKFLOW_EXPORT_REQUEST_BYTES = 500_000;

const requestTooLarge = () => Response.json({
    code: 'request_too_large',
    message: 'PDF로 저장할 내용이 너무 깁니다. 내용을 줄인 뒤 다시 시도해주세요.',
}, { status: 413 });

export async function POST(request, context) {
    const { kind } = await context.params;
    const schema = schemas[kind];
    if (!schema) return Response.json({ code: 'not_found', message: '지원하지 않는 문서 종류입니다.' }, { status: 404 });
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WORKFLOW_EXPORT_REQUEST_BYTES) return requestTooLarge();
    let body = '';
    try {
        const reader = request.body?.getReader();
        if (reader) {
            const decoder = new TextDecoder();
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
    const parsed = schema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_document', message: 'PDF로 저장할 문서 내용을 확인해주세요.', issues: parsed.error.issues }, { status: 400 });
    if (kind === 'assessment-cover' && !parsed.data.includeStudentCover) return Response.json({ code: 'cover_disabled', message: '학생당 안내 표지를 사용하지 않는 평가입니다.' }, { status: 409 });
    try {
        const bytes = await buildWorkflowPdf(kind, parsed.data);
        return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="allpass-${kind}.pdf"`, 'Cache-Control': 'no-store' } });
    } catch (error) {
        if (error instanceof CoverPageOverflowError) return Response.json({ code: 'cover_overflow', message: error.message }, { status: 422 });
        throw error;
    }
}
