import { expect, test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildWorkflowPdf } from '@/lib/export/workflow-pdf';
import { makeAssessment, makeWorksheet } from './fixtures/workflow.mjs';

test('renders a Korean worksheet and separate teacher key without clipping below the page margin', async () => {
    const events = [];
    const bytes = await buildWorkflowPdf('worksheet', makeWorksheet(), { onDraw: event => events.push(event) });
    const pdf = await PDFDocument.load(bytes);

    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(events.some(event => event.text.includes('교사용 예시 답안'))).toBe(true);
    expect(events.every(event => event.y >= 44 && event.y <= 798)).toBe(true);
});

test('paginates a long assessment rubric into readable pages', async () => {
    const assessment = makeAssessment();
    assessment.rubric.criteria = Array.from({ length: 8 }, (_, index) => ({ ...assessment.rubric.criteria[index % 2], id: `criterion-${index + 1}`, maxPoints: index < 4 ? 13 : 12 }));
    const bytes = await buildWorkflowPdf('assessment', assessment);
    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
});

test('numbers teacher answers by question id even when answer entries arrive out of order', async () => {
    const worksheet = makeWorksheet();
    worksheet.teacherKey.answers.reverse();
    const events = [];
    await buildWorkflowPdf('worksheet', worksheet, { onDraw: event => events.push(event) });
    const texts = events.map(event => event.text);
    expect(texts.indexOf('1번 문항')).toBeLessThan(texts.indexOf('2번 문항'));
    expect(texts.indexOf(worksheet.teacherKey.answers.find(answer => answer.questionId === 'q-1').answer)).toBeLessThan(texts.indexOf(worksheet.teacherKey.answers.find(answer => answer.questionId === 'q-2').answer));
});
