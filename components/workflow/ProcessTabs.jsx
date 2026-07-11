import { useRef } from 'react';

export const teachingProcesses = [
    { id: 'lesson', number: '01', label: '지도안' },
    { id: 'worksheet', number: '02', label: '학습지' },
    { id: 'assessment', number: '03', label: '수행평가' },
    { id: 'grading', number: '04', label: 'OCR·채점' },
    { id: 'records', number: '05', label: '세특' },
];

const statusLabels = { complete: '완료', review: '검토 필요', prerequisite: '선행 단계 필요' };

export function ProcessTabs({ activeProcess, statuses, onChange }) {
    const tabsRef = useRef([]);
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
    return <nav className="process-rail" aria-label="교수·학습·평가·기록 프로세스">
        <div className="process-tabs" role="tablist" aria-label="5단계 프로세스">
            {teachingProcesses.map((process, index) => {
                const status = statuses[process.id] ?? 'prerequisite';
                return <button
                    key={process.id}
                    ref={element => { tabsRef.current[index] = element; }}
                    id={`process-tab-${process.id}`}
                    className={`process-tab process-tab--${status}`}
                    type="button"
                    role="tab"
                    aria-selected={activeProcess === process.id}
                    aria-controls={`process-panel-${process.id}`}
                    tabIndex={activeProcess === process.id ? 0 : -1}
                    onKeyDown={event => moveFocus(event, index)}
                    onClick={() => onChange(process.id)}
                >
                    <span className="process-tab__number" aria-hidden="true">{process.number}</span>
                    <span className="process-tab__copy"><strong>{process.label}</strong><small>{statusLabels[status]}</small></span>
                </button>;
            })}
        </div>
    </nav>;
}
