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
    assessment.includeStudentCover = false;
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

    expect(pdf.getPageCount()).toBe(1);
    expect(text).toContain('과목');
    expect(text).toContain('관찰 근거');
    expect(text).toContain('총 40점');
    expect(text).toContain('탁월 · 39점');
    expect(text).not.toContain('교사용');
    expect(text).toContain('과목 · 과학');
    expect(text).toContain('상황 · 학교 화단 식물의 건강 상태를 설명해야 한다.');
    expect(text).toContain('□ 관찰 근거를 구체적으로 썼는가?');
    expect(text).not.toContain('• □');
});

test('학생 표지 루브릭은 평가영역 행과 성취수준 열을 가진 실제 표로 그린다', async () => {
    const assessment = makeAssessment();
    const events = [];

    const bytes = await buildWorkflowPdf('assessment-cover', assessment, { onDraw: event => events.push(event) });
    const pdf = await PDFDocument.load(bytes);
    const table = events.find(event => event.kind === 'cover-rubric-table');
    const cells = events.filter(event => event.kind === 'cover-rubric-cell');

    expect(pdf.getPageCount()).toBe(1);
    expect(table).toMatchObject({ rowCount: assessment.rubric.criteria.length + 1, columnCount: assessment.rubric.levels.length + 1 });
    expect(cells).toHaveLength(table.rowCount * table.columnCount);
    for (const [criterionIndex, criterion] of assessment.rubric.criteria.entries()) {
        for (const [levelIndex, level] of assessment.rubric.levels.entries()) {
            expect(cells).toContainEqual(expect.objectContaining({
                rowIndex: criterionIndex + 1,
                columnIndex: levelIndex + 1,
                criterionId: criterion.id,
                levelId: level.id,
                text: `${level.label} · ${criterion.levels[levelIndex].score}점\n${criterion.levels[levelIndex].description}`,
            }));
        }
    }
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

test('학생 표지를 끈 전체본은 표지 없이 과제부터 시작하고 표지만 생성할 수 없다', async () => {
    const assessment = makeAssessment(); assessment.includeStudentCover = false;
    const events = [];

    const bytes = await buildWorkflowPdf('assessment', assessment, { onDraw: event => events.push(event) });
    const pdf = await PDFDocument.load(bytes);

    expect(events[0].text).toBe(assessment.task.title);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    await expect(buildWorkflowPdf('assessment-cover', assessment)).rejects.toThrow(/표지/);
});

test('지원하는 최대 15개 영역·6수준 표지가 한 페이지를 넘으면 명시적으로 실패한다', async () => {
    const assessment = makeAssessment();
    assessment.totalPoints = 150;
    assessment.scoring = { includeProcessInScore: false, processWeightPercent: 0, processTargetPoints: 0 };
    assessment.rubric.levels = Array.from({ length: 6 }, (_, index) => ({ id: `level-${index + 1}`, label: `${index + 1}수준` }));
    assessment.rubric.criteria = Array.from({ length: 15 }, (_, index) => ({
        id: `criterion-${index + 1}`, name: `평가영역 ${index + 1}`, description: '관찰 가능한 성취', standardCodes: ['6과11-02'], kind: 'outcome', maxPoints: 10, intervalPoints: 1, evidence: `증거 ${index + 1}`,
        levels: assessment.rubric.levels.map((level, levelIndex) => ({ levelId: level.id, score: 10 - levelIndex, description: `수행 수준 ${levelIndex + 1}` })),
    }));
    await expect(buildWorkflowPdf('assessment-cover', assessment)).rejects.toThrow(/한 페이지/);

    assessment.rubric.criteria = assessment.rubric.criteria.slice(0, 3);
    assessment.cover.sections.push({ id: 'too-long', type: 'custom', label: '추가 안내', content: '아주 긴 안내 문장 '.repeat(900), visible: true, order: 9 });
    await expect(buildWorkflowPdf('assessment-cover', assessment)).rejects.toThrow(/한 페이지/);
});

test('학생 표지 PDF는 교사가 정한 섹션 순서·라벨·내용과 모든 수준 설명을 그대로 따른다', async () => {
    const assessment = makeAssessment();
    const subject = assessment.cover.sections.find(section => section.type === 'subject');
    subject.label = '교사가 바꾼 과목 안내';
    subject.content = '교사가 덧붙인 과목 설명';
    const rubric = assessment.cover.sections.find(section => section.type === 'rubric');
    rubric.label = '교사가 바꾼 평가표';
    rubric.order = 1;
    assessment.cover.sections.filter(section => section !== rubric).forEach(section => { section.order += 1; });
    const events = [];

    await buildWorkflowPdf('assessment-cover', assessment, { onDraw: event => events.push(event) });
    const texts = events.map(event => event.text);
    const text = texts.join('\n');

    expect(texts.indexOf('교사가 바꾼 평가표')).toBeLessThan(texts.indexOf('교사가 바꾼 과목 안내'));
    expect(texts).toContain('교사가 덧붙인 과목 설명');
    expect(text).toContain('모든 기관을 구체적으로 기록함');
    expect(text).toContain('관찰 기록이 매우 제한적임');
});
