import { worksheetOutputSchema } from '@/lib/worksheet-schema';
import { assessmentOutputSchema } from '@/lib/assessment-schema';
import { buildWorkflowPdf } from '@/lib/export/workflow-pdf';

const schemas = { worksheet: worksheetOutputSchema, assessment: assessmentOutputSchema, 'assessment-cover': assessmentOutputSchema };

export async function POST(request, context) {
    const { kind } = await context.params;
    const schema = schemas[kind];
    if (!schema) return Response.json({ code: 'not_found', message: '지원하지 않는 문서 종류입니다.' }, { status: 404 });
    let body;
    try { body = await request.json(); } catch { return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_document', message: 'PDF로 저장할 문서 내용을 확인해주세요.', issues: parsed.error.issues }, { status: 400 });
    const bytes = await buildWorkflowPdf(kind, parsed.data);
    return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="allpass-${kind}.pdf"`, 'Cache-Control': 'no-store' } });
}
