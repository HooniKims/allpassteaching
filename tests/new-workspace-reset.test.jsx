import { beforeEach, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeachingWorkflow } from '@/components/workflow/TeachingWorkflow.jsx';
import { saveDraft } from '@/lib/draft-store';
import { createEmptyWorkflow, WORKFLOW_KEY } from '@/lib/workflow-store';

beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
});

test('새 작업 시작을 확인하면 현재 프로젝트와 지도안 초안을 비운다', async () => {
    const user = userEvent.setup();
    saveDraft({ step: 2, basics: { intent: '이전 수업' } });
    window.localStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 4, data: { ...createEmptyWorkflow(), activeProcess: 'worksheet' } }));
    render(<TeachingWorkflow/>);

    expect(screen.getByText(/공용 기기에서는/)).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: '새 작업 시작' }));
    const dialog = screen.getByRole('alertdialog', { name: '새 작업 시작 확인' });
    expect(dialog).toHaveTextContent('현재 지도안, 학습지, 수행평가, 학생 명단과 채점·세특 기록을 모두 지웁니다.');
    await user.click(screen.getByRole('button', { name: '모든 작업 지우고 새로 시작' }));

    await waitFor(() => {
        const saved = JSON.parse(window.localStorage.getItem(WORKFLOW_KEY)).data;
        expect(saved).toMatchObject({
            activeProcess: 'lesson',
            worksheet: null,
            assessment: null,
            students: [],
            submissions: [],
            records: [],
            lessonSnapshot: { basics: { intent: '' } },
        });
    });
    expect(window.localStorage.getItem('allpass.lesson-plan')).toBeNull();
    expect(screen.getByRole('heading', { name: '어떤 수업을 준비하시나요?' })).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(window.localStorage.getItem('allpass.lesson-plan')).toBeNull();
});
