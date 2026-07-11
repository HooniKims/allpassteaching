import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { LessonPlanEditor } from '@/components/lesson-plan/LessonPlanEditor.jsx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

test('focuses the exact invalid field in the last session before export', async () => {
    // Given
    const user = userEvent.setup();
    const source = makeGeneratedPlan();
    const sessions = Array.from({ length: 10 }, (_, index) => {
        const session = structuredClone(source.sessions[0]);
        session.id = `session-${index + 1}`;
        session.order = index + 1;
        return session;
    });
    sessions[9].stages[2].teacherQuestions = [];
    const invalid = { ...source, sessions };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<LessonPlanEditor plan={invalid} onChange={() => {}} />);
    const question = screen.getByLabelText('10차시 정리 주요 발문');

    // When
    await user.click(screen.getByRole('button', { name: '파일로 저장' }));

    // Then
    expect(fetchMock).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('입력 내용을 확인해주세요. 10차시 정리 주요 발문: 내용을 입력해주세요.');
    expect(question).toHaveFocus();
});
