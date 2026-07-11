import { beforeEach, test, expect } from 'vitest';
import { loadDraft, saveDraft, clearDraft } from '@/lib/draft-store';

beforeEach(() => window.localStorage.clear());
test('round-trips the current draft version', () => { saveDraft({ step: 2 }); expect(loadDraft()).toEqual({ step: 2 }); });
test('drops an incompatible persisted draft version', () => {
    window.localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 0, data: { unsafe: true } }));
    expect(loadDraft()).toBeNull();
});
test('clears a saved draft', () => { saveDraft({ step: 1 }); clearDraft(); expect(loadDraft()).toBeNull(); });
