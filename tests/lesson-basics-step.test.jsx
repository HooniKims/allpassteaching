import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonPlanWorkspace } from '@/components/lesson-plan/LessonPlanWorkspace.jsx';

test('switches to a three-session lesson', async () => {
    const user = userEvent.setup();
    render(<LessonPlanWorkspace />);
    await user.click(screen.getByRole('radio', { name: '연속 차시 수업' }));
    const sessions = screen.getByLabelText('차시 수');
    await user.clear(sessions); await user.type(sessions, '3');
    expect(sessions).toHaveValue(3);
});

test('does not advance without required lesson information', async () => {
    const user = userEvent.setup();
    render(<LessonPlanWorkspace />);
    await user.click(screen.getByRole('button', { name: '성취기준 찾기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('필수 정보를 확인해주세요');
});
