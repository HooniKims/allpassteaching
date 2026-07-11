import { render, screen } from '@testing-library/react';
import { LessonPlanWorkspace } from '@/components/lesson-plan/LessonPlanWorkspace.jsx';

test('shows the approved four-step navigation', () => {
    render(<LessonPlanWorkspace />);
    for (const name of ['수업 정보', '성취기준', '수업 모형', '지도안 완성']) expect(screen.getByText(name)).toBeInTheDocument();
});
