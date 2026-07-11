import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect } from 'vitest';
import { InstructionModelStep } from '@/components/lesson-plan/InstructionModelStep.jsx';

test('shows three recommendations but allows another catalog model', async () => {
    const user = userEvent.setup(); const onChange = vi.fn();
    render(<InstructionModelStep lessonIntent="식물 성장 조건 실험 관찰" selected="" onChange={onChange} onBack={() => {}} onNext={() => {}} />);
    expect(screen.getAllByText('추천')).toHaveLength(3);
    await user.click(screen.getByRole('radio', { name: /협동 학습/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'cooperative' }));
});
