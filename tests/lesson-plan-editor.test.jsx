import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test, expect, vi } from 'vitest';
import { LessonPlanEditor } from '@/components/lesson-plan/LessonPlanEditor.jsx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

test('edits a learning goal and restores the generated original', async () => {
    const user = userEvent.setup(); const plan = makeGeneratedPlan();
    render(<LessonPlanEditor plan={plan} onChange={() => {}} />);
    const goal = screen.getByLabelText('학습 목표 1');
    await user.clear(goal); await user.type(goal, '수정한 목표');
    expect(goal).toHaveValue('수정한 목표');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '생성 원본으로 되돌리기' }));
    expect(goal).toHaveValue(plan.learningGoals[0]);
});

test('shows the exact stage-minute total', () => {
    render(<LessonPlanEditor plan={makeGeneratedPlan()} onChange={() => {}} />);
    expect(screen.getByText('총 40분')).toBeInTheDocument();
});
