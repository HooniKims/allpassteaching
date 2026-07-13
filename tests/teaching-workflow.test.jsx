import { beforeEach, expect, test } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeachingWorkflow } from '@/components/workflow/TeachingWorkflow.jsx';
import { createEmptyWorkflow, WORKFLOW_KEY } from '@/lib/workflow-store';

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

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
    await user.click(screen.getByRole('button', { name: '학생 제출·채점·세특 모두 지우기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('공용 학생 명단은 유지됩니다');
    await user.click(screen.getByRole('button', { name: '제출·채점·세특 삭제 확인' }));

    await waitFor(() => {
        const saved = JSON.parse(window.localStorage.getItem(WORKFLOW_KEY)).data;
        expect(saved.students).toEqual(project.students);
        expect(saved.submissions).toEqual([]);
        expect(saved.records).toEqual([]);
        expect(saved.activeProcess).toBe('records');
    });
});

test('Given persisted PDF metadata When the page refreshes Then files are detached and prior approval is revoked', async () => {
    const project = {
        ...createEmptyWorkflow(),
        submissions: [{
            id: 'submission-a',
            studentId: 'student-a',
            studentName: '김학생',
            fileName: '김학생.pdf',
            packetPages: [1, 2],
            answerPages: [2],
            coverPages: [1],
            originalAttached: true,
            originalReviewedAt: '2026-07-12T12:00:00.000Z',
            status: 'approved',
            approved: true,
            grading: { totalScore: 90 },
        }],
    };
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 3, data: project }));

    render(<TeachingWorkflow/>);

    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(WORKFLOW_KEY)).data.submissions[0]).toMatchObject({
        packetPages: [1, 2],
        answerPages: [2],
        coverPages: [1],
        originalAttached: false,
        originalReviewedAt: null,
        status: 'graded',
        approved: false,
        approvalRevoked: true,
    }));
});

test('Given migrated legacy submission metadata without an attachment flag When restored Then it is detached and approval is revoked', async () => {
    const project = {
        ...createEmptyWorkflow(),
        submissions: [{
            id: 'legacy-submission',
            studentId: 'student-a',
            studentName: '김학생',
            fileName: 'legacy.pdf',
            status: 'graded',
            approved: true,
            grading: { totalScore: 90 },
        }],
    };
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: 2, data: project }));

    render(<TeachingWorkflow/>);

    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(WORKFLOW_KEY)).data.submissions[0]).toMatchObject({
        originalAttached: false,
        originalReviewedAt: null,
        approved: false,
        approvalRevoked: true,
    }));
});
