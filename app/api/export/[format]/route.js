import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { buildDocx } from '@/lib/export/docx';
import { buildHwpx } from '@/lib/export/hwpx';
import { buildSimpleHwpx } from '@/lib/export/simple-hwpx';
import { buildPdf } from '@/lib/export/pdf';

const exporters = { docx: { build: buildDocx, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, hwpx: { build: buildHwpx, type: 'application/hwp+zip' }, pdf: { build: buildPdf, type: 'application/pdf' } };
export const MAX_EXPORT_REQUEST_BYTES = 1_000_000;

const requestTooLarge = () => Response.json({
    code: 'request_too_large',
    message: '지도안 내용이 너무 깁니다. 내용을 줄인 뒤 다시 시도해주세요.',
}, { status: 413 });

export async function POST(request, { params }) {
    const { format } = await params; const exporter = exporters[format];
    if (!exporter) return Response.json({ code: 'unsupported_format' }, { status: 404 });
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_EXPORT_REQUEST_BYTES) return requestTooLarge();
    let body;
    try {
        body = await request.text();
    } catch {
        return Response.json({ code: 'invalid_request', message: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    if (new TextEncoder().encode(body).byteLength > MAX_EXPORT_REQUEST_BYTES) return requestTooLarge();
    let value;
    try {
        value = JSON.parse(body);
    } catch {
        return Response.json({ code: 'invalid_request', message: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const parsed = lessonPlanSchema.safeParse(value);
    if (!parsed.success) return Response.json({ code: 'invalid_plan', message: '지도안 입력 내용을 확인해주세요.', issues: parsed.error.issues }, { status: 400 });
    const searchParams = new URL(request.url).searchParams;
    const variant = searchParams.get('variant');
    const planVariant = searchParams.get('plan') === 'detailed' ? 'detailed' : 'brief';
    const build = format === 'hwpx' && variant === 'simple' ? buildSimpleHwpx : exporter.build;
    const bytes = await build(parsed.data, { variant: planVariant }); const filename = encodeURIComponent(`${parsed.data.title}-${planVariant === 'detailed' ? '세안' : '약안'}.${format}`);
    return new Response(bytes, { headers: { 'Content-Type': exporter.type, 'Content-Disposition': `attachment; filename*=UTF-8''${filename}` } });
}
