import { useEffect, useRef } from 'react';

export const teachingProcesses = [
    { id: 'lesson', number: '01', label: '지도안' },
    { id: 'worksheet', number: '02', label: '학습지' },
    { id: 'assessment', number: '03', label: '수행평가' },
    { id: 'grading', number: '04', label: 'OCR·채점' },
    { id: 'records', number: '05', label: '세특' },
];

const statusLabels = { complete: '완료', review: '검토·재생성 필요', prerequisite: '선행 단계 필요' };
const statusDescriptions = {
    complete: '현재 단계의 결과가 최신 상태입니다.',
    review: '해당 단계의 결과가 아직 없거나, 앞 단계 변경으로 다시 생성 또는 교사 확인이 필요합니다.',
    prerequisite: '이 단계를 시작하려면 앞 단계의 결과가 필요합니다.',
};

export function ProcessTabs({ activeProcess, statuses, onChange }) {
    const tabsRef = useRef([]);
    const railRef = useRef(null);
    useEffect(() => {
        const activeIndex = teachingProcesses.findIndex(process => process.id === activeProcess);
        const activeTab = tabsRef.current[activeIndex];
        const rail = railRef.current;
        if (!activeTab || !rail?.scrollTo) return;
        const tabBounds = activeTab.getBoundingClientRect();
        const railBounds = rail.getBoundingClientRect();
        const leftOverflow = tabBounds.left - railBounds.left;
        const rightOverflow = tabBounds.right - railBounds.right;
        const delta = leftOverflow < 0 ? leftOverflow : rightOverflow > 0 ? rightOverflow : 0;
        if (delta !== 0) rail.scrollTo({ left: Math.max(0, rail.scrollLeft + delta), behavior: 'auto' });
    }, [activeProcess]);
    const moveFocus = (event, index) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % teachingProcesses.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + teachingProcesses.length) % teachingProcesses.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = teachingProcesses.length - 1;
        tabsRef.current[nextIndex]?.focus();
    };
    return <nav ref={railRef} className="process-rail" aria-label="교수·학습·평가·기록 프로세스">
        <div className="process-rail__inner">
            <span className="process-signature" role="img" aria-label="by HooniKim"><span aria-hidden="true">by</span><strong aria-hidden="true">HooniKim</strong></span>
            <div className="process-tabs" role="tablist" aria-label="5단계 프로세스">
                {teachingProcesses.map((process, index) => {
                    const status = statuses[process.id] ?? 'prerequisite';
                    const statusDescriptionId = `process-tab-${process.id}-status-help`;
                    return <button
                        key={process.id}
                        ref={element => { tabsRef.current[index] = element; }}
                        id={`process-tab-${process.id}`}
                        className={`process-tab process-tab--${status}`}
                        type="button"
                        role="tab"
                        aria-selected={activeProcess === process.id}
                        aria-controls={`process-panel-${process.id}`}
                        aria-describedby={statusDescriptionId}
                        tabIndex={activeProcess === process.id ? 0 : -1}
                        onKeyDown={event => moveFocus(event, index)}
                        onClick={() => onChange(process.id)}
                    >
                        <span className="process-tab__number" aria-hidden="true">{process.number}</span>
                        <span className="process-tab__copy"><strong>{process.label}</strong><small title={statusDescriptions[status]}>{statusLabels[status]}</small></span>
                        <span id={statusDescriptionId} className="sr-only">{statusDescriptions[status]}</span>
                    </button>;
                })}
            </div>
        </div>
    </nav>;
}
