const steps = [
    ['수업 정보', '학교급·과목·차시'], ['성취기준', '직접 선택 또는 AI 추천'],
    ['수업 모형', '목적에 맞는 모형 선택'], ['지도안 완성', '생성·편집·내보내기'],
];

export function StepNavigation({ current, maxReached = current, onStepChange = () => {} }) {
    return <nav className="step-nav" aria-label="지도안 작성 단계">
        <div className="step-nav__brand"><span aria-hidden="true">올</span><strong>올패스 티칭</strong></div>
        <ol>{steps.map(([name, description], index) => {
            const step = index + 1;
            const available = step <= maxReached;
            return <li className={current === step ? 'is-current' : maxReached > step ? 'is-done' : ''} key={name} aria-current={current === step ? 'step' : undefined}>
                <button type="button" aria-label={`${name} 단계로 이동`} disabled={!available} onClick={() => onStepChange(step)}>
                    <span className="step-nav__number">{maxReached > step ? '✓' : step}</span><span><strong>{name}</strong><small>{description}</small></span>
                </button>
            </li>;
        })}</ol>
    </nav>;
}
