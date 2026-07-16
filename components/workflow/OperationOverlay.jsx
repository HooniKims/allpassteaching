'use client';
import { useEffect, useRef } from 'react';
import { getOperationDisplayProgress } from '@/lib/operation-state';

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function OperationOverlay({ operation, now, onCancel }) {
    const panelRef = useRef(null);
    const displayProgress = getOperationDisplayProgress(operation, now);
    useEffect(() => {
        panelRef.current?.focus();
    }, []);
    const cancelAvailable = operation.cancelable && now - operation.startedAt >= 5_000;
    const handleDialogKeyDown = event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (cancelAvailable) onCancel();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...panelRef.current.querySelectorAll(focusableSelector)];
        if (!focusable.length) { event.preventDefault(); panelRef.current.focus(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === panelRef.current || !panelRef.current.contains(active))) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && (active === last || active === panelRef.current || !panelRef.current.contains(active))) { event.preventDefault(); first.focus(); }
    };
    return <div className="operation-overlay" data-testid="operation-overlay">
        <section className="operation-overlay__panel" role="dialog" aria-modal="true" aria-labelledby="operation-title" ref={panelRef} tabIndex="-1" onKeyDown={handleDialogKeyDown}>
            <p className="eyebrow">작업 진행 중</p>
            <h2 id="operation-title">{operation.label}</h2>
            <div className="operation-overlay__status" role="status" aria-label="작업 진행 상태" aria-live="polite">
                <strong>{operation.phaseLabel}</strong>
                {operation.isBatch && <span>{operation.completedItems}/{operation.totalItems}명 완료 · 성공 {operation.successItems}명 · 실패 {operation.failureItems}명 · 대기 {operation.pendingItems}명</span>}
                {operation.currentItem?.label && <span>현재 처리 · {operation.currentItem.label}</span>}
            </div>
            <div className="operation-progress-wrap"><div className="operation-progress" role="progressbar" aria-label={displayProgress.progressLabel} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(displayProgress.progress)}>
                <span style={{ transform: `scaleX(${displayProgress.progress / 100})` }}/>
            </div><b>{displayProgress.progressKind === 'estimated' && <span>예상 진행률 </span>}{Math.round(displayProgress.progress)}%</b></div>
            {cancelAvailable && <button type="button" className="secondary-button" onClick={onCancel}>작업 취소</button>}
        </section>
    </div>;
}
