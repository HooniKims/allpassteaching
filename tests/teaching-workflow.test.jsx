import { beforeEach, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeachingWorkflow } from '@/components/workflow/TeachingWorkflow.jsx';
import { createEmptyWorkflow, WORKFLOW_KEY } from '@/lib/workflow-store';

beforeEach(() => window.sessionStorage.clear());

test('opens every process but explains the missing prerequisite in context', async () => {
    const user = userEvent.setup();
    render(<TeachingWorkflow/>);

    await user.click(screen.getByRole('tab', { name: /학습지/ }));
    expect(screen.getByRole('heading', { name: '먼저 지도안을 완성해주세요' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '지도안으로 이동' })).toBeEnabled();
    expect(screen.getByRole('main', { name: '학습지 작업 영역' })).toBeInTheDocument();
});

test('restores the active process and can clear only student-derived data', async () => {
    const user = userEvent.setup();
    const project = { ...createEmptyWorkflow(), activeProcess: 'records', students: [{ id: 'student-a', grade: '2', className: '3', number: 7, name: '김학생' }], submissions: [{ id: 's1', studentId: 'student-a', studentName: '김학생', extractedText: '내용' }], records: [{ submissionId: 's1', studentId: 'student-a', text: '세특' }] };
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 1, data: project }));
    render(<TeachingWorkflow/>);

    expect(await screen.findByRole('tab', { name: /세특/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: '학생 자료 모두 지우기' }));
    await user.click(screen.getByRole('button', { name: '학생 자료 삭제 확인' }));

    await waitFor(() => {
        const saved = JSON.parse(window.sessionStorage.getItem(WORKFLOW_KEY)).data;
        expect(saved.students).toEqual([]);
        expect(saved.submissions).toEqual([]);
        expect(saved.records).toEqual([]);
        expect(saved.activeProcess).toBe('records');
    });
});
