import { normalizeLessonPlan } from './lesson-plan-normalize';
import { createGenerationSnapshot, normalizeLessonMetadata } from './lesson-input';

export const DRAFT_VERSION = 2;
const DRAFT_KEY = 'allpass.lesson-plan';

export function saveDraft(data) {
    window.localStorage.removeItem(DRAFT_KEY);
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ version: DRAFT_VERSION, savedAt: new Date().toISOString(), data }));
}

export function loadDraft() {
    try {
        const legacy = window.localStorage.getItem(DRAFT_KEY);
        window.localStorage.removeItem(DRAFT_KEY);
        const value = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || legacy || 'null');
        if (![1, DRAFT_VERSION].includes(value?.version)) return null;
        const data = value.data;
        if (!data) return null;
        const basics = data.basics ? { ...data.basics, metadata: normalizeLessonMetadata(data.basics.metadata) } : data.basics;
        const migrated = { ...data, ...(basics ? { basics } : {}), maxReached: data.maxReached ?? Math.max(data.step ?? 1, data.plan ? 4 : 1) };
        if (!data.plan) { saveDraft(migrated); return migrated; }
        const plan = normalizeLessonPlan(data.plan);
        const originalPlan = data.originalPlan
            ? normalizeLessonPlan(value.data.originalPlan)
            : structuredClone(plan);
        const snapshotSource = { ...migrated, standards: migrated.standards ?? plan.standards, instructionModel: migrated.instructionModel ?? plan.instructionModel };
        const generatedFrom = data.generatedFrom
            ? createGenerationSnapshot(data.generatedFrom)
            : createGenerationSnapshot(snapshotSource);
        const normalized = { ...migrated, plan, originalPlan, generatedFrom };
        saveDraft(normalized);
        return normalized;
    } catch {
        return null;
    }
}

export function clearDraft() {
    window.localStorage.removeItem(DRAFT_KEY);
    window.sessionStorage.removeItem(DRAFT_KEY);
}
