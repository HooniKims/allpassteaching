import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, test, expect } from 'vitest';
import { StandardsStep } from '@/components/lesson-plan/StandardsStep.jsx';

const basics = { schoolLevel: 'elementary', grade: '5', subject: '과학', intent: '식물의 구조와 기능을 관찰한다' };

function deferred() {
    let resolve;
    const promise = new Promise(next => { resolve = next; });
    return { promise, resolve };
}

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

test('ignores a late recommendation after the teacher changes the search query', async () => {
    // Given query A has an unresolved AI recommendation request
    const user = userEvent.setup();
    const pending = deferred();
    vi.stubGlobal('fetch', vi.fn()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(Response.json({ recommendations: [{ code: '6과02-01', text: '빛의 성질', reason: '현재 B 추천' }] })));
    try {
        render(<StandardsStep basics={basics} selected={[]} onChange={() => {}} onBack={() => {}} onNext={() => {}} />);
        await user.click(screen.getByRole('button', { name: 'AI로 추천받기' }));
        await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

        // When the teacher replaces query A with query B before A resolves
        await user.clear(screen.getByLabelText('성취기준 검색'));
        await user.type(screen.getByLabelText('성취기준 검색'), '빛의 성질');
        const firstSignal = fetch.mock.calls[0][1].signal;
        await act(async () => {
            pending.resolve(Response.json({ recommendations: [{ code: '6과11-02', text: '식물의 구조와 기능', reason: '오래된 A 추천' }] }));
            await pending.promise;
        });

        // Then direct query B results stay visible and query B can be recommended
        expect(screen.getByText('6과02-01')).toBeInTheDocument();
        expect(screen.queryByText('오래된 A 추천')).not.toBeInTheDocument();
        expect(screen.queryByText('입력한 수업 내용과 가까운 성취기준입니다.')).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'AI로 추천받기' })).toBeEnabled();
        expect(firstSignal).toBeInstanceOf(AbortSignal);
        expect(firstSignal.aborted).toBe(true);
        await user.click(screen.getByRole('button', { name: 'AI로 추천받기' }));
        expect(await screen.findByText('현재 B 추천')).toBeInTheDocument();
        expect(JSON.parse(fetch.mock.calls[1][1].body).query).toBe('빛의 성질');
    } finally {
        vi.unstubAllGlobals();
    }
});

test('aborts an active recommendation request when the step unmounts', async () => {
    // Given an active AI recommendation request
    const user = userEvent.setup();
    const pending = deferred();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
    try {
        const { unmount } = render(<StandardsStep basics={basics} selected={[]} onChange={() => {}} onBack={() => {}} onNext={() => {}} />);
        await user.click(screen.getByRole('button', { name: 'AI로 추천받기' }));
        await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        const signal = fetch.mock.calls[0][1].signal;

        // When the step unmounts
        unmount();

        // Then the in-flight request is aborted
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(true);
        pending.resolve(Response.json({ recommendations: [] }));
    } finally {
        vi.unstubAllGlobals();
    }
});

test('includes a directly entered display subject in the AI recommendation query', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ recommendations: [] })));
    try {
        render(<StandardsStep basics={{ ...basics, displaySubject: '경제', mappedSubjects: ['사회'] }} selected={[]} onChange={() => {}} onBack={() => {}} onNext={() => {}}/>);
        await user.click(screen.getByRole('button', { name: 'AI로 추천받기' }));
        await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        expect(JSON.parse(fetch.mock.calls[0][1].body).query).toContain('경제');
    } finally {
        vi.unstubAllGlobals();
    }
});
