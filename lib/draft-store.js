import { normalizeLessonPlan } from './lesson-plan-normalize';
import { createGenerationSnapshot, normalizeLessonMetadata } from './lesson-input';

export const DRAFT_VERSION = 2;
const DRAFT_KEY = 'allpass.lesson-plan';

export function saveDraft(data) {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: DRAFT_VERSION, savedAt: new Date().toISOString(), data }));
}

export function loadDraft() {
    try {
        const value = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
        if (![1, DRAFT_VERSION].includes(value?.version)) return null;
        const data = value.data;
        if (!data) return null;
        const basics = data.basics ? { ...data.basics, metadata: normalizeLessonMetadata(data.basics.metadata) } : data.basics;
        const migrated = { ...data, ...(basics ? { basics } : {}), maxReached: data.maxReached ?? Math.max(data.step ?? 1, data.plan ? 4 : 1) };
        if (!data.plan) return migrated;
        const plan = normalizeLessonPlan(data.plan);
        const originalPlan = data.originalPlan
            ? normalizeLessonPlan(value.data.originalPlan)
            : structuredClone(plan);
        const snapshotSource = { ...migrated, standards: migrated.standards ?? plan.standards, instructionModel: migrated.instructionModel ?? plan.instructionModel };
        const generatedFrom = data.generatedFrom
            ? createGenerationSnapshot(data.generatedFrom)
            : createGenerationSnapshot(snapshotSource);
        return { ...migrated, plan, originalPlan, generatedFrom };
    } catch {
        return null;
    }
}

export function clearDraft() {
    window.localStorage.removeItem(DRAFT_KEY);
}
