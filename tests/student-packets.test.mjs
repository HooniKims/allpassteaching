import { expect, test } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
    attachIndividualFiles,
    buildPacketMap,
    inspectCombinedPdf,
    MAX_COMBINED_PDF_BYTES,
    MAX_INDIVIDUAL_PDF_BYTES,
    splitCombinedPdf,
} from '@/lib/pdf/student-packets.js';

function roster(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: `student-${index + 1}`,
        grade: '2',
        className: '3',
        number: index + 1,
        name: `학생${index + 1}`,
    }));
}

async function pdfFile(pageLabels, name = '학생묶음.pdf') {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (const label of pageLabels) {
        const page = document.addPage([300, 400]);
        page.drawText(label, { x: 32, y: 340, size: 18, font });
    }
    return new File([await document.save()], name, { type: 'application/pdf' });
}

test('Given two students with a cover and two answers When mapping Then cover and answer ranges are exact', () => {
    const students = roster(2);

    const result = buildPacketMap({ students, answerPagesPerStudent: 2, hasCoverPerStudent: true, actualPages: 6 });

    expect(result).toEqual([
        { studentId: 'student-1', packetPages: [1, 2, 3], coverPages: [1], answerPages: [2, 3] },
        { studentId: 'student-2', packetPages: [4, 5, 6], coverPages: [4], answerPages: [5, 6] },
    ]);
});

test('Given a combined PDF with one missing page When mapping Then it rejects before any split', () => {
    const action = () => buildPacketMap({ students: roster(2), answerPagesPerStudent: 2, hasCoverPerStudent: true, actualPages: 5 });

    expect(action).toThrow('예상 6쪽, 실제 5쪽');
});

test('Given an actual six-page combined PDF When splitting Then packet copies include covers and OCR copies exclude them', async () => {
    const file = await pdfFile(['cover-1', 'answer-1a', 'answer-1b', 'cover-2', 'answer-2a', 'answer-2b']);

    const result = await splitCombinedPdf(file, { students: roster(2), answerPagesPerStudent: 2, hasCoverPerStudent: true });

    expect(result).toHaveLength(2);
    expect(result.map(item => ({ studentId: item.studentId, packetPages: item.packetPages, coverPages: item.coverPages, answerPages: item.answerPages }))).toEqual([
        { studentId: 'student-1', packetPages: [1, 2, 3], coverPages: [1], answerPages: [2, 3] },
        { studentId: 'student-2', packetPages: [4, 5, 6], coverPages: [4], answerPages: [5, 6] },
    ]);
    expect((await PDFDocument.load(await result[0].packetFile.arrayBuffer())).getPageCount()).toBe(3);
    expect((await PDFDocument.load(await result[0].answerFile.arrayBuffer())).getPageCount()).toBe(2);
    expect((await PDFDocument.load(await result[1].packetFile.arrayBuffer())).getPageCount()).toBe(3);
    expect((await PDFDocument.load(await result[1].answerFile.arrayBuffer())).getPageCount()).toBe(2);
});

test('Given individual PDFs with first-page covers When attaching Then every OCR copy starts after its cover', async () => {
    const students = roster(2);
    const assignments = [
        { studentId: students[0].id, file: await pdfFile(['cover-1', 'answer-1'], 'one.pdf') },
        { studentId: students[1].id, file: await pdfFile(['cover-2', 'answer-2'], 'two.pdf') },
    ];

    const result = await attachIndividualFiles(assignments, { students, hasCoverPerStudent: true });

    expect(result.map(item => ({ studentId: item.studentId, packetPages: item.packetPages, coverPages: item.coverPages, answerPages: item.answerPages }))).toEqual([
        { studentId: 'student-1', packetPages: [1, 2], coverPages: [1], answerPages: [2] },
        { studentId: 'student-2', packetPages: [1, 2], coverPages: [1], answerPages: [2] },
    ]);
    expect((await PDFDocument.load(await result[0].answerFile.arrayBuffer())).getPageCount()).toBe(1);
    expect((await PDFDocument.load(await result[1].answerFile.arrayBuffer())).getPageCount()).toBe(1);
});

test('Given a non-PDF signature When attaching Then the whole batch is rejected atomically', async () => {
    const students = roster(2);
    const assignments = [
        { studentId: students[0].id, file: await pdfFile(['answer'], 'good.pdf') },
        { studentId: students[1].id, file: new File(['not a PDF'], 'bad.pdf', { type: 'application/pdf' }) },
    ];

    await expect(attachIndividualFiles(assignments, { students, hasCoverPerStudent: false })).rejects.toThrow('bad.pdf: 올바른 PDF 파일이 아닙니다.');
    expect(assignments).toHaveLength(2);
});

test('Given duplicate links When attaching Then no student receives a partial packet', async () => {
    const students = roster(2);
    const assignments = [
        { studentId: students[0].id, file: await pdfFile(['answer-a'], 'a.pdf') },
        { studentId: students[0].id, file: await pdfFile(['answer-b'], 'b.pdf') },
    ];

    await expect(attachIndividualFiles(assignments, { students, hasCoverPerStudent: false })).rejects.toThrow('한 학생에게 PDF를 두 번 연결할 수 없습니다.');
});

test('Given an individual PDF over 10MB When attaching Then it is rejected before reading bytes', async () => {
    const file = new File(['%PDF-'], 'oversized.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: MAX_INDIVIDUAL_PDF_BYTES + 1 });

    await expect(attachIndividualFiles([{ studentId: 'student-1', file }], { students: roster(1), hasCoverPerStudent: false })).rejects.toThrow('10MB 이하');
});

test('Given a combined PDF over 100MB When inspecting Then it is rejected before reading bytes', async () => {
    const file = new File(['%PDF-'], 'oversized-combined.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: MAX_COMBINED_PDF_BYTES + 1 });

    await expect(inspectCombinedPdf(file)).rejects.toThrow('100MB 이하');
});

test('Given a combined PDF over 300 pages When inspecting Then it is rejected before mapping', async () => {
    const document = await PDFDocument.create();
    for (let index = 0; index < 301; index += 1) document.addPage([20, 20]);
    const file = new File([await document.save()], '301-pages.pdf', { type: 'application/pdf' });

    await expect(inspectCombinedPdf(file)).rejects.toThrow('최대 300쪽');
});
