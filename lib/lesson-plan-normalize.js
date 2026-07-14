import { normalizeLessonMetadata } from './lesson-input.js';

const essentialQuestionPrompt = '학생의 배움을 확인할 핵심 질문을 입력하세요.';
const nextSessionConnectionPrompt = '다음 학습과 연결할 내용을 입력하세요.';
const assessmentMethodDefault = '관찰 및 산출물 확인';

export function normalizeLessonPlan(plan) {
    const clonedPlan = structuredClone(plan);
    const defaultSequence = (clonedPlan.sessions ?? []).map(session => ({
        session: `${session.order}차시`,
        topic: session.title,
        learningGoal: clonedPlan.learningGoals?.[0] ?? '학습 목표를 입력하세요.',
        focus: session.nextSessionConnection ?? nextSessionConnectionPrompt,
    }));
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
                materialsAndNotes: stage.materialsAndNotes ?? [],
                remarks: stage.remarks ?? [],
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
        detailedPlan: {
            teacherIntent: clonedPlan.detailedPlan?.teacherIntent ?? '수업자 의도와 지도 중점을 입력하세요.',
            unitOverview: clonedPlan.detailedPlan?.unitOverview ?? `${clonedPlan.unitTitle ?? clonedPlan.title} 단원의 개관을 입력하세요.`,
            unitGoals: clonedPlan.detailedPlan?.unitGoals ?? [...(clonedPlan.learningGoals ?? [])],
            learnerAnalysis: clonedPlan.detailedPlan?.learnerAnalysis ?? '학생의 선수 학습, 예상 어려움과 지도 대책을 입력하세요.',
            teachingStrategy: clonedPlan.detailedPlan?.teachingStrategy ?? `${clonedPlan.instructionModel?.name ?? '선택한 수업 모형'}의 적용 전략을 입력하세요.`,
            unitSequence: clonedPlan.detailedPlan?.unitSequence ?? defaultSequence,
            boardPlan: clonedPlan.detailedPlan?.boardPlan ?? ['핵심 질문과 학습 결과를 판서 계획에 정리하세요.'],
            references: clonedPlan.detailedPlan?.references ?? [],
        },
    };
}
