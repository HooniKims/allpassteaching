export const DRAFT_VERSION = 1;
const DRAFT_KEY = 'allpass.lesson-plan';

export function saveDraft(data) {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: DRAFT_VERSION, savedAt: new Date().toISOString(), data }));
}

export function loadDraft() {
    try {
        const value = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
        return value?.version === DRAFT_VERSION ? value.data : null;
    } catch {
        return null;
    }
}

export function clearDraft() {
    window.localStorage.removeItem(DRAFT_KEY);
}
