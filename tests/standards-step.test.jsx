import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect } from 'vitest';
import { StandardsStep } from '@/components/lesson-plan/StandardsStep.jsx';

const basics = { schoolLevel: 'elementary', grade: '5', subject: '과학', intent: '식물의 구조와 기능을 관찰한다' };

test('searches only scoped standards and lets the teacher select one', async () => {
    const user = userEvent.setup(); const onChange = vi.fn();
    render(<StandardsStep basics={basics} selected={[]} onChange={onChange} onBack={() => {}} onNext={() => {}} />);
    expect(await screen.findByText('6과11-02')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /6과11-02/ }));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ code: '6과11-02' })]);
});

test.each([
    ['network rejection', () => Promise.reject(new TypeError('offline'))],
    ['invalid JSON', () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('invalid JSON')) })],
])('recovers from %s while keeping direct search available', async (_scenario, request) => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(request));
    try {
        render(<StandardsStep basics={basics} selected={[]} onChange={() => {}} onBack={() => {}} onNext={() => {}} />);
        await user.click(screen.getByRole('button', { name: 'AI로 추천받기' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('직접 검색은 계속 사용할 수 있어요');
        expect(screen.getByRole('button', { name: 'AI로 추천받기' })).toBeEnabled();
    } finally {
        vi.unstubAllGlobals();
    }
});
