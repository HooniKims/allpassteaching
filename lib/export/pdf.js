import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import { lessonPlanLines } from './render-model.js';

function wrap(text, font, size, maxWidth) {
    if (!text) return [''];
    const result = []; let line = '';
    for (const character of text) {
        if (font.widthOfTextAtSize(line + character, size) > maxWidth && line) { result.push(line); line = character; }
        else line += character;
    }
    if (line) result.push(line);
    return result;
}

export async function buildPdf(plan) {
    const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
    const fontRoot = path.join(process.cwd(), 'public/fonts/paperlogy');
    const [regularFile, boldFile] = await Promise.all([readFile(path.join(fontRoot, 'Paperlogy-4Regular.ttf')), readFile(path.join(fontRoot, 'Paperlogy-7Bold.ttf'))]);
    const regularBytes = Uint8Array.from(regularFile); const boldBytes = Uint8Array.from(boldFile);
    const [regular, bold] = await Promise.all([pdf.embedFont(regularBytes, { subset: true }), pdf.embedFont(boldBytes, { subset: true })]);
    const pageSize = [595.28, 841.89]; const margin = 52;
    let page = pdf.addPage(pageSize); let y = pageSize[1] - margin;
    const headings = new Set(['성취기준', '학습 목표', '과정중심평가', '개별화·지원 전략', '수업 후 성찰']);
    lessonPlanLines(plan).forEach((line, index) => {
        const isHeading = index === 0 || headings.has(line) || /^\d+차시/.test(line);
        const size = index === 0 ? 19 : isHeading ? 12 : 9.5; const activeFont = isHeading ? bold : regular; const gap = line === '' ? 10 : size + 5;
        for (const wrapped of wrap(line, activeFont, size, pageSize[0] - margin * 2)) {
            if (y < margin + 20) { page = pdf.addPage(pageSize); y = pageSize[1] - margin; }
            if (wrapped) page.drawText(wrapped, { x: margin, y, size, font: activeFont, color: rgb(0.12, 0.14, 0.13) });
            y -= gap;
        }
        if (!line) y -= 2;
    });
    return pdf.save();
}
