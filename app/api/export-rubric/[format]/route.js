import { assessmentOutputSchema } from '@/lib/assessment-schema';
import { parseBoundedJsonRequest, requestBoundaryError } from '@/lib/api-request-boundary';
import { buildAssessmentRubricDocx, buildAssessmentRubricHwpx, buildAssessmentRubricXlsx } from '@/lib/export/assessment-rubric';
import { buildWorkflowPdf, WorkflowPdfLimitError } from '@/lib/export/workflow-pdf';

const MAX_RUBRIC_EXPORT_REQUEST_BYTES = 500_000;
const exporters = {
    pdf: { build: assessment => buildWorkflowPdf('assessment-rubric', assessment), type: 'application/pdf' },
    hwpx: { build: buildAssessmentRubricHwpx, type: 'application/hwp+zip' },
    docx: { build: buildAssessmentRubricDocx, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    xlsx: { build: buildAssessmentRubricXlsx, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};

const requestTooLarge = () => Response.json({
    code: 'request_too_large',
    message: '루브릭 내용이 너무 깁니다. 내용을 줄인 뒤 다시 시도해주세요.',
}, { status: 413 });
const documentTooLong = () => Response.json({
    code: 'document_too_long',
    message: '수행평가 문서 내용이 너무 깁니다. 평가영역 또는 설명을 줄인 뒤 다시 시도해주세요.',
}, { status: 422 });

export async function POST(request, { params }) {
    const { format } = await params;
    const exporter = Object.hasOwn(exporters, format) ? exporters[format] : null;
    if (!exporter) return Response.json({ code: 'unsupported_format', message: '지원하지 않는 루브릭 파일 형식입니다.' }, { status: 404 });
    const boundary = await parseBoundedJsonRequest(request, MAX_RUBRIC_EXPORT_REQUEST_BYTES);
    if (!boundary.ok) {
        if (boundary.reason === 'too_large') return requestTooLarge();
        const error = requestBoundaryError(boundary.reason);
        return Response.json(error.body, { status: error.status });
    }
    const parsed = assessmentOutputSchema.safeParse(boundary.value);
    if (!parsed.success) return Response.json({ code: 'invalid_assessment', message: '루브릭 내용을 확인해주세요.', issues: parsed.error.issues.slice(0, 20) }, { status: 400 });
    let bytes;
    try {
        bytes = await exporter.build(parsed.data);
    } catch (error) {
        if (error instanceof WorkflowPdfLimitError) return documentTooLong();
        throw error;
    }
    const filename = encodeRfc8187(`${rubricTitle(parsed.data)}.${format}`);
    return new Response(bytes, {
        headers: {
            'Content-Type': exporter.type,
            'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
            'Cache-Control': 'no-store',
        },
    });
}

function rubricTitle(assessment) {
    return `${assessment.assessmentName.toWellFormed().replace(/[\u0000-\u001F\u007F]/g, ' ').trim()} 루브릭`;
}

function encodeRfc8187(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
