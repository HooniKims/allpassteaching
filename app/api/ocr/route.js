import { parseDocument, UpstageDocumentError } from '@/lib/upstage/document-parse';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request) {
    let form;
    try { form = await request.formData(); } catch { return Response.json({ code: 'invalid_form', message: '업로드 형식을 확인해주세요.' }, { status: 400 }); }
    const file = form.get('document');
    if (!file || typeof file !== 'object' || typeof file.name !== 'string' || typeof file.size !== 'number') return Response.json({ code: 'missing_document', message: 'PDF 파일을 선택해주세요.' }, { status: 400 });
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) return Response.json({ code: 'unsupported_file', message: 'PDF 파일만 업로드할 수 있습니다.' }, { status: 415 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ code: 'file_too_large', message: 'PDF는 파일당 10MB 이하만 업로드할 수 있습니다.' }, { status: 413 });
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== '%PDF-') return Response.json({ code: 'invalid_pdf', message: '올바른 PDF 파일인지 확인해주세요.' }, { status: 415 });
    try { return Response.json(await parseDocument(file), { headers: { 'Cache-Control': 'no-store' } }); }
    catch (error) {
        if (error instanceof UpstageDocumentError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
