import { expect, test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildWorkflowPdf } from '@/lib/export/workflow-pdf';
import { makeAssessment, makeWorksheet } from './fixtures/workflow.mjs';

async function pageTexts(bytes) {
    const document = await getDocument({ data: Uint8Array.from(bytes), disableWorker: true }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str).join(' '));
    }
    return pages;
}

test('renders a Korean worksheet and separate teacher key without clipping below the page margin', async () => {
    const events = [];
    const bytes = await buildWorkflowPdf('worksheet', makeWorksheet(), { onDraw: event => events.push(event) });
    const pdf = await PDFDocument.load(bytes);

    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(events.some(event => event.text?.includes('교사용 예시 답안'))).toBe(true);
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

test('renders separate student and teacher worksheet PDFs with type-specific response areas', async () => {
    const worksheet = makeWorksheet();
    worksheet.generationRequest.questionTypes = ['multiple-choice-5', 'table-chart', 'drawing-diagram'];
    worksheet.document.sections[0].questions = [
        { id: 'q-choice', type: 'multiple-choice-5', prompt: '옳은 설명을 고르세요.', choices: ['하나', '둘', '셋', '넷', '다섯'], responseLines: 1, standardCodes: ['6과11-02'] },
        { id: 'q-chart', type: 'table-chart', prompt: '관찰 결과를 표로 나타내세요.', responseAreaHeight: 160, standardCodes: ['6과11-02'] },
        { id: 'q-drawing', type: 'drawing-diagram', prompt: '식물의 구조를 그리고 표시하세요.', responseAreaHeight: 200, standardCodes: ['6과11-02'] },
    ];
    worksheet.document.sections = [worksheet.document.sections[0]];
    worksheet.teacherKey.answers = worksheet.document.sections[0].questions.map(question => ({ questionId: question.id, answer: `${question.type} 예시 답안` }));
    const studentEvents = [];
    const teacherEvents = [];

    const studentBytes = await buildWorkflowPdf('worksheet-student', worksheet, { onDraw: event => studentEvents.push(event) });
    const teacherBytes = await buildWorkflowPdf('worksheet-teacher', worksheet, { onDraw: event => teacherEvents.push(event) });

    expect((await PDFDocument.load(studentBytes)).getPageCount()).toBeGreaterThanOrEqual(1);
    expect((await PDFDocument.load(teacherBytes)).getPageCount()).toBeGreaterThanOrEqual(2);
    expect(studentEvents.some(event => event.text?.includes('교사용 예시 답안'))).toBe(false);
    expect(teacherEvents.some(event => event.text?.includes('교사용 예시 답안'))).toBe(true);
    expect(studentEvents.filter(event => event.kind === 'worksheet-choice')).toHaveLength(5);
    expect(studentEvents.filter(event => event.kind === 'worksheet-response-box').map(event => event.questionType)).toEqual(['table-chart', 'drawing-diagram']);
});

test('Given a full mixed worksheet When PDF pages break Then no page contains only response lines or answer fragments', async () => {
    const worksheet = makeWorksheet();
    const questionTypes = [
        'blank', 'short-answer', 'descriptive', 'essay', 'true-false',
        'multiple-choice-5', 'table-chart', 'drawing-diagram', 'experiment-record', 'self-assessment',
    ];
    worksheet.document.sections = [{
        id: 'all-types', title: '열 가지 문항 유형', purpose: '다양한 응답 방식으로 성취기준을 확인합니다.',
        questions: questionTypes.map((type, index) => {
            const common = { id: `q-${index + 1}`, type, prompt: `${type} 문항에 답하세요.`, standardCodes: ['6과11-02'] };
            if (type === 'multiple-choice-5') return { ...common, choices: ['하나', '둘', '셋', '넷', '다섯'], responseLines: 1 };
            if (type === 'table-chart' || type === 'drawing-diagram') return { ...common, responseAreaHeight: 180 };
            return { ...common, responseLines: type === 'essay' ? 10 : 4 };
        }),
    }];
    worksheet.teacherKey.answers = worksheet.document.sections[0].questions.map((question, index) => ({
        questionId: question.id,
        answer: index === 9 ? '마지막 문항의 상세한 예시 답안과 채점 근거를 이어서 설명합니다. '.repeat(90) : `${question.type} 교사용 예시 답안`,
    }));

    const [studentPages, teacherPages] = await Promise.all([
        buildWorkflowPdf('worksheet-student', worksheet).then(pageTexts),
        buildWorkflowPdf('worksheet-teacher', worksheet).then(pageTexts),
    ]);
    const teacherStart = teacherPages.findIndex(page => page.includes('교사용 예시 답안'));

    expect(studentPages.every(page => page.trim().length > 0)).toBe(true);
    expect(studentPages.at(-1)).toMatch(/10\. self-assessment.*성취기준/s);
    expect(teacherPages.slice(0, teacherStart).every(page => page.trim().length > 0)).toBe(true);
    expect(teacherPages.slice(teacherStart).every(page => /번 문항/.test(page))).toBe(true);
    expect(studentPages.join('\n')).not.toContain('교사용 예시 답안');
});

test('Given an oversized teacher answer near a page boundary When the next answer starts Then its heading keeps answer text on the same page', async () => {
    const worksheet = makeWorksheet();
    const questions = worksheet.document.sections.flatMap(section => section.questions).slice(0, 2);
    worksheet.document.sections = [{ ...worksheet.document.sections[0], questions }];
    worksheet.teacherKey.answers = [
        { questionId: 'q-1', answer: '앞선 답안 문장입니다. '.repeat(232) },
        { questionId: 'q-2', answer: '아주 긴 두 번째 답안입니다. '.repeat(204) },
    ];
    const events = [];

    await buildWorkflowPdf('worksheet-teacher', worksheet, { onDraw: event => events.push(event) });

    const headingIndex = events.findIndex(event => event.text === '2번 문항');
    const heading = events[headingIndex];
    const nextEvent = events[headingIndex + 1];
    const teacherTitle = events.find(event => event.text?.includes('교사용 예시 답안'));
    const firstHeading = events.find(event => event.text === '1번 문항');
    expect(firstHeading.pageIndex).toBe(teacherTitle.pageIndex);
    expect(nextEvent).toMatchObject({ pageIndex: heading.pageIndex });
    expect(nextEvent.text).not.toMatch(/번 문항/);
});

test('Given an oversized first teacher answer When the key starts Then the key title is not left on its own page', async () => {
    const worksheet = makeWorksheet();
    worksheet.document.sections = [{ ...worksheet.document.sections[0], questions: worksheet.document.sections[0].questions.slice(0, 1) }];
    worksheet.teacherKey.answers = [{ questionId: 'q-1', answer: '첫 문항 장문 답안입니다. '.repeat(225) }];
    const events = [];

    await buildWorkflowPdf('worksheet-teacher', worksheet, { onDraw: event => events.push(event) });

    const teacherTitle = events.find(event => event.text?.includes('교사용 예시 답안'));
    const firstHeading = events.find(event => event.text === '1번 문항');
    expect(firstHeading.pageIndex).toBe(teacherTitle.pageIndex);
});

test('Given a response that exactly fits When a question renders Then its stem and response stay on the same page', async () => {
    const worksheet = makeWorksheet();
    worksheet.document.sections = [{
        ...worksheet.document.sections[0],
        questions: [
            { id: 'q-1', type: 'descriptive', prompt: '첫 페이지 채우기', responseLines: 16, standardCodes: ['6과11-02'] },
            { id: 'q-2', type: 'table-chart', prompt: '둘째 페이지 첫 상자', responseAreaHeight: 258, standardCodes: ['6과11-02'] },
            { id: 'q-3', type: 'drawing-diagram', prompt: '둘째 페이지 둘째 상자', responseAreaHeight: 293, standardCodes: ['6과11-02'] },
            { id: 'q-4', type: 'descriptive', prompt: '정확히 맞는 네 줄 응답', responseLines: 4, standardCodes: ['6과11-02'] },
        ],
    }];
    worksheet.teacherKey.answers = worksheet.document.sections[0].questions.map(question => ({ questionId: question.id, answer: '예시 답안' }));
    const events = [];

    await buildWorkflowPdf('worksheet-student', worksheet, { onDraw: event => events.push(event) });

    const precedingBox = events.find(event => event.kind === 'worksheet-response-box' && event.questionId === 'q-3');
    const exactPrompt = events.find(event => event.text === '4. 정확히 맞는 네 줄 응답');
    expect(exactPrompt.y).toBeCloseTo(159, 5);
    expect(exactPrompt.pageIndex).toBe(precedingBox.pageIndex);
    expect(events.some(event => event.text === '4번 문항 응답 (계속)')).toBe(false);
});

test('Given maximum student fields When instructions render Then the instruction block starts on a page with safe margin', async () => {
    const worksheet = makeWorksheet();
    worksheet.document.studentFields = Array.from({ length: 8 }, (_, index) => `${index + 1}번 학생 정보 ${'가'.repeat(280)}`);
    worksheet.document.instructions = '관찰한 사실과 생각을 구분하여 기록하세요.';
    const events = [];

    await buildWorkflowPdf('worksheet-student', worksheet, { onDraw: event => events.push(event) });

    const instructionIndex = events.findIndex(event => event.text === worksheet.document.instructions);
    const instruction = events[instructionIndex];
    const box = events.find(event => event.kind === 'worksheet-instructions-box');
    const firstSectionHeading = events.find(event => event.text === worksheet.document.sections[0].title);
    expect(box).toMatchObject({ pageIndex: instruction.pageIndex });
    expect(box.y).toBeGreaterThanOrEqual(48);
    expect(instruction.y).toBeGreaterThanOrEqual(48);
    expect(firstSectionHeading.y).toBeLessThan(box.y);
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
