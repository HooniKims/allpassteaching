import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { parseDocument } from '../lib/upstage/document-parse.js';
import { smokeContractsPassed, summarizeSmokeResult } from '../lib/upstage/smoke-contract.js';

if (!process.env.UPSTAGE_API_KEY?.trim()) {
    console.error('UPSTAGE API 키가 없어 OCR 스모크 테스트를 실행할 수 없습니다.');
    process.exit(1);
}

const sentinel = 'SYNTHETIC SCIENCE EVIDENCE';
const pdf = await PDFDocument.create();
const page = pdf.addPage([612, 792]);
const font = await pdf.embedFont(StandardFonts.Helvetica);
page.drawText(`${sentinel} - NO STUDENT DATA`, { x: 40, y: 740, size: 14, font });
page.drawText('Equation: x^2 = 4', { x: 40, y: 690, size: 12, font });
page.drawText('Line graph: observation count by trial', { x: 40, y: 640, size: 12, font });
page.drawLine({ start: { x: 60, y: 500 }, end: { x: 60, y: 620 }, thickness: 2, color: rgb(0, 0, 0) });
page.drawLine({ start: { x: 60, y: 500 }, end: { x: 240, y: 500 }, thickness: 2, color: rgb(0, 0, 0) });
page.drawLine({ start: { x: 70, y: 520 }, end: { x: 130, y: 560 }, thickness: 3, color: rgb(0.1, 0.4, 0.8) });
page.drawLine({ start: { x: 130, y: 560 }, end: { x: 220, y: 605 }, thickness: 3, color: rgb(0.1, 0.4, 0.8) });
const pdfBytes = await pdf.save();
const file = new File([pdfBytes], 'allpass-ocr-smoke.pdf', { type: 'application/pdf' });
const standardStartedAt = performance.now();
const standard = summarizeSmokeResult(await parseDocument(file), { elapsedMs: Math.round(performance.now() - standardStartedAt), sentinel });
const enhancedModel = process.env.UPSTAGE_DOCUMENT_PARSE_ENHANCED_MODEL?.trim();
let enhanced = { status: 'not_configured', fixture: 'synthetic_non_student' };
if (enhancedModel) {
    const enhancedStartedAt = performance.now();
    enhanced = summarizeSmokeResult(await parseDocument(file, { visualAnalysis: true }), { elapsedMs: Math.round(performance.now() - enhancedStartedAt), sentinel });
}
const summary = { standard, enhancedConfigured: Boolean(enhancedModel), enhanced };

console.log(JSON.stringify(summary));
if (!smokeContractsPassed({ standard, enhancedConfigured: Boolean(enhancedModel), enhanced })) process.exitCode = 2;
