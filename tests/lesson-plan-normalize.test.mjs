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
        metadata: { date: '', period: '', place: '', className: '', teacherName: '' },
        unitTitle: normalized.title,
        essentialQuestion: normalized.learningGoals[0],
    });
    expect(normalized.sessions[0].nextSessionConnection).toBe('다음 학습과 연결할 내용을 입력하세요.');
    expect(normalized.sessions[0].stages[0]).toMatchObject({
        learningElement: '도입',
        teacherQuestions: ['문제 인식: 질문을 제시한다.'],
        expectedStudentResponses: ['문제 인식: 관찰할 문제를 확인한다.'],
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

    expect(normalized.metadata).toEqual({ date: '', period: '', place: '과학실', className: '', teacherName: '' });
    expect(normalized.essentialQuestion).toBe(plan.essentialQuestion);
    expect(normalized.sessions[0].stages[0].teacherQuestions).toEqual(plan.sessions[0].stages[0].teacherQuestions);
    expect(normalized.assessment[0].levelFeedback).toEqual(plan.assessment[0].levelFeedback);
});

test('현재 형식에 존재하는 빈 편집값을 레거시 기본값으로 덮어쓰지 않는다', () => {
    const plan = makeGeneratedPlan({ unitTitle: '', essentialQuestion: '' });
    plan.sessions[0].nextSessionConnection = '';
    plan.sessions[0].stages[0].learningElement = '';
    plan.assessment[0].method = '';

    const normalized = normalizeLessonPlan(plan);

    expect(normalized.unitTitle).toBe('');
    expect(normalized.essentialQuestion).toBe('');
    expect(normalized.sessions[0].nextSessionConnection).toBe('');
    expect(normalized.sessions[0].stages[0].learningElement).toBe('');
    expect(normalized.assessment[0].method).toBe('');
});

test('정규화할 때 입력 객체를 변경하지 않는다', () => {
    const legacy = makeLegacyPlan();
    const original = structuredClone(legacy);

    normalizeLessonPlan(legacy);

    expect(legacy).toEqual(original);
});

test('정규화 결과의 중첩 값을 변경해도 입력 객체와 참조를 공유하지 않는다', () => {
    const plan = makeGeneratedPlan();
    const original = structuredClone(plan);
    const normalized = normalizeLessonPlan(plan);

    normalized.standards[0].text = '변경된 성취기준';
    normalized.learningGoals.push('추가 목표');
    normalized.instructionModel.name = '변경된 수업 모형';
    normalized.sessions[0].stages[0].teacherQuestions.push('추가 발문');
    normalized.assessment[0].levelFeedback.meets = '변경된 피드백';
    normalized.supportStrategies.push('추가 지원');

    expect(plan).toEqual(original);
});
