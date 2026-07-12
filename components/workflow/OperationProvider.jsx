'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { advanceOperation, cancelOperation, createOperation, estimateOperationDuration, recordOperationDuration } from '@/lib/operation-state.js';
import { runWithConcurrency } from '@/lib/batch-queue.js';
import { OperationOverlay } from './OperationOverlay.jsx';

const fallbackOperations = {
    active: false,
    cancelActive: () => {},
    runOperation: async (_config, task) => {
        const controller = new AbortController();
        return task({ signal: controller.signal, setPhase: () => {}, update: () => {} });
    },
    runBatchOperation: async (config, worker) => runWithConcurrency(config.items, config.concurrency ?? 2, (item, index) => worker(item, index, { signal: new AbortController().signal, setPhase: () => {}, update: () => {} })),
};
const OperationContext = createContext(fallbackOperations);

export class OperationBusyError extends Error {
    constructor() {
        super('다른 작업이 진행 중입니다. 완료하거나 취소한 뒤 다시 시도해주세요.');
        this.name = 'OperationBusyError';
    }
}

export function OperationProvider({ children }) {
    const [operation, setOperation] = useState(null);
    const [visible, setVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState(null);
    const [now, setNow] = useState(() => Date.now());
    const activeRef = useRef(null);
    const operationRef = useRef(null);
    const durationSessionRef = useRef({});
    const noticeTimerRef = useRef(null);

    const publish = useCallback(next => {
        operationRef.current = next;
        setOperation(next);
    }, []);
    const showNotice = useCallback(next => {
        clearTimeout(noticeTimerRef.current);
        setNotice(next);
        noticeTimerRef.current = setTimeout(() => setNotice(null), 7_000);
    }, []);
    useEffect(() => () => {
        clearTimeout(noticeTimerRef.current);
        const active = activeRef.current;
        if (!active) return;
        active.cancelled = true;
        clearTimeout(active.delayTimer);
        active.controller.abort();
        activeRef.current = null;
    }, []);

    const runOperation = useCallback(async (config, task) => {
        if (activeRef.current) throw new OperationBusyError();
        const startedAt = Date.now();
        const profile = config.profile ?? { kind: config.kind, model: config.model, pages: config.pages, items: config.totalItems };
        const estimate = estimateOperationDuration(durationSessionRef.current, profile, config.fallbackRangeSeconds);
        const controller = new AbortController();
        const token = Symbol(config.kind);
        const active = { controller, token, cancelled: false, delayTimer: null, returnFocus: document.activeElement };
        activeRef.current = active;
        setBusy(true);
        publish(createOperation({ ...config, startedAt, estimate }));
        setNow(startedAt);
        setVisible(false);
        setNotice(null);
        active.delayTimer = setTimeout(() => {
            if (activeRef.current?.token === token) setVisible(true);
        }, 1_000);
        const update = patch => {
            if (activeRef.current?.token !== token || active.cancelled) return;
            publish(advanceOperation(operationRef.current, patch));
        };
        try {
            const value = await task({ signal: controller.signal, setPhase: phase => update({ phase }), update });
            if (activeRef.current?.token !== token || active.cancelled) return undefined;
            const completed = advanceOperation(operationRef.current, { phase: 'applying', status: 'completed' });
            publish(completed);
            setVisible(false);
            const durationSeconds = Math.max(0, (Date.now() - startedAt) / 1_000);
            durationSessionRef.current = recordOperationDuration(durationSessionRef.current, profile, durationSeconds);
            const summary = completed.isBatch
                ? `성공 ${completed.successItems}명 · 실패 ${completed.failureItems}명`
                : `${completed.label} 완료`;
            showNotice({ kind: completed.failureItems ? 'warning' : 'success', message: summary });
            return value;
        } catch (error) {
            if (active.cancelled || controller.signal.aborted) return undefined;
            publish(advanceOperation(operationRef.current, { status: 'failed', error: error instanceof Error ? error.message : '작업에 실패했습니다.' }));
            setVisible(false);
            throw error;
        } finally {
            clearTimeout(active.delayTimer);
            if (activeRef.current?.token === token) {
                activeRef.current = null;
                setBusy(false);
            }
        }
    }, [publish, showNotice]);

    const runBatchOperation = useCallback(async (config, worker) => {
        const execute = async items => {
            const results = await runOperation(
                { ...config, totalItems: items.length, profile: { ...(config.profile ?? {}), kind: config.kind, items: items.length } },
                async controls => {
                    const settled = [];
                    const resultsForBatch = await runWithConcurrency(items, config.concurrency ?? 2, (item, index) => worker(item, index, controls), progress => {
                        if (controls.signal.aborted) return;
                        if (progress.status === 'running') {
                            controls.update({ currentItem: { id: items[progress.index]?.id ?? progress.index, label: config.itemLabel?.(items[progress.index], progress.index) ?? `${progress.index + 1}번째 항목` } });
                            return;
                        }
                        settled[progress.index] = progress.status === 'fulfilled'
                            ? { itemId: items[progress.index]?.id ?? progress.index, status: 'fulfilled', value: progress.value }
                            : { itemId: items[progress.index]?.id ?? progress.index, status: 'rejected', reason: progress.reason instanceof Error ? progress.reason.message : String(progress.reason) };
                        const completed = settled.filter(Boolean);
                        controls.update({
                            completedResults: completed,
                            successItems: completed.filter(item => item.status === 'fulfilled').length,
                            failureItems: completed.filter(item => item.status === 'rejected').length,
                        });
                    }, { signal: controls.signal });
                    return resultsForBatch;
                },
            );
            if (!results) return [];
            const failed = results.map((result, index) => ({ item: items[index], result })).filter(entry => entry.result.status === 'rejected').map(entry => entry.item);
            if (failed.length) {
                clearTimeout(noticeTimerRef.current);
                setNotice({ kind: 'warning', message: `성공 ${results.length - failed.length}명 · 실패 ${failed.length}명`, retryLabel: `실패 ${failed.length}명만 다시 시도`, retry: () => execute(failed) });
            }
            return results;
        };
        return execute(config.items);
    }, [runOperation]);

    const cancel = useCallback(() => {
        const active = activeRef.current;
        if (!active || !operationRef.current) return;
        active.cancelled = true;
        active.controller.abort();
        publish(cancelOperation(operationRef.current, Date.now()));
        clearTimeout(active.delayTimer);
        activeRef.current = null;
        setBusy(false);
        setVisible(false);
        showNotice({ kind: 'warning', message: '작업을 취소했습니다. 완료된 결과는 유지됩니다.' });
    }, [publish, showNotice]);

    useEffect(() => {
        if (!visible) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(timer);
    }, [visible]);
    const value = useMemo(() => ({ active: busy, cancelActive: cancel, runBatchOperation, runOperation }), [busy, cancel, runBatchOperation, runOperation]);
    return <OperationContext.Provider value={value}>
        <div className={visible ? 'operation-host operation-host--busy' : 'operation-host'} aria-busy={visible} inert={visible ? true : undefined}>{children}</div>
        {visible && operation?.status === 'running' && (
            <OperationOverlay operation={operation} now={now} onCancel={cancel} returnFocus={activeRef.current?.returnFocus}/>
        )}
        {notice && <div className={`operation-notice operation-notice--${notice.kind}`} role="status" aria-live="polite"><span>{notice.message}</span>{notice.retry && <button type="button" className="secondary-button" onClick={() => { const retry = notice.retry; setNotice(null); retry(); }}>{notice.retryLabel}</button>}</div>}
    </OperationContext.Provider>;
}

export function useOperation() {
    return useContext(OperationContext);
}
