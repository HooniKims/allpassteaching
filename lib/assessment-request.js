import { z } from 'zod';
import { ASSESSMENT_APPROACH_IDS } from './assessment-approaches.js';

const text = z.string().trim().max(5000);
const shortText = z.string().trim().max(300);

export const BACKWARD_DESIGN_QUESTIONS = Object.freeze({
    desiredResult: '이 평가를 마친 학생이 무엇을 이해하고, 스스로 해낼 수 있길 바라나요?',
    evidenceOfSuccess: '학생이 무엇을 보여주면 목표를 이뤘다고 판단할 수 있나요?',
    growthProcess: '학생이 시도하고, 피드백을 받아 고쳐나가는 과정에서 무엇을 확인하고 싶나요?',
});

export const assessmentRequestSchema = z.object({
    assessmentApproachId: z.enum(ASSESSMENT_APPROACH_IDS).default('backward-design'),
    assessmentName: shortText.min(1),
    teacherIntent: z.object({ desiredResult: text.min(1), evidenceOfSuccess: text, growthProcess: text }),
    totalPoints: z.number().int().min(1).max(1000),
    levelCount: z.number().int().min(2).max(6),
    includeProcessInScore: z.boolean(),
    processWeightPercent: z.number().int().min(0).max(100),
    outputTypes: z.array(shortText.min(1)).min(1).max(10),
    answerTypes: z.array(shortText.min(1)).min(1).max(10),
    stages: z.object({ draft: z.boolean(), checkpoint: z.boolean(), revision: z.boolean(), final: z.boolean() }),
    visualAnalysisRequired: z.boolean(),
    includeStudentCover: z.boolean(),
    additionalRequirements: text,
}).superRefine((request, context) => {
    if (request.includeProcessInScore && request.processWeightPercent < 1) context.addIssue({ code: 'custom', path: ['processWeightPercent'], message: '과정 점수를 포함하면 과정 비중은 1% 이상이어야 합니다.' });
    if (!request.includeProcessInScore && request.processWeightPercent !== 0) context.addIssue({ code: 'custom', path: ['processWeightPercent'], message: '과정 점수를 제외하면 과정 비중은 0%여야 합니다.' });
    const minimumCriterionPoints = request.levelCount - 1;
    if (request.totalPoints < minimumCriterionPoints * 2) context.addIssue({ code: 'custom', path: ['totalPoints'], message: `${request.levelCount}수준 루브릭은 두 평가영역에 각각 ${minimumCriterionPoints}점 이상이 필요하므로 총점은 ${minimumCriterionPoints * 2}점 이상이어야 합니다.` });
    if (request.includeProcessInScore) {
        const processPoints = Math.round(request.totalPoints * request.processWeightPercent / 100);
        const outcomePoints = request.totalPoints - processPoints;
        if (processPoints < minimumCriterionPoints || outcomePoints < minimumCriterionPoints) context.addIssue({ code: 'custom', path: ['processWeightPercent'], message: `과정과 결과 평가영역은 ${request.levelCount}수준 점수를 각각 만들 수 있도록 ${minimumCriterionPoints}점 이상이어야 합니다. 총점 또는 과정 점수 비중을 조정해주세요.` });
    }
    if (!Object.values(request.stages).some(Boolean)) context.addIssue({ code: 'custom', path: ['stages'], message: '수행 단계는 하나 이상 선택해야 합니다.' });
});

export function integratedAssessmentScoreIssue(request) {
    const minimumCriterionPoints = request.levelCount - 1;
    const processPoints = request.includeProcessInScore ? Math.round(request.totalPoints * request.processWeightPercent / 100) : 0;
    const outcomePoints = request.totalPoints - processPoints;
    const minimumOutcomePoints = minimumCriterionPoints * 3;
    if (outcomePoints >= minimumOutcomePoints) return null;
    return {
        path: [request.includeProcessInScore ? 'processWeightPercent' : 'totalPoints'],
        message: `${request.levelCount}수준 융합 루브릭은 결과 평가영역 3개에 각각 최소 ${minimumCriterionPoints}점이 필요하므로 결과 배점은 최소 ${minimumOutcomePoints}점이어야 합니다.`,
    };
}

export function createDefaultAssessmentRequest() {
    return {
        assessmentApproachId: 'backward-design',
        assessmentName: '',
        teacherIntent: { desiredResult: '', evidenceOfSuccess: '', growthProcess: '' },
        totalPoints: 100,
        levelCount: 4,
        includeProcessInScore: true,
        processWeightPercent: 20,
        outputTypes: ['보고서'],
        answerTypes: ['서술형'],
        stages: { draft: true, checkpoint: true, revision: true, final: true },
        visualAnalysisRequired: false,
        includeStudentCover: true,
        additionalRequirements: '',
    };
}

export function assessmentRequestForLesson(lessonPlan, request = createDefaultAssessmentRequest()) {
    const goals = Array.isArray(lessonPlan?.learningGoals) ? lessonPlan.learningGoals.filter(Boolean) : [];
    const standards = Array.isArray(lessonPlan?.standards) ? lessonPlan.standards.filter(Boolean) : [];
    return {
        ...createDefaultAssessmentRequest(),
        ...request,
        assessmentName: request.assessmentName?.trim() || `${lessonPlan?.title || '수업'} 수행평가`,
        teacherIntent: {
            desiredResult: request.teacherIntent?.desiredResult?.trim() || goals.join(' ') || standards.map(item => item.text).join(' '),
            evidenceOfSuccess: request.teacherIntent?.evidenceOfSuccess?.trim() || '학생 산출물에서 성취기준에 맞는 근거와 설명을 직접 확인한다.',
            growthProcess: request.teacherIntent?.growthProcess?.trim() || '초안, 피드백 표시, 수정본과 수정 이유를 비교해 반영 과정을 확인한다.',
        },
    };
}
