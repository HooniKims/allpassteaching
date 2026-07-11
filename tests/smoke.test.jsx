import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

test('renders the lesson-plan product entry point', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: '어떤 수업을 준비하시나요?' })).toBeInTheDocument();
});
