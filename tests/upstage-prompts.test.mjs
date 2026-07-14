import { expect, test } from 'vitest';
import { lessonPlanMessages } from '@/lib/upstage/prompts';
import { assessmentMessages, recordMessages, worksheetMessages } from '@/lib/workflow-prompts';
import { instructionModels } from '@/data/instruction-models';
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

test('융합수업 프롬프트는 두 과목명과 교과별 탐구·통합·공동 산출물을 실제 활동에 요구한다', () => {
    const integrated = instructionModels.find(model => model.id === 'integrated');
    const draft = {
        ...generationDraft,
        instructionModel: integrated,
        standards: [...generationDraft.standards, { code: '6수04-02', text: '자료를 그래프로 나타낸다.', subject: '수학' }],
        integration: { primarySubject: '과학', secondarySubject: '수학', primaryStandards: generationDraft.standards, secondaryStandards: [{ code: '6수04-02', text: '자료를 그래프로 나타낸다.', subject: '수학' }] },
    };
    const systemContent = lessonPlanMessages(draft)[0].content;

    expect(systemContent).toContain('integration.primarySubject와 integration.secondarySubject의 과목명');
    expect(systemContent).toContain('교과별 탐구');
    expect(systemContent).toContain('연결·통합 과정');
    expect(systemContent).toContain('공동 산출물');
});

test('treats TPACK as unordered design checks instead of lesson phases', () => {
    const draft = { ...generationDraft, instructionModel: instructionModels.find(model => model.id === 'tpack') };
    const messages = lessonPlanMessages(draft);
    const systemContent = messages[0].content;
    const userDraft = JSON.parse(messages[1].content);

    expect(userDraft.instructionModelPhaseMap.every(item => item.requiredStageNames.length === 0)).toBe(true);
    expect(userDraft.instructionModelDesignChecks).toEqual(['내용·목표 확인', '교수법 선택', '기술 적합성 검토', '통합·맥락 점검']);
    expect(systemContent).toContain('시간 순서형 수업 단계가 아닙니다');
    expect(systemContent).not.toContain('learningElement에 모형 단계명을 순서대로 명시');
});

test('수업 모형 단계명이 교사·학생 활동에 직접 드러나고 비고 배열을 생성한다', () => {
    const messages = lessonPlanMessages(generationDraft);
    const systemContent = messages[0].content;
    const shapeMarker = '다음 JSON 구조를 정확히 복제하세요: ';
    const shape = JSON.parse(systemContent.slice(systemContent.indexOf(shapeMarker) + shapeMarker.length));

    expect(systemContent).toContain('teacherActivities와 studentActivities에 해당 단계명을 정확히 포함');
    expect(shape.sessions[0].stages[0].teacherActivities[0]).toContain('문제 인식');
    expect(shape.sessions[0].stages[0].studentActivities[0]).toContain('문제 인식');
    expect(shape.sessions[0].stages[0].remarks).toEqual([]);
});

test('SAMR은 네 수준 전체가 아니라 목표에 맞는 수준과 선택 근거를 요청한다', () => {
    const draft = { ...generationDraft, instructionModel: instructionModels.find(model => model.id === 'samr') };
    const messages = lessonPlanMessages(draft);
    const systemContent = messages[0].content;
    const userDraft = JSON.parse(messages[1].content);
    const shapeMarker = '다음 JSON 구조를 정확히 복제하세요: ';
    const shape = JSON.parse(systemContent.slice(systemContent.indexOf(shapeMarker) + shapeMarker.length));

    expect(userDraft.instructionModelDesignCheckMode).toBe('select-one');
    expect(systemContent).toContain('1개 이상 선택');
    expect(systemContent).toContain('선택 이유');
    expect(systemContent).toContain('과제 변화');
    expect(systemContent).not.toContain('각 차시 전체에서 모든 설계 점검');
    expect(shape.sessions[0].stages[0].materialsAndNotes[0]).toContain('수정(Modification)');
});

test('SAMR 학습지는 설계 틀을 시간 순서형 수업 단계로 복사하지 않는다', () => {
    const lessonPlan = makeGeneratedPlan({ instructionModel: { id: 'samr', name: 'SAMR 에듀테크 설계', reason: '기술이 과제를 어떻게 바꾸는지 점검함' } });
    const request = { additionalRequirements: '', questionTypes: ['descriptive'] };
    const messages = worksheetMessages(lessonPlan, 'inquiry-experiment', request);
    const shape = outputShape(messages);

    expect(messages[0].content).toContain('시간 순서형 단계가 아닙니다');
    expect(messages[0].content).toContain('실제 학생 활동');
    expect(messages[0].content).not.toContain('선택된 수업 모형의 단계');
    expect(shape.selectionReason).toContain('설계 틀');
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
    expect(shape.studentSheet.document.sections).toHaveLength(4);
    expect(shape.studentSheet.document.sections.flatMap(section => section.questions)).toHaveLength(4);
    expect(shape.studentSheet.teacherKey.answers).toHaveLength(4);
    expect(assessmentMessages(makeGeneratedPlan(), assessmentRequest)[0].content).toContain('실제 문항과 학생 응답 공간');
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
    expect(messages[0].content).not.toContain('GRASPS 수행과제는');
    expect(shape.generationSettings.assessmentApproachId).toBe('portfolio-growth');
});

test('GRASPS 선택 시 여섯 수행과제 요소를 생성 프롬프트에 반영한다', () => {
    const assessmentRequest = {
        assessmentApproachId: 'authentic-performance', assessmentName: '지역 문제 해결 제안', teacherIntent: { desiredResult: '배운 내용을 실제 상황에 적용한다.', evidenceOfSuccess: '', growthProcess: '피드백을 반영한다.' },
        totalPoints: 100, levelCount: 4, includeProcessInScore: true, processWeightPercent: 20,
        outputTypes: ['제안서'], answerTypes: ['논술형'], stages: { draft: true, checkpoint: true, revision: true, final: true },
        visualAnalysisRequired: false, includeStudentCover: true, additionalRequirements: '',
    };

    const messages = assessmentMessages(makeGeneratedPlan(), assessmentRequest);
    const shape = outputShape(messages);

    expect(messages[0].content).toContain('GRASPS 실제적 수행과제');
    for (const element of ['목표', '역할', '청중', '상황', '산출물', '성공 기준']) expect(messages[0].content).toContain(element);
    expect(shape.task).toMatchObject({
        goal: expect.any(String), role: expect.any(String), audience: expect.any(String),
        situation: expect.any(String), product: expect.any(String), successCriteria: expect.any(String),
    });
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

    const shape = outputShape(recordMessages({ lessonPlan: makeGeneratedPlan(), assessment, submission, targetBytes: 700 }));

    expect(shape.claims[0]).toMatchObject({
        criterionIds: ['criterion-id'],
        evidenceQuotes: [{ criterionId: 'criterion-id', stage: 'performance', quote: '승인 근거 원문' }],
        sourceRefs: [{ criterionId: 'criterion-id', elementId: 'element-id', page: 1 }],
    });
    expect(recordMessages({ lessonPlan: makeGeneratedPlan(), assessment, submission, targetBytes: 700 })[0].content).not.toContain('승인 근거 1');
    expect(recordMessages({ lessonPlan: makeGeneratedPlan(), assessment, submission, targetBytes: 700 })[1].content).toContain('승인 근거 1');
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

    const messages = recordMessages({ lessonPlan: makeGeneratedPlan(), assessment, submission, targetBytes: 700 });

    expect(messages[0].content).not.toContain('수정 전 근거');
    expect(messages[1].content).toContain('"stage":"before"');
    expect(messages[1].content).toContain('수정 전 근거');
    expect(messages[1].content).toContain('수정 후 근거');
});
