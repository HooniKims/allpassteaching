import { test, expect } from 'vitest';
import {
    LESSON_PLAN_LIMITS,
    lessonPlanSchema,
} from '@/lib/lesson-plan-schema';
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

test('accepts lesson-plan collection boundaries', () => {
    const plan = makeGeneratedPlan();
    plan.standards = Array.from({ length: LESSON_PLAN_LIMITS.standards }, (_, index) => ({ code: `code-${index}`, text: '성취기준' }));
    plan.learningGoals = Array.from({ length: LESSON_PLAN_LIMITS.learningGoals }, () => '학습 목표');
    plan.materials = Array.from({ length: LESSON_PLAN_LIMITS.materials }, () => '준비물');
    plan.assessment = Array.from({ length: LESSON_PLAN_LIMITS.assessment }, () => structuredClone(plan.assessment[0]));
    plan.supportStrategies = Array.from({ length: LESSON_PLAN_LIMITS.supportStrategies }, () => '지원 전략');
    plan.sessions = Array.from({ length: LESSON_PLAN_LIMITS.sessions }, (_, index) => ({
        ...structuredClone(plan.sessions[0]),
        id: `session-${index + 1}`,
        order: index + 1,
    }));
    const templateStage = plan.sessions[0].stages[1];
    for (const key of ['teacherActivities', 'studentActivities', 'teacherQuestions', 'expectedStudentResponses', 'supportNotes', 'materialsAndNotes']) {
        templateStage[key] = Array.from({ length: LESSON_PLAN_LIMITS.stageItems }, () => '활동 내용');
    }
    plan.sessions[0].stages = Array.from({ length: LESSON_PLAN_LIMITS.stages }, () => ({
        ...structuredClone(templateStage),
        minutes: 4,
    }));

    expect(lessonPlanSchema.safeParse(plan).success).toBe(true);
});

test.each([
    ['standards', plan => { plan.standards = Array.from({ length: LESSON_PLAN_LIMITS.standards + 1 }, () => structuredClone(plan.standards[0])); }],
    ['learningGoals', plan => { plan.learningGoals = Array.from({ length: LESSON_PLAN_LIMITS.learningGoals + 1 }, () => '학습 목표'); }],
    ['materials', plan => { plan.materials = Array.from({ length: LESSON_PLAN_LIMITS.materials + 1 }, () => '준비물'); }],
    ['sessions', plan => { plan.sessions = Array.from({ length: LESSON_PLAN_LIMITS.sessions + 1 }, () => structuredClone(plan.sessions[0])); }],
    ['stages', plan => { plan.sessions[0].stages = Array.from({ length: LESSON_PLAN_LIMITS.stages + 1 }, () => ({ ...structuredClone(plan.sessions[0].stages[0]), minutes: 1 })); plan.sessions[0].sessionMinutes = LESSON_PLAN_LIMITS.stages + 1; }],
    ['stage items', plan => { plan.sessions[0].stages[0].teacherActivities = Array.from({ length: LESSON_PLAN_LIMITS.stageItems + 1 }, () => '활동'); }],
    ['assessment', plan => { plan.assessment = Array.from({ length: LESSON_PLAN_LIMITS.assessment + 1 }, () => structuredClone(plan.assessment[0])); }],
    ['supportStrategies', plan => { plan.supportStrategies = Array.from({ length: LESSON_PLAN_LIMITS.supportStrategies + 1 }, () => '지원'); }],
])('rejects %s above its collection boundary', (_field, makeInvalid) => {
    const invalid = makeGeneratedPlan();
    makeInvalid(invalid);

    expect(lessonPlanSchema.safeParse(invalid).success).toBe(false);
});

test('accepts string length boundaries and rejects longer strings', () => {
    const valid = makeGeneratedPlan({
        title: '제'.repeat(LESSON_PLAN_LIMITS.shortText),
        reflectionPrompt: '문'.repeat(LESSON_PLAN_LIMITS.proseText),
    });
    const shortTooLong = makeGeneratedPlan({ title: '제'.repeat(LESSON_PLAN_LIMITS.shortText + 1) });
    const proseTooLong = makeGeneratedPlan({ reflectionPrompt: '문'.repeat(LESSON_PLAN_LIMITS.proseText + 1) });

    expect(lessonPlanSchema.safeParse(valid).success).toBe(true);
    expect(lessonPlanSchema.safeParse(shortTooLong).success).toBe(false);
    expect(lessonPlanSchema.safeParse(proseTooLong).success).toBe(false);
});

test('rejects 1000 assessment rows', () => {
    const invalid = makeGeneratedPlan();
    invalid.assessment = Array.from({ length: 1000 }, () => structuredClone(invalid.assessment[0]));

    expect(lessonPlanSchema.safeParse(invalid).success).toBe(false);
});
