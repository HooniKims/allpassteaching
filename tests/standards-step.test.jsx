import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi, test, expect } from 'vitest';
import { StandardsStep } from '@/components/lesson-plan/StandardsStep.jsx';

const basics = { schoolLevel: 'elementary', grade: '5', subject: '과학', intent: '식물의 구조와 기능을 관찰한다' };
const middleBasics = { schoolLevel: 'middle', grade: '2', subject: '과학', intent: '빛의 성질을 탐구한다' };
const middleSocialBasics = { schoolLevel: 'middle', grade: '2', subject: '사회', intent: '위치와 공간 정보를 탐구한다' };

function StandardsSelectionHarness() {
    const [selected, setSelected] = useState([]);
    return <StandardsStep basics={basics} selected={selected} onChange={setSelected} onBack={() => {}} onNext={() => {}}/>;
}

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

test('uses the official middle-school grade-group wording instead of 7-9 grades', () => {
    render(<StandardsStep basics={middleBasics} selected={[]} onChange={() => {}} onBack={() => {}} onNext={() => {}}/>);

    expect(screen.getByText(/중학교 1~3학년군/)).toBeInTheDocument();
    expect(screen.queryByText(/7-9학년군/)).not.toBeInTheDocument();
});

test('keeps multiple selected standards visible and states that all are used for generation', async () => {
    const user = userEvent.setup();
    render(<StandardsSelectionHarness/>);

    const summary = screen.getByRole('status', { name: '선택한 성취기준' });
    expect(summary).toHaveTextContent('여러 개 함께 선택');
    await user.click(await screen.findByRole('checkbox', { name: /6과11-02/ }));
    await user.click(screen.getByRole('checkbox', { name: /6과11-03/ }));

    expect(summary).toHaveTextContent('2개를 모두 지도안 생성에 반영');
    expect(summary).toHaveTextContent('6과11-02');
    expect(summary).toHaveTextContent('6과11-03');
    expect(screen.getAllByRole('button', { name: /성취기준 선택 해제/ })).toHaveLength(2);
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

test('사회 교사는 AI 추천과 별개로 지리·일반사회 공식 목록을 직접 선택한다', () => {
    // Given / When
    render(<StandardsStep basics={middleSocialBasics} selected={[]} onChange={() => {}} onBack={() => {}} onNext={() => {}}/>);

    // Then
    expect(screen.getByText(/사회 · 지리\/일반사회/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 추천' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '교육과정에서 직접 선택' })).toBeInTheDocument();
    expect(screen.getByText('9사(지리)01-01')).toBeInTheDocument();
    expect(screen.queryByText(/^9역/)).not.toBeInTheDocument();
});

test('모든 과목에서 AI 추천을 받은 뒤에도 공식 목록 직접 검색을 유지한다', async () => {
    // Given
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ recommendations: [{ code: '6과11-02', text: '식물 기관의 구조와 기능을 관찰한다.', reason: '수업 주제와 연결됨' }] })));
    try {
        render(<StandardsStep basics={basics} selected={[]} onChange={() => {}} onBack={() => {}} onNext={() => {}}/>);

        // When
        await user.click(screen.getByRole('button', { name: 'AI로 추천받기' }));

        // Then
        expect(await screen.findByText('수업 주제와 연결됨')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '교육과정에서 직접 선택' })).toBeInTheDocument();
        expect(screen.getByLabelText('공식 성취기준 검색')).toBeInTheDocument();
    } finally {
        vi.unstubAllGlobals();
    }
});

test('직접 선택은 열 개를 넘기지 않고 기존 선택을 유지한다', async () => {
    // Given
    const user = userEvent.setup();
    const selected = Array.from({ length: 10 }, (_, index) => ({ code: `선택-${index + 1}`, text: `선택한 성취기준 ${index + 1}` }));
    const onChange = vi.fn();
    render(<StandardsStep basics={basics} selected={selected} onChange={onChange} onBack={() => {}} onNext={() => {}}/>);

    // When
    await user.click(screen.getByRole('checkbox', { name: /6과11-02/ }));

    // Then
    expect(screen.getByRole('alert')).toHaveTextContent('최대 10개');
    expect(onChange).not.toHaveBeenCalled();
});
