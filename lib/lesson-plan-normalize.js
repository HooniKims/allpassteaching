import { normalizeLessonMetadata } from './lesson-input.js';

const essentialQuestionPrompt = '학생의 배움을 확인할 핵심 질문을 입력하세요.';
const nextSessionConnectionPrompt = '다음 학습과 연결할 내용을 입력하세요.';
const assessmentMethodDefault = '관찰 및 산출물 확인';

export function normalizeLessonPlan(plan) {
    const clonedPlan = structuredClone(plan);
    return {
        ...clonedPlan,
        metadata: normalizeLessonMetadata(clonedPlan.metadata),
        unitTitle: clonedPlan.unitTitle ?? clonedPlan.title,
        essentialQuestion: clonedPlan.essentialQuestion ?? clonedPlan.learningGoals?.[0] ?? essentialQuestionPrompt,
        sessions: clonedPlan.sessions.map(session => ({
            ...session,
            nextSessionConnection: session.nextSessionConnection ?? nextSessionConnectionPrompt,
            stages: session.stages.map(stage => ({
                ...stage,
                learningElement: stage.learningElement ?? stage.phase,
                teacherQuestions: stage.teacherQuestions ?? stage.teacherActivities.slice(0, 1),
                expectedStudentResponses: stage.expectedStudentResponses ?? stage.studentActivities.slice(0, 1),
                supportNotes: stage.supportNotes ?? [],
            })),
        })),
        assessment: clonedPlan.assessment.map(item => ({
            ...item,
            method: item.method ?? assessmentMethodDefault,
            levelFeedback: item.levelFeedback ?? {
                needsSupport: item.feedback,
                meets: item.feedback,
                exceeds: item.feedback,
            },
        })),
    };
}
