import { test, expect } from 'vitest';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { makeGeneratedPlan, makeTwoSessionPlan } from './fixtures/lesson-plan.mjs';

test('표준 과정안 필드를 포함한 완전한 지도안을 검증한다', () => {
    const parsed = lessonPlanSchema.parse(makeGeneratedPlan());

    expect(parsed.essentialQuestion).toBeTruthy();
    expect(parsed.sessions[0].stages[0]).toMatchObject({
        learningElement: expect.any(String),
        teacherQuestions: expect.any(Array),
        expectedStudentResponses: expect.any(Array),
        supportNotes: expect.any(Array),
    });
    expect(parsed.assessment[0]).toMatchObject({ method: expect.any(String), levelFeedback: expect.any(Object) });
});

test('행정 정보의 빈 문자열을 허용하고 누락된 하위 필드는 빈 문자열로 채운다', () => {
    const parsed = lessonPlanSchema.parse(makeGeneratedPlan({ metadata: {} }));

    expect(parsed.metadata).toEqual({ date: '', place: '', className: '', teacherName: '' });
});

test.each([
    ['unitTitle', plan => { plan.unitTitle = ''; }],
    ['essentialQuestion', plan => { plan.essentialQuestion = ''; }],
    ['nextSessionConnection', plan => { plan.sessions[0].nextSessionConnection = ''; }],
    ['learningElement', plan => { plan.sessions[0].stages[0].learningElement = ''; }],
    ['teacherQuestions', plan => { plan.sessions[0].stages[0].teacherQuestions = []; }],
    ['expectedStudentResponses', plan => { plan.sessions[0].stages[0].expectedStudentResponses = []; }],
    ['assessment.method', plan => { plan.assessment[0].method = ''; }],
    ['levelFeedback.needsSupport', plan => { plan.assessment[0].levelFeedback.needsSupport = ''; }],
])('%s 필드가 비어 있으면 거부한다', (_field, makeInvalid) => {
    const invalid = makeGeneratedPlan();
    makeInvalid(invalid);

    expect(lessonPlanSchema.safeParse(invalid).success).toBe(false);
});

test('두 차시 fixture도 유효한 표준 과정안이다', () => {
    expect(lessonPlanSchema.safeParse(makeTwoSessionPlan()).success).toBe(true);
});

test('rejects a session whose stage minutes do not match', () => {
    const invalid = makeGeneratedPlan(); invalid.sessions[0].stages[1].minutes = 20;
    expect(lessonPlanSchema.safeParse(invalid).success).toBe(false);
});
