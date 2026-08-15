import { expect, test } from 'vitest';
import { worksheetMessages } from '@/lib/workflow-prompts';
import { createWorksheetFallback } from '@/lib/worksheet-fallback';
import { withoutQuestionNumbering } from '@/lib/worksheet-schema';
import { worksheetFormatById } from '@/lib/worksheet-formats';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

const format = worksheetFormatById('inquiry-experiment');
const generationRequest = { additionalRequirements: '', questionTypes: ['experiment-record', 'descriptive', 'self-assessment'] };
const outputShape = messages => {
    const marker = '다음 JSON 키와 구조만 사용하세요: ';
    return JSON.parse(messages[0].content.slice(messages[0].content.indexOf(marker) + marker.length));
};

test('shows every required section in the worksheet shape so the model does not stop at one', () => {
    const messages = worksheetMessages(makeGeneratedPlan(), 'inquiry-experiment', generationRequest);
    const shape = outputShape(messages);
    expect(shape.document.sections.map(section => section.title)).toEqual(format.sections);
    expect(shape.document.sections.every(section => section.questions.length >= 1)).toBe(true);
    expect(messages[0].content).toContain(`정확히 ${format.sections.length}개 만들고`);
});

test('fills the shape up to the section count when fewer question types are requested', () => {
    const shape = outputShape(worksheetMessages(makeGeneratedPlan(), 'inquiry-experiment', { additionalRequirements: '', questionTypes: ['descriptive'] }));
    expect(shape.document.sections).toHaveLength(format.sections.length);
    expect(shape.document.sections.every(section => section.questions.length >= 1)).toBe(true);
    expect(new Set(shape.document.sections.flatMap(section => section.questions).map(question => question.id)).size).toBe(shape.document.sections.flatMap(section => section.questions).length);
});

test('tells the model not to number the question prompts', () => {
    const [system] = worksheetMessages(makeGeneratedPlan(), 'inquiry-experiment', generationRequest);
    expect(system.content).toContain('번호를 붙이지 마세요');
});

test('drops a leading number that duplicates the number the worksheet already prints', () => {
    const worksheet = { document: { sections: [
        { questions: [{ id: 'q-1', prompt: '1. 탐구 문제를 쓰세요.' }, { id: 'q-2', prompt: '2) 가설을 세우세요.' }] },
        { questions: [{ id: 'q-3', prompt: '3. 결론을 쓰세요.' }] },
    ] } };
    const prompts = withoutQuestionNumbering(worksheet).document.sections.flatMap(section => section.questions).map(question => question.prompt);
    expect(prompts).toEqual(['탐구 문제를 쓰세요.', '가설을 세우세요.', '결론을 쓰세요.']);
});

test('drops per-section numbering that restarts in each section', () => {
    const worksheet = { document: { sections: [
        { questions: [{ id: 'q-1', prompt: '1. 첫 섹션 문항.' }] },
        { questions: [{ id: 'q-2', prompt: '1. 두 번째 섹션 문항.' }] },
    ] } };
    const prompts = withoutQuestionNumbering(worksheet).document.sections.flatMap(section => section.questions).map(question => question.prompt);
    expect(prompts).toEqual(['첫 섹션 문항.', '두 번째 섹션 문항.']);
});

test('keeps a leading number that is part of the question itself', () => {
    const worksheet = { document: { sections: [{ questions: [
        { id: 'q-1', prompt: '2022. 개정 교육과정에서 달라진 점을 쓰세요.' },
        { id: 'q-2', prompt: '5) 번 실험 결과를 해석하세요.' },
    ] }] } };
    const prompts = withoutQuestionNumbering(worksheet).document.sections.flatMap(section => section.questions).map(question => question.prompt);
    expect(prompts).toEqual(['2022. 개정 교육과정에서 달라진 점을 쓰세요.', '5) 번 실험 결과를 해석하세요.']);
});

test('gives the fallback worksheet a distinct prompt per section instead of repeating one', () => {
    const fallback = createWorksheetFallback(makeGeneratedPlan(), 'inquiry-experiment', generationRequest);
    const prompts = fallback.document.sections.flatMap(section => section.questions).map(question => question.prompt);
    expect(prompts.length).toBeGreaterThanOrEqual(format.sections.length);
    expect(new Set(prompts).size).toBe(prompts.length);
    format.sections.forEach(title => expect(prompts.some(prompt => prompt.startsWith(title))).toBe(true));
});

test('matches the fallback task to the question type instead of asking every question the same way', () => {
    const fallback = createWorksheetFallback(makeGeneratedPlan(), 'inquiry-experiment', generationRequest);
    const byType = new Map(fallback.document.sections.flatMap(section => section.questions).map(question => [question.type, question.prompt]));
    expect(byType.get('self-assessment')).toContain('스스로 잘한 점과 더 해볼 점');
    expect(byType.get('experiment-record')).toContain('관찰하거나 측정한 내용');
    expect(byType.get('descriptive')).toContain('까닭을 들어 설명');
});

test('keeps the cross-subject wording out of a single-subject fallback worksheet', () => {
    const fallback = createWorksheetFallback(makeGeneratedPlan(), 'inquiry-experiment', generationRequest);
    expect(fallback.document.instructions).not.toContain('각 교과의 근거를 구분해');
    expect(fallback.document.instructions).toContain(format.sections[0]);
});
