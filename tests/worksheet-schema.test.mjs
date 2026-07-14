import { expect, test } from 'vitest';
import { worksheetGenerationRequestSchema, worksheetOutputSchema, worksheetQuestionTypes } from '@/lib/worksheet-schema';
import { makeWorksheet } from './fixtures/workflow.mjs';

const MAX_WORKSHEET_RENDER_CHARACTERS = 120_000;
test('accepts an editable worksheet with a separate teacher key', () => {
    expect(worksheetOutputSchema.safeParse(makeWorksheet()).success).toBe(true);
});

test('rejects an answer key that references a missing question', () => {
    const worksheet = makeWorksheet();
    worksheet.teacherKey.answers[0].questionId = 'missing';
    expect(worksheetOutputSchema.safeParse(worksheet).success).toBe(false);
});

test('rejects duplicate question and answer ids', () => {
    const worksheet = makeWorksheet();
    worksheet.document.sections[1].questions[0].id = 'q-1';
    worksheet.teacherKey.answers[1].questionId = 'q-1';
    expect(worksheetOutputSchema.safeParse(worksheet).success).toBe(false);
});

test('accepts all ten teacher-approved worksheet question types', () => {
    // Given
    const worksheet = makeWorksheet();
    const questions = [
        { type: 'blank', responseLines: 2 },
        { type: 'short-answer', responseLines: 2 },
        { type: 'descriptive', responseLines: 4 },
        { type: 'essay', responseLines: 12 },
        { type: 'true-false', responseLines: 1 },
        { type: 'multiple-choice-5', responseLines: 1, choices: ['선택 1', '선택 2', '선택 3', '선택 4', '선택 5'] },
        { type: 'table-chart', responseAreaHeight: 180 },
        { type: 'drawing-diagram', responseAreaHeight: 220 },
        { type: 'experiment-record', responseLines: 8 },
        { type: 'self-assessment', responseLines: 5 },
    ].map((shape, index) => ({ id: `type-${index + 1}`, prompt: `${shape.type} 문항`, standardCodes: ['6과11-02'], ...shape }));
    worksheet.document.sections = [{ id: 'section-types', title: '문항 유형', purpose: '유형별 응답', questions }];
    worksheet.teacherKey.answers = questions.map(question => ({ questionId: question.id, answer: `${question.type} 예시 답안` }));

    // When
    const result = worksheetOutputSchema.safeParse(worksheet);

    // Then
    expect(worksheetQuestionTypes).toHaveLength(10);
    expect(result.success).toBe(true);
});

test('rejects malformed five-choice questions before export', () => {
    // Given
    const worksheet = makeWorksheet();
    worksheet.document.sections[0].questions[0] = {
        id: 'q-choice', type: 'multiple-choice-5', prompt: '옳은 설명을 고르세요.',
        choices: ['하나', '둘', '셋', '넷'], responseLines: 1, standardCodes: ['6과11-02'],
    };
    worksheet.teacherKey.answers[0].questionId = 'q-choice';

    // When
    const result = worksheetOutputSchema.safeParse(worksheet);

    // Then
    expect(result.success).toBe(false);
    expect(result.error.issues.some(issue => issue.path.includes('choices'))).toBe(true);
});

test('rejects unknown question types, unknown standards, and orphan teacher answers', () => {
    const unknownType = makeWorksheet();
    unknownType.document.sections[0].questions[0].type = 'ranking';
    const unknownStandard = makeWorksheet();
    unknownStandard.document.sections[0].questions[0].standardCodes = ['6과99-99'];
    const orphanAnswer = makeWorksheet();
    orphanAnswer.teacherKey.answers.push({ questionId: 'missing-question', answer: '연결되지 않은 답안' });

    expect(worksheetOutputSchema.safeParse(unknownType).success).toBe(false);
    expect(worksheetOutputSchema.safeParse(unknownStandard).success).toBe(false);
    expect(worksheetOutputSchema.safeParse(orphanAnswer).success).toBe(false);
});

test('rejects a worksheet when a selected achievement standard is not linked to any question', () => {
    // Given
    const worksheet = makeWorksheet();
    worksheet.standards.push({ code: '6수04-02', text: '자료를 수집하여 그래프로 나타내고 해석할 수 있다.', subject: '수학' });

    // When
    const result = worksheetOutputSchema.safeParse(worksheet);

    // Then
    expect(result.success).toBe(false);
    expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ['standards'], message: expect.stringContaining('6수04-02') }),
    ]));
});

test('validates free-text worksheet generation requests with selected question types', () => {
    const result = worksheetGenerationRequestSchema.safeParse({
        additionalRequirements: '표를 읽고 근거를 쓰는 문항을 포함해 주세요.',
        questionTypes: ['multiple-choice-5', 'table-chart'],
    });

    expect(result.success).toBe(true);
    expect(worksheetGenerationRequestSchema.safeParse({ additionalRequirements: '', questionTypes: ['unknown'] }).success).toBe(false);
});

test('allows teachers to replace an originally requested question type after generation', () => {
    const worksheet = makeWorksheet();
    worksheet.document.sections.forEach(section => section.questions.forEach(question => {
        question.type = 'short-answer';
        question.responseLines = 2;
    }));

    expect(worksheetOutputSchema.safeParse(worksheet).success).toBe(true);
});

function renderedCharacterCount(worksheet) {
    return [
        worksheet.document.title, worksheet.document.title,
        worksheet.document.instructions, ...worksheet.document.studentFields,
        ...worksheet.document.sections.flatMap(section => [section.title, section.purpose, ...section.questions.flatMap(question => [question.prompt, ...question.standardCodes, ...(question.choices ?? [])])]),
        ...worksheet.teacherKey.answers.map(answer => answer.answer),
    ].reduce((sum, value) => sum + value.length, 0);
}

function makeRenderBudgetWorksheet() {
    const worksheet = makeWorksheet();
    const questions = Array.from({ length: 100 }, (_, index) => ({
        id: `budget-question-${index + 1}`, type: 'descriptive', prompt: `문항 ${index + 1}`,
        responseLines: 1, standardCodes: ['6과11-02'],
    }));
    worksheet.document.sections = Array.from({ length: 5 }, (_, index) => ({
        id: `budget-section-${index + 1}`, title: `영역 ${index + 1}`, purpose: '렌더링 예산 확인',
        questions: questions.slice(index * 20, index * 20 + 20),
    }));
    worksheet.teacherKey.answers = questions.map(question => ({ questionId: question.id, answer: '답안' }));
    let remaining = MAX_WORKSHEET_RENDER_CHARACTERS - renderedCharacterCount(worksheet);
    for (const answer of worksheet.teacherKey.answers) {
        const added = Math.min(4000 - answer.answer.length, remaining);
        answer.answer += '나'.repeat(added);
        remaining -= added;
        if (remaining === 0) break;
    }
    expect(remaining).toBe(0);
    return worksheet;
}

test('accepts aggregate worksheet text that exactly fits the 120,000-character rendering budget', () => {
    const worksheet = makeRenderBudgetWorksheet();

    const result = worksheetOutputSchema.safeParse(worksheet);

    expect(renderedCharacterCount(worksheet)).toBe(MAX_WORKSHEET_RENDER_CHARACTERS);
    expect(result.success).toBe(true);
});

test('rejects aggregate worksheet text one character above the 120,000-character rendering budget', () => {
    const worksheet = makeRenderBudgetWorksheet();
    const answer = worksheet.teacherKey.answers.find(item => item.answer.length < 4000);
    answer.answer += '나';

    const result = worksheetOutputSchema.safeParse(worksheet);

    expect(renderedCharacterCount(worksheet)).toBe(MAX_WORKSHEET_RENDER_CHARACTERS + 1);
    expect(result.success).toBe(false);
    expect(result.error.issues.some(issue => issue.path.includes('document') && issue.message.includes('전체 글자 수'))).toBe(true);
});

test('counts standard codes each time a question renders them', () => {
    const worksheet = makeWorksheet();
    worksheet.standards = Array.from({ length: 10 }, (_, index) => ({
        code: `${index}${'가'.repeat(299)}`, text: `성취기준 ${index}`,
    }));
    const questions = Array.from({ length: 100 }, (_, index) => ({
        id: `repeated-standard-${index + 1}`, type: 'descriptive', prompt: `문항 ${index + 1}`,
        responseLines: 1, standardCodes: worksheet.standards.map(standard => standard.code),
    }));
    worksheet.document.sections = Array.from({ length: 5 }, (_, index) => ({
        id: `standard-section-${index + 1}`, title: `영역 ${index + 1}`, purpose: '반복 렌더링 확인',
        questions: questions.slice(index * 20, index * 20 + 20),
    }));
    worksheet.teacherKey.answers = questions.map(question => ({ questionId: question.id, answer: '예시 답안' }));

    const result = worksheetOutputSchema.safeParse(worksheet);

    expect(renderedCharacterCount(worksheet)).toBeGreaterThan(MAX_WORKSHEET_RENDER_CHARACTERS);
    expect(result.success).toBe(false);
});
