import { expect, test } from 'vitest';
import { lessonPlanMessages } from '@/lib/upstage/prompts';
import { assessmentMessages, recordMessages } from '@/lib/workflow-prompts';
import { generationDraft, makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment } from './fixtures/workflow.mjs';

function outputShape(messages) {
    const marker = '다음 JSON 키와 구조만 사용하세요: ';
    return JSON.parse(messages[0].content.slice(messages[0].content.indexOf(marker) + marker.length));
}

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

test('gives the model a score-valid outcome and process rubric example when process points are required', () => {
    const assessmentRequest = {
        assessmentName: '과학 탐구 수행평가', teacherIntent: { desiredResult: '근거로 해결 방안을 제안한다.', evidenceOfSuccess: '탐구 보고서를 제시한다.', growthProcess: '피드백을 반영해 수정한다.' },
        totalPoints: 100, levelCount: 4, includeProcessInScore: true, processWeightPercent: 20,
        outputTypes: ['탐구 보고서'], answerTypes: ['서술형'], stages: { draft: true, checkpoint: true, revision: true, final: true },
        visualAnalysisRequired: false, includeStudentCover: true, additionalRequirements: '',
    };

    const shape = outputShape(assessmentMessages(makeGeneratedPlan(), assessmentRequest));

    expect(shape.rubric.criteria).toHaveLength(2);
    expect(shape.rubric.criteria.map(criterion => ({ kind: criterion.kind, maxPoints: criterion.maxPoints }))).toEqual([
        { kind: 'outcome', maxPoints: 80 },
        { kind: 'process', maxPoints: 20 },
    ]);
});

test('applies the selected assessment approach to the generation prompt and contract', () => {
    const assessmentRequest = {
        assessmentApproachId: 'portfolio-growth', assessmentName: '과학 성장 포트폴리오', teacherIntent: { desiredResult: '관찰 근거로 설명한다.', evidenceOfSuccess: '', growthProcess: '초안과 수정본을 비교한다.' },
        totalPoints: 100, levelCount: 4, includeProcessInScore: true, processWeightPercent: 20,
        outputTypes: ['포트폴리오'], answerTypes: ['서술형'], stages: { draft: true, checkpoint: true, revision: true, final: true },
        visualAnalysisRequired: false, includeStudentCover: true, additionalRequirements: '',
    };

    const messages = assessmentMessages(makeGeneratedPlan(), assessmentRequest);
    const shape = outputShape(messages);

    expect(messages[0].content).toContain('포트폴리오 성장 평가');
    expect(messages[0].content).toContain('초기 산출물, 피드백, 수정본');
    expect(shape.generationSettings.assessmentApproachId).toBe('portfolio-growth');
});

test('keeps approved record citations in the user prompt instead of the system prompt', () => {
    const assessment = makeAssessment();
    const submission = {
        grading: {
            criteria: assessment.rubric.criteria.map((criterion, index) => ({
                criterionId: criterion.id, status: 'scored', teacherConfirmed: true,
                evidence: `승인 근거 ${index + 1}`, reason: '승인 이유', feedback: '다음 피드백',
                sourceRefs: [{ elementId: `element-${index + 1}`, page: 1, text: `승인 근거 ${index + 1}` }],
            })),
        },
    };

    const shape = outputShape(recordMessages({ lessonPlan: makeGeneratedPlan(), assessment, submission, targetLength: 500 }));

    expect(shape.claims[0]).toMatchObject({
        criterionIds: ['criterion-id'],
        evidenceQuotes: [{ criterionId: 'criterion-id', stage: 'performance', quote: '승인 근거 원문' }],
        sourceRefs: [{ criterionId: 'criterion-id', elementId: 'element-id', page: 1 }],
    });
    expect(recordMessages({ lessonPlan: makeGeneratedPlan(), assessment, submission, targetLength: 500 })[0].content).not.toContain('승인 근거 1');
    expect(recordMessages({ lessonPlan: makeGeneratedPlan(), assessment, submission, targetLength: 500 })[1].content).toContain('승인 근거 1');
});

test('gives a revision claim both approved before and after citations in the user prompt only', () => {
    const assessment = makeAssessment();
    const submission = {
        grading: {
            criteria: assessment.rubric.criteria.map((criterion, index) => ({
                criterionId: criterion.id, status: 'scored', teacherConfirmed: true,
                evidence: `승인 근거 ${index + 1}`, reason: '승인 이유', feedback: '다음 피드백',
                sourceRefs: [{ elementId: `element-${index + 1}`, page: 1, text: `승인 근거 ${index + 1}` }],
                ...(criterion.kind === 'process' ? { revisionEvidence: {
                    checkpointId: 'checkpoint-2', teacherConfirmed: true, changeReason: '피드백 반영',
                    beforeEvidence: '수정 전 근거', beforeSourceRef: { elementId: 'before-element', page: 1 },
                    afterEvidence: '수정 후 근거', afterSourceRef: { elementId: 'after-element', page: 1 },
                } } : {}),
            })),
        },
    };

    const messages = recordMessages({ lessonPlan: makeGeneratedPlan(), assessment, submission, targetLength: 500 });

    expect(messages[0].content).not.toContain('수정 전 근거');
    expect(messages[1].content).toContain('"stage":"before"');
    expect(messages[1].content).toContain('수정 전 근거');
    expect(messages[1].content).toContain('수정 후 근거');
});
