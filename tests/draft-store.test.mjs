import { beforeEach, test, expect } from 'vitest';
import { loadDraft, saveDraft, clearDraft } from '@/lib/draft-store';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

beforeEach(() => window.localStorage.clear());
test('round-trips the current draft version', () => { saveDraft({ step: 2 }); expect(loadDraft()).toEqual({ step: 2 }); });
test('편집 지도안과 생성 원본을 서로 독립된 값으로 저장하고 불러온다', () => {
    const originalPlan = makeGeneratedPlan({ title: '생성 원본' });
    const plan = structuredClone(originalPlan);
    plan.title = '교사 편집본';
    plan.sessions[0].stages[0].teacherQuestions[0] = '교사가 수정한 발문';

    saveDraft({ step: 4, plan, originalPlan });
    const loaded = loadDraft();

    expect(loaded.plan.title).toBe('교사 편집본');
    expect(loaded.originalPlan.title).toBe('생성 원본');
    expect(loaded.plan).not.toBe(loaded.originalPlan);
    expect(loaded.plan.sessions[0]).not.toBe(loaded.originalPlan.sessions[0]);
    loaded.plan.sessions[0].stages[0].teacherQuestions[0] = '불러온 뒤 추가 편집';
    expect(loaded.originalPlan.sessions[0].stages[0].teacherQuestions[0]).toBe('식물의 기관은 어떤 일을 할까요?');
});
test('불러온 이전 형식의 지도안을 표준 계약으로 정규화한다', () => {
    const legacyPlan = makeGeneratedPlan();
    delete legacyPlan.essentialQuestion;
    delete legacyPlan.sessions[0].stages[0].learningElement;
    delete legacyPlan.assessment[0].levelFeedback;
    saveDraft({ step: 4, plan: legacyPlan });

    const loaded = loadDraft();

    expect(lessonPlanSchema.safeParse(loaded.plan).success).toBe(true);
    expect(loaded.plan.essentialQuestion).toBe(legacyPlan.learningGoals[0]);
    expect(lessonPlanSchema.safeParse(loaded.originalPlan).success).toBe(true);
    expect(loaded.originalPlan).toEqual(loaded.plan);
    expect(loaded.originalPlan).not.toBe(loaded.plan);
    expect(loaded.originalPlan.sessions[0]).not.toBe(loaded.plan.sessions[0]);
});
test('현재 형식 지도안의 빈 편집값을 저장하고 그대로 불러온다', () => {
    const plan = makeGeneratedPlan({ unitTitle: '', essentialQuestion: '' });
    plan.metadata.place = '';
    plan.sessions[0].nextSessionConnection = '';
    plan.sessions[0].stages[0].learningElement = '';
    plan.assessment[0].method = '';
    saveDraft({ step: 4, plan });

    const loaded = loadDraft();

    expect(loaded.plan).toMatchObject({ unitTitle: '', essentialQuestion: '', metadata: { place: '' } });
    expect(loaded.plan.sessions[0].nextSessionConnection).toBe('');
    expect(loaded.plan.sessions[0].stages[0].learningElement).toBe('');
    expect(loaded.plan.assessment[0].method).toBe('');
});
test('drops an incompatible persisted draft version', () => {
    window.localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 0, data: { unsafe: true } }));
    expect(loadDraft()).toBeNull();
});
test('clears a saved draft', () => { saveDraft({ step: 1 }); clearDraft(); expect(loadDraft()).toBeNull(); });
