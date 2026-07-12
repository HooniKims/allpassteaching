import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { OperationProvider, useOperation } from '@/components/workflow/OperationProvider.jsx';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((next, fail) => { resolve = next; reject = fail; });
    return { promise, reject, resolve };
}

function SingleHarness({ task, onSignal = () => {} }) {
    const { runOperation } = useOperation();
    const [result, setResult] = useState('대기');
    const start = async () => {
        const value = await runOperation(
            { kind: 'ocr', label: '학생 답안 분석', phase: 'upstageWaiting', cancelable: true },
            async controls => { onSignal(controls.signal); return task(controls); },
        );
        if (value !== undefined) setResult(value);
    };
    return <><button type="button" onClick={start}>분석 시작</button><output>{result}</output></>;
}

afterEach(() => {
    vi.useRealTimers();
});

test('Given a fast task When it finishes before one second Then no blocking overlay is shown', async () => {
    // Given
    const task = deferred();
    render(<OperationProvider><SingleHarness task={() => task.promise}/></OperationProvider>);

    // When
    await userEvent.click(screen.getByRole('button', { name: '분석 시작' }));
    await act(async () => task.resolve('완료됨'));

    // Then
    expect(screen.queryByTestId('operation-overlay')).not.toBeInTheDocument();
    expect(await screen.findByText('완료됨')).toBeInTheDocument();
});

test('Given an active task When the provider unmounts Then every pending display timer is cleared', async () => {
    // Given
    vi.useFakeTimers();
    const task = deferred();
    const view = render(<OperationProvider><SingleHarness task={() => task.promise}/></OperationProvider>);
    fireEvent.click(screen.getByRole('button', { name: '분석 시작' }));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    // When
    await act(async () => view.unmount());

    // Then
    expect(vi.getTimerCount()).toBe(0);
});

test('Given the overlay is visible When the provider unmounts Then cleanup does not add a focus restoration timer', async () => {
    // Given
    vi.useFakeTimers();
    const task = deferred();
    const view = render(<OperationProvider><SingleHarness task={() => task.promise}/></OperationProvider>);
    fireEvent.click(screen.getByRole('button', { name: '분석 시작' }));
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId('operation-overlay')).toBeInTheDocument();
    const timerCountBeforeUnmount = vi.getTimerCount();

    // When
    await act(async () => view.unmount());

    // Then
    expect(vi.getTimerCount()).toBe(timerCountBeforeUnmount - 1);
});

test('Given an opaque request When it lasts one second Then phase and approximate ETA are announced without a fake percent', async () => {
    // Given
    vi.useFakeTimers();
    const task = deferred();
    render(<OperationProvider><SingleHarness task={() => task.promise}/></OperationProvider>);
    fireEvent.click(screen.getByRole('button', { name: '분석 시작' }));

    // When
    await act(async () => vi.advanceTimersByTime(1_000));

    // Then
    expect(screen.getByTestId('operation-overlay')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '작업 진행 상태' })).toHaveTextContent('Upstage 응답 대기');
    expect(screen.getByText(/예상 시간/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    await act(async () => task.resolve('완료됨'));
});

test('Given a cancellable request When five seconds pass and cancel is chosen Then the signal aborts and focus returns', async () => {
    // Given
    vi.useFakeTimers();
    const task = deferred();
    let capturedSignal;
    render(<OperationProvider><SingleHarness task={() => task.promise} onSignal={signal => { capturedSignal = signal; }}/></OperationProvider>);
    const startButton = screen.getByRole('button', { name: '분석 시작' });
    startButton.focus();
    fireEvent.click(startButton);
    await act(async () => vi.advanceTimersByTime(1_000));
    await act(async () => vi.advanceTimersByTime(4_000));
    const dialog = screen.getByRole('dialog', { name: '학생 답안 분석' });
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: '작업 취소' })).toHaveFocus();

    // When
    fireEvent.click(screen.getByRole('button', { name: '작업 취소' }));
    await act(async () => vi.advanceTimersByTime(0));

    // Then
    expect(capturedSignal.aborted).toBe(true);
    expect(screen.queryByTestId('operation-overlay')).not.toBeInTheDocument();
    expect(screen.getByText(/작업을 취소했습니다/)).toBeInTheDocument();
    expect(startButton).toHaveFocus();
    await act(async () => task.resolve('늦은 결과'));
    expect(screen.queryByText('늦은 결과')).not.toBeInTheDocument();
});

test('Given cancellation is still guarded When Escape is pressed Then the running operation stays visible and active', async () => {
    // Given
    vi.useFakeTimers();
    const task = deferred();
    let capturedSignal;
    render(<OperationProvider><SingleHarness task={() => task.promise} onSignal={signal => { capturedSignal = signal; }}/></OperationProvider>);
    fireEvent.click(screen.getByRole('button', { name: '분석 시작' }));
    await act(async () => vi.advanceTimersByTime(1_000));
    const dialog = screen.getByRole('dialog', { name: '학생 답안 분석' });

    // When
    fireEvent.keyDown(dialog, { key: 'Escape' });

    // Then
    expect(capturedSignal.aborted).toBe(false);
    expect(dialog).toBeInTheDocument();
    expect(screen.queryByText(/작업을 취소했습니다/)).not.toBeInTheDocument();
    await act(async () => task.resolve('완료됨'));
});

test('Given cancellation is available When Escape is pressed repeatedly Then the button cancellation path aborts once, restores focus, and ignores late completion', async () => {
    // Given
    vi.useFakeTimers();
    const task = deferred();
    let capturedSignal;
    let abortCount = 0;
    render(<OperationProvider><SingleHarness task={() => task.promise} onSignal={signal => {
        capturedSignal = signal;
        signal.addEventListener('abort', () => { abortCount += 1; });
    }}/></OperationProvider>);
    const startButton = screen.getByRole('button', { name: '분석 시작' });
    startButton.focus();
    fireEvent.click(startButton);
    await act(async () => vi.advanceTimersByTime(1_000));
    await act(async () => vi.advanceTimersByTime(4_000));
    const dialog = screen.getByRole('dialog', { name: '학생 답안 분석' });
    expect(screen.getByRole('button', { name: '작업 취소' })).toBeVisible();

    // When
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });
    await act(async () => vi.advanceTimersByTime(0));

    // Then
    expect(capturedSignal.aborted).toBe(true);
    expect(abortCount).toBe(1);
    expect(screen.queryByTestId('operation-overlay')).not.toBeInTheDocument();
    expect(screen.getByText(/작업을 취소했습니다/)).toBeInTheDocument();
    expect(startButton).toHaveFocus();
    await act(async () => task.resolve('늦은 결과'));
    expect(screen.queryByText('늦은 결과')).not.toBeInTheDocument();
});

function BatchHarness({ worker }) {
    const { runBatchOperation } = useOperation();
    const [completed, setCompleted] = useState([]);
    const start = async items => {
        const results = await runBatchOperation({ kind: 'records', label: '세특 일괄 생성', items, itemLabel: item => item.name, concurrency: 1 }, worker);
        setCompleted(current => [...current, ...results.filter(result => result.status === 'fulfilled').map(result => result.value)]);
    };
    return <><button type="button" onClick={() => start([{ id: 'a', name: '김하늘' }, { id: 'b', name: '이바다' }])}>일괄 생성</button><output>{completed.join(',')}</output></>;
}

test('Given a two-student batch with one failure When it completes Then actual counts and failed-only retry are available', async () => {
    // Given
    const attempts = [];
    const worker = vi.fn(async item => {
        attempts.push(item.id);
        if (item.id === 'b' && attempts.filter(id => id === 'b').length === 1) throw new Error('생성 실패');
        return item.name;
    });
    render(<OperationProvider><BatchHarness worker={worker}/></OperationProvider>);

    // When
    await userEvent.click(screen.getByRole('button', { name: '일괄 생성' }));
    await screen.findByText('성공 1명 · 실패 1명');
    await userEvent.click(screen.getByRole('button', { name: '실패 1명만 다시 시도' }));

    // Then
    await waitFor(() => expect(attempts).toEqual(['a', 'b', 'b']));
    expect(screen.getByText('성공 1명 · 실패 0명')).toBeInTheDocument();
});
