import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { buildDocx } from '@/lib/export/docx';
import { buildHwpx } from '@/lib/export/hwpx';
import { buildPdf } from '@/lib/export/pdf';

const exporters = { docx: { build: buildDocx, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, hwpx: { build: buildHwpx, type: 'application/hwp+zip' }, pdf: { build: buildPdf, type: 'application/pdf' } };
export async function POST(request, { params }) {
    const { format } = await params; const exporter = exporters[format];
    if (!exporter) return Response.json({ code: 'unsupported_format' }, { status: 404 });
    const parsed = lessonPlanSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ code: 'invalid_plan', issues: parsed.error.issues }, { status: 400 });
    const bytes = await exporter.build(parsed.data); const filename = encodeURIComponent(`${parsed.data.title}.${format}`);
    return new Response(bytes, { headers: { 'Content-Type': exporter.type, 'Content-Disposition': `attachment; filename*=UTF-8''${filename}` } });
}
