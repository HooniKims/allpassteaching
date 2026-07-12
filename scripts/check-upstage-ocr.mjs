import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { parseDocument } from '../lib/upstage/document-parse.js';

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
const startedAt = performance.now();
const result = await parseDocument(file);
const categoryCounts = Object.fromEntries([...new Set(result.elements.map(element => element.category))]
    .sort()
    .map(category => [category, result.elements.filter(element => element.category === category).length]));
const summary = {
    status: result.extractedText.includes(sentinel) ? 'passed' : 'sentinel_missing',
    fixture: 'synthetic_non_student',
    ocrModel: result.ocrModel,
    ocrMode: result.ocrMode,
    elapsedMs: Math.round(performance.now() - startedAt),
    pageCount: result.pageCount,
    textLength: result.extractedText.length,
    elementCount: result.elements.length,
    categoryCounts,
    coordinateElementCount: result.elements.filter(element => element.coordinates.length > 0).length,
    confidenceElementCount: result.elements.filter(element => Number.isFinite(element.confidence)).length,
    elementsTruncated: result.elementsTruncated,
    requiresVisualReview: result.requiresVisualReview,
    reviewState: result.reviewState,
    enhancedConfigured: Boolean(process.env.UPSTAGE_DOCUMENT_PARSE_ENHANCED_MODEL?.trim()),
    sentinelMatched: result.extractedText.includes(sentinel),
};

console.log(JSON.stringify(summary));
if (!summary.sentinelMatched) process.exitCode = 2;
