import { expect, test } from 'vitest';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { normalizeLessonPlan } from '@/lib/lesson-plan-normalize';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

function makeLegacyPlan() {
    const plan = makeGeneratedPlan();
    delete plan.metadata;
    delete plan.unitTitle;
    delete plan.essentialQuestion;
    for (const session of plan.sessions) {
        delete session.nextSessionConnection;
        for (const stage of session.stages) {
            delete stage.learningElement;
            delete stage.teacherQuestions;
            delete stage.expectedStudentResponses;
            delete stage.supportNotes;
        }
    }
    for (const item of plan.assessment) {
        delete item.method;
        delete item.levelFeedback;
    }
    return plan;
}

test('이전 지도안을 표준 과정안 계약으로 정규화한다', () => {
    const normalized = normalizeLessonPlan(makeLegacyPlan());

    expect(lessonPlanSchema.safeParse(normalized).success).toBe(true);
    expect(normalized).toMatchObject({
        metadata: { date: '', place: '', className: '', teacherName: '' },
        unitTitle: normalized.title,
        essentialQuestion: normalized.learningGoals[0],
    });
    expect(normalized.sessions[0].nextSessionConnection).toBe('다음 학습과 연결할 내용을 입력하세요.');
    expect(normalized.sessions[0].stages[0]).toMatchObject({
        learningElement: '도입',
        teacherQuestions: ['질문을 제시한다.'],
        expectedStudentResponses: ['예상한다.'],
        supportNotes: [],
    });
    expect(normalized.assessment[0]).toMatchObject({
        method: '관찰 및 산출물 확인',
        levelFeedback: {
            needsSupport: normalized.assessment[0].feedback,
            meets: normalized.assessment[0].feedback,
            exceeds: normalized.assessment[0].feedback,
        },
    });
});

test('학습 목표가 없는 이전 지도안에는 수정 가능한 핵심 질문을 채운다', () => {
    const legacy = makeLegacyPlan();
    legacy.learningGoals = [];

    expect(normalizeLessonPlan(legacy).essentialQuestion).toBe('학생의 배움을 확인할 핵심 질문을 입력하세요.');
});

test('부분 행정 정보와 기존 표준 필드 값을 보존한다', () => {
    const plan = makeGeneratedPlan({ metadata: { place: '과학실' } });

    const normalized = normalizeLessonPlan(plan);

    expect(normalized.metadata).toEqual({ date: '', place: '과학실', className: '', teacherName: '' });
    expect(normalized.essentialQuestion).toBe(plan.essentialQuestion);
    expect(normalized.sessions[0].stages[0].teacherQuestions).toEqual(plan.sessions[0].stages[0].teacherQuestions);
    expect(normalized.assessment[0].levelFeedback).toEqual(plan.assessment[0].levelFeedback);
});

test('정규화할 때 입력 객체를 변경하지 않는다', () => {
    const legacy = makeLegacyPlan();
    const original = structuredClone(legacy);

    normalizeLessonPlan(legacy);

    expect(legacy).toEqual(original);
});
