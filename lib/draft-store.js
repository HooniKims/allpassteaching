import { normalizeLessonPlan } from './lesson-plan-normalize';
import { createGenerationSnapshot, normalizeLessonMetadata } from './lesson-input';

export const DRAFT_VERSION = 2;
const DRAFT_KEY = 'allpass.lesson-plan';

export function saveDraft(data) {
    try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: DRAFT_VERSION, savedAt: new Date().toISOString(), data }));
    } catch {
        return false;
    }
    try {
        window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
    return true;
}

function storedDraft(getStorage) {
    try {
        const storage = getStorage();
        const value = JSON.parse(storage.getItem(DRAFT_KEY) || 'null');
        return [1, DRAFT_VERSION].includes(value?.version) && value.data ? value : null;
    } catch {
        return null;
    }
}

function newerDraft(local, session) {
    if (!local) return session;
    if (!session) return local;
    const localTime = Date.parse(local.savedAt || '') || 0;
    const sessionTime = Date.parse(session.savedAt || '') || 0;
    return sessionTime >= localTime ? session : local;
}

export function loadDraft() {
    const value = newerDraft(storedDraft(() => window.localStorage), storedDraft(() => window.sessionStorage));
    if (!value) return null;
    const data = value.data;
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
}

export function clearDraft() {
    let cleared = true;
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { cleared = false; }
    try { window.sessionStorage.removeItem(DRAFT_KEY); } catch { cleared = false; }
    return cleared;
}
