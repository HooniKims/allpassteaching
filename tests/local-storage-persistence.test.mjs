import { beforeEach, expect, test } from 'vitest';
import { clearDraft, saveDraft } from '@/lib/draft-store';
import { createEmptyWorkflow, saveWorkflow, WORKFLOW_KEY } from '@/lib/workflow-store';

beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
});

test('수업 초안과 작업 결과를 브라우저 로컬 저장소에 보존한다', () => {
    saveDraft({ step: 2, basics: { intent: '빛의 성질 탐구' } });
    saveWorkflow({ ...createEmptyWorkflow(), activeProcess: 'worksheet' });

    expect(window.localStorage.getItem('allpass.lesson-plan')).toContain('빛의 성질 탐구');
    expect(window.localStorage.getItem(WORKFLOW_KEY)).toContain('worksheet');
    expect(window.sessionStorage.getItem('allpass.lesson-plan')).toBeNull();
    expect(window.sessionStorage.getItem(WORKFLOW_KEY)).toBeNull();

    clearDraft();
});
