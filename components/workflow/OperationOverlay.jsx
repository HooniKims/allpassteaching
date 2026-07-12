'use client';
import { useEffect, useRef } from 'react';
import { getOperationTiming } from '@/lib/operation-state.js';

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function OperationOverlay({ operation, now, onCancel }) {
    const panelRef = useRef(null);
    useEffect(() => {
        panelRef.current?.focus();
    }, []);
    const timing = getOperationTiming(operation, now);
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
            <p className="operation-overlay__timing">예상 시간 · {timing.label}</p>
            {operation.progress !== null
                ? <div className="operation-progress-wrap"><div className="operation-progress" role="progressbar" aria-label={operation.progressLabel} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(operation.progress)}>
                    <span style={{ transform: `scaleX(${operation.progress / 100})` }}/>
                </div><b>{Math.round(operation.progress)}%</b></div>
                : <div className="operation-progress operation-progress--indeterminate" aria-hidden="true"><span/></div>}
            {cancelAvailable
                ? <><button type="button" className="secondary-button" onClick={onCancel}>작업 취소</button><p className="operation-overlay__cost-note">이미 Upstage에 전송된 요청은 취소해도 비용이 발생할 수 있습니다.</p></>
                : operation.cancelable && <p className="operation-overlay__cost-note">5초 뒤 작업 취소를 선택할 수 있습니다.</p>}
        </section>
    </div>;
}
