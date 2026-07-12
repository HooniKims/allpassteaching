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

test('학생 표지만 내보내도 현재 루브릭 점수와 표지 섹션을 같은 렌더러로 포함한다', async () => {
    const assessment = makeAssessment();
    assessment.rubric.criteria[0].levels[0].score = 39;
    const events = [];

    const bytes = await buildWorkflowPdf('assessment-cover', assessment, { onDraw: event => events.push(event) });
    const pdf = await PDFDocument.load(bytes);
    const text = events.map(event => event.text).join('\n');

    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(text).toContain('평가 목표');
    expect(text).toContain('관찰 근거 · 40점');
    expect(text).toContain('탁월 · 39점');
    expect(text).not.toContain('교사용');
});

test('표지에서 루브릭을 숨겨도 전체 수행평가 PDF에는 채점 루브릭을 포함한다', async () => {
    const assessment = makeAssessment();
    assessment.cover.sections.find(section => section.type === 'rubric').visible = false;
    const events = [];

    await buildWorkflowPdf('assessment', assessment, { onDraw: event => events.push(event) });
    const text = events.map(event => event.text).join('\n');

    expect(text).toContain('4수준 분석적 루브릭 · 총 100점');
    expect(text).toContain('관찰 근거 · 40점');
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
