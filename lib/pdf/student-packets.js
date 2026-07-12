import { PDFDocument } from 'pdf-lib';
import { runWithConcurrency } from '../batch-queue.js';

export const MAX_SUBMISSION_FILES = 50;
export const MAX_INDIVIDUAL_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_COMBINED_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_COMBINED_PAGES = 300;

function pageRange(start, count) {
    return Array.from({ length: count }, (_, index) => start + index);
}

function positiveInteger(value, label) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label}는 1 이상의 정수여야 합니다.`);
    return parsed;
}

function ensureRoster(students) {
    if (!Array.isArray(students) || students.length === 0) throw new Error('먼저 학생 명단을 등록해주세요.');
    if (students.length > MAX_SUBMISSION_FILES) throw new Error(`학생 PDF는 최대 ${MAX_SUBMISSION_FILES}개까지 처리할 수 있습니다.`);
    const ids = new Set();
    for (const student of students) {
        if (!student?.id || ids.has(student.id)) throw new Error('학생 명단의 고유 ID를 확인해주세요.');
        ids.add(student.id);
    }
    return ids;
}

async function fileBytes(file) {
    if (typeof file?.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(new Uint8Array(reader.result)), { once: true });
        reader.addEventListener('error', () => reject(new Error(`${file?.name ?? '파일'}: 파일을 읽지 못했습니다.`)), { once: true });
        reader.readAsArrayBuffer(file);
    });
}

function signatureIsPdf(bytes) {
    return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
}

async function loadPdf(file, maxBytes) {
    if (!file || typeof file.size !== 'number') throw new Error('PDF 파일을 선택해주세요.');
    if (file.size > maxBytes) {
        const limit = maxBytes === MAX_COMBINED_PDF_BYTES ? '100MB' : '10MB';
        throw new Error(`${file.name}: ${limit} 이하 PDF만 처리할 수 있습니다.`);
    }
    const bytes = await fileBytes(file);
    if (!signatureIsPdf(bytes)) throw new Error(`${file.name}: 올바른 PDF 파일이 아닙니다.`);
    try {
        return { bytes, document: await PDFDocument.load(bytes) };
    } catch {
        throw new Error(`${file.name}: 손상되었거나 암호화된 PDF는 처리할 수 없습니다.`);
    }
}

function outputName(fileName, studentId, kind) {
    const base = String(fileName || 'submission.pdf').replace(/\.pdf$/i, '');
    return `${base}-${studentId}-${kind}.pdf`;
}

async function copyAsFile(source, pages, name) {
    const target = await PDFDocument.create();
    const copied = await target.copyPages(source, pages.map(page => page - 1));
    for (const page of copied) target.addPage(page);
    return new File([await target.save()], name, { type: 'application/pdf' });
}

async function mapPdfPackets(items, worker, options = {}) {
    const results = await runWithConcurrency(items, 2, worker, options.onProgress, { signal: options.signal });
    if (options.signal?.aborted) throw new DOMException('작업 취소', 'AbortError');
    const rejected = results.find(result => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    return results.map(result => result.value);
}

export function buildPacketMap({ students, answerPagesPerStudent, hasCoverPerStudent, actualPages }) {
    ensureRoster(students);
    const answerCount = positiveInteger(answerPagesPerStudent, '학생 1명당 답안 페이지 수');
    const pageCount = positiveInteger(actualPages, '실제 PDF 페이지 수');
    const packetSize = answerCount + (hasCoverPerStudent ? 1 : 0);
    const expectedPages = students.length * packetSize;
    if (pageCount !== expectedPages) {
        const completedPackets = Math.floor(Math.min(pageCount, expectedPages) / packetSize);
        const firstMismatch = Math.min(students.length, completedPackets + 1);
        throw new Error(`예상 ${expectedPages}쪽, 실제 ${pageCount}쪽입니다. ${firstMismatch}번째 학생 묶음부터 페이지를 확인해주세요.`);
    }
    return students.map((student, index) => {
        const start = index * packetSize + 1;
        const coverPages = hasCoverPerStudent ? [start] : [];
        const answerStart = start + coverPages.length;
        return {
            studentId: student.id,
            packetPages: pageRange(start, packetSize),
            coverPages,
            answerPages: pageRange(answerStart, answerCount),
        };
    });
}

export async function inspectCombinedPdf(file) {
    const loaded = await loadPdf(file, MAX_COMBINED_PDF_BYTES);
    const pageCount = loaded.document.getPageCount();
    if (pageCount > MAX_COMBINED_PAGES) throw new Error(`${file.name}: 합본 PDF는 최대 ${MAX_COMBINED_PAGES}쪽까지 처리할 수 있습니다.`);
    return pageCount;
}

export async function splitCombinedPdf(file, { students, answerPagesPerStudent, hasCoverPerStudent }, options = {}) {
    ensureRoster(students);
    const loaded = await loadPdf(file, MAX_COMBINED_PDF_BYTES);
    const pageCount = loaded.document.getPageCount();
    if (pageCount > MAX_COMBINED_PAGES) throw new Error(`${file.name}: 합본 PDF는 최대 ${MAX_COMBINED_PAGES}쪽까지 처리할 수 있습니다.`);
    const map = buildPacketMap({ students, answerPagesPerStudent, hasCoverPerStudent, actualPages: pageCount });
    return mapPdfPackets(map, async item => {
        const [packetFile, answerFile] = await Promise.all([
            copyAsFile(loaded.document, item.packetPages, outputName(file.name, item.studentId, 'packet')),
            copyAsFile(loaded.document, item.answerPages, outputName(file.name, item.studentId, 'answers')),
        ]);
        return { ...item, packetFile, answerFile };
    }, options);
}

export async function attachIndividualFiles(assignments, { students, hasCoverPerStudent }, options = {}) {
    const rosterIds = ensureRoster(students);
    if (!Array.isArray(assignments) || assignments.length === 0) throw new Error('학생별 PDF 파일을 선택해주세요.');
    if (assignments.length > MAX_SUBMISSION_FILES) throw new Error(`학생 PDF는 최대 ${MAX_SUBMISSION_FILES}개까지 처리할 수 있습니다.`);
    const linked = new Set();
    for (const assignment of assignments) {
        if (!rosterIds.has(assignment?.studentId)) throw new Error('모든 PDF를 학생 명단에 직접 연결해주세요.');
        if (linked.has(assignment.studentId)) throw new Error('한 학생에게 PDF를 두 번 연결할 수 없습니다.');
        linked.add(assignment.studentId);
        if (assignment.file?.size > MAX_INDIVIDUAL_PDF_BYTES) throw new Error(`${assignment.file.name}: 10MB 이하 PDF만 처리할 수 있습니다.`);
    }
    const loaded = await Promise.all(assignments.map(async assignment => ({
        ...assignment,
        ...(await loadPdf(assignment.file, MAX_INDIVIDUAL_PDF_BYTES)),
    })));
    return mapPdfPackets(loaded, async item => {
        const { name } = item.file;
        const pageCount = item.document.getPageCount();
        const coverPages = hasCoverPerStudent ? [1] : [];
        const answerPages = pageRange(coverPages.length + 1, pageCount - coverPages.length);
        if (!answerPages.length) throw new Error(`${name}: 표지를 제외한 답안이 1쪽 이상 있어야 합니다.`);
        const packetPages = pageRange(1, pageCount);
        const [packetFile, answerFile] = await Promise.all([
            copyAsFile(item.document, packetPages, outputName(name, item.studentId, 'packet')),
            copyAsFile(item.document, answerPages, outputName(name, item.studentId, 'answers')),
        ]);
        return { studentId: item.studentId, packetPages, coverPages, answerPages, packetFile, answerFile };
    }, options);
}
