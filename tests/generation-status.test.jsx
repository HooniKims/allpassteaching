import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { GenerationStatus } from '@/components/lesson-plan/GenerationStatus.jsx';

test('announces generation progress', () => {
    render(<GenerationStatus status="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent('수업 지도안을 구성하고 있어요');
});
