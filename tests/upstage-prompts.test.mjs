import { expect, test } from 'vitest';
import { lessonPlanMessages } from '@/lib/upstage/prompts';
import { generationDraft } from './fixtures/lesson-plan.mjs';

test('requires every field in the standard lesson plan contract', () => {
    const systemContent = lessonPlanMessages(generationDraft)[0].content;

    for (const key of [
        'metadata', 'unitTitle', 'essentialQuestion', 'nextSessionConnection',
        'learningElement', 'teacherQuestions', 'expectedStudentResponses', 'supportNotes',
        'method', 'levelFeedback', 'needsSupport', 'meets', 'exceeds',
    ]) expect(systemContent).toContain(`\"${key}\"`);
});

test('requires concrete questions, observable evidence, differentiated feedback, and exact source data', () => {
    const systemContent = lessonPlanMessages(generationDraft)[0].content;

    expect(systemContent).toContain('실제 질문');
    expect(systemContent).toContain('관찰 가능한');
    expect(systemContent).toContain('수준별');
    expect(systemContent).toContain('성취기준 코드와 원문');
    expect(systemContent).toContain('차시 수');
    expect(systemContent).toContain('도입, 전개, 정리');
    expect(systemContent).toContain('minutes 합');
});

test('passes document metadata to the model as part of basics', () => {
    const metadata = { date: '2026-07-11', period: '2', place: '과학실', className: '5학년 1반', teacherName: '김교사' };
    const draft = { ...generationDraft, basics: { ...generationDraft.basics, metadata } };
    const userDraft = JSON.parse(lessonPlanMessages(draft)[1].content);

    expect(userDraft.basics.metadata).toEqual(metadata);
});

test('builds a prompt safely when a legacy draft omits metadata', () => {
    const draft = structuredClone(generationDraft);
    delete draft.basics.metadata;

    const messages = lessonPlanMessages(draft);

    expect(messages[0].content).toContain('"metadata":{"date":"","period":"","place":"","className":"","teacherName":""}');
    expect(JSON.parse(messages[1].content).basics.metadata).toEqual({ date: '', period: '', place: '', className: '', teacherName: '' });
});

test('includes the selected model guide and requires visible ordered stage evidence', () => {
    const messages = lessonPlanMessages(generationDraft);
    const userDraft = JSON.parse(messages[1].content);

    expect(userDraft.instructionModelGuide.stages).toEqual(['문제 인식', '가설 설정', '탐구 수행', '결론']);
    expect(userDraft.instructionModelGuide.teacherMoves).toHaveLength(4);
    expect(messages[0].content).toContain('learningElement에 모형 단계명을 순서대로 명시');
});

test('maps four instruction-model stages explicitly onto the three formal lesson phases', () => {
    const messages = lessonPlanMessages(generationDraft);
    const systemContent = messages[0].content;
    const userDraft = JSON.parse(messages[1].content);

    expect(userDraft.instructionModelPhaseMap).toEqual([
        { phase: '도입', requiredStageNames: ['문제 인식'] },
        { phase: '전개', requiredStageNames: ['가설 설정', '탐구 수행'] },
        { phase: '정리', requiredStageNames: ['결론'] },
    ]);
    expect(systemContent).toContain('"learningElement":"문제 인식"');
    expect(systemContent).toContain('"learningElement":"가설 설정 · 탐구 수행"');
    expect(systemContent).toContain('"learningElement":"결론"');
    expect(systemContent).toContain('동의어로 바꾸거나 줄이지 마세요');
});
