import { beforeEach, test, expect } from 'vitest';
import { loadDraft, saveDraft, clearDraft } from '@/lib/draft-store';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

beforeEach(() => window.localStorage.clear());
test('round-trips the current draft version', () => { saveDraft({ step: 2 }); expect(loadDraft()).toEqual({ step: 2 }); });
test('불러온 이전 형식의 지도안을 표준 계약으로 정규화한다', () => {
    const legacyPlan = makeGeneratedPlan();
    delete legacyPlan.essentialQuestion;
    delete legacyPlan.sessions[0].stages[0].learningElement;
    delete legacyPlan.assessment[0].levelFeedback;
    saveDraft({ step: 4, plan: legacyPlan });

    const loaded = loadDraft();

    expect(lessonPlanSchema.safeParse(loaded.plan).success).toBe(true);
    expect(loaded.plan.essentialQuestion).toBe(legacyPlan.learningGoals[0]);
});
test('drops an incompatible persisted draft version', () => {
    window.localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 0, data: { unsafe: true } }));
    expect(loadDraft()).toBeNull();
});
test('clears a saved draft', () => { saveDraft({ step: 1 }); clearDraft(); expect(loadDraft()).toBeNull(); });
