import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

test('renders the lesson-plan product entry point', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: '수업 지도안 만들기' })).toBeInTheDocument();
});
