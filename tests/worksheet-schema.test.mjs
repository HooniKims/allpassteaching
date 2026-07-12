import { expect, test } from 'vitest';
import { worksheetGenerationRequestSchema, worksheetOutputSchema, worksheetQuestionTypes } from '@/lib/worksheet-schema';
import { makeWorksheet } from './fixtures/workflow.mjs';

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
