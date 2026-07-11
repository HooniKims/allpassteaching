import { normalizeLessonPlan } from './lesson-plan-normalize';

export const DRAFT_VERSION = 1;
const DRAFT_KEY = 'allpass.lesson-plan';

export function saveDraft(data) {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: DRAFT_VERSION, savedAt: new Date().toISOString(), data }));
}

export function loadDraft() {
    try {
        const value = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
        if (value?.version !== DRAFT_VERSION) return null;
        if (!value.data?.plan) return value.data;
        const plan = normalizeLessonPlan(value.data.plan);
        const originalPlan = value.data.originalPlan
            ? normalizeLessonPlan(value.data.originalPlan)
            : structuredClone(plan);
        return { ...value.data, plan, originalPlan };
    } catch {
        return null;
    }
}

export function clearDraft() {
    window.localStorage.removeItem(DRAFT_KEY);
}
