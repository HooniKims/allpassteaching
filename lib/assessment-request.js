import { z } from 'zod';

const text = z.string().trim().max(5000);
const shortText = z.string().trim().max(300);

export const BACKWARD_DESIGN_QUESTIONS = Object.freeze({
    desiredResult: '이 평가를 마친 학생이 무엇을 이해하고, 스스로 해낼 수 있길 바라나요?',
    evidenceOfSuccess: '학생이 무엇을 보여주면 목표를 이뤘다고 판단할 수 있나요?',
    growthProcess: '학생이 시도하고, 피드백을 받아 고쳐나가는 과정에서 무엇을 확인하고 싶나요?',
});

export const assessmentRequestSchema = z.object({
    assessmentName: shortText,
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
    if (!Object.values(request.stages).some(Boolean)) context.addIssue({ code: 'custom', path: ['stages'], message: '수행 단계는 하나 이상 선택해야 합니다.' });
});

export function createDefaultAssessmentRequest() {
    return {
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
