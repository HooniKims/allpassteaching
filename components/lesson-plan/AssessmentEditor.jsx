const feedbackLabels = {
    needsSupport: '도움이 필요한 학생 피드백',
    meets: '기대 수준 학생 피드백',
    exceeds: '심화 수준 학생 피드백',
};

export function AssessmentEditor({ sessionOrder, items, onChange }) {
    const updateItem = (index, key, nextValue) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: nextValue } : item));
    const updateFeedback = (index, key, nextValue) => onChange(items.map((item, itemIndex) => itemIndex === index ? {
        ...item,
        levelFeedback: { ...item.levelFeedback, [key]: nextValue },
    } : item));

    return <table className="formal-table assessment-table" aria-label={`${sessionOrder}차시 과정중심평가`}>
        <caption>과정중심평가</caption>
        <thead>
            <tr>
                <th scope="col">평가 요소</th>
                <th scope="col">평가 방법</th>
                <th scope="col">관찰 증거</th>
                <th scope="col">수준별 피드백</th>
            </tr>
        </thead>
        <tbody>
            {items.map((item, index) => {
                const prefix = `${sessionOrder}차시 평가 ${index + 1}`;
                const levelFeedback = item.levelFeedback ?? {};
                return <tr key={index}>
                    <td data-label="평가 요소"><textarea aria-label={`${prefix} 평가 요소`} value={item.element ?? ''} onChange={event => updateItem(index, 'element', event.target.value)} /></td>
                    <td data-label="평가 방법"><textarea aria-label={`${prefix} 평가 방법`} value={item.method ?? ''} onChange={event => updateItem(index, 'method', event.target.value)} /></td>
                    <td data-label="관찰 증거"><textarea aria-label={`${prefix} 관찰 증거`} value={item.evidence ?? ''} onChange={event => updateItem(index, 'evidence', event.target.value)} /></td>
                    <td data-label="수준별 피드백">
                        <label className="document-field">
                            <span>공통 피드백</span>
                            <textarea aria-label={`${prefix} 공통 피드백`} value={item.feedback ?? ''} onChange={event => updateItem(index, 'feedback', event.target.value)} />
                        </label>
                        {Object.entries(feedbackLabels).map(([key, label]) => <label className="document-field" key={key}>
                            <span>{label}</span>
                            <textarea aria-label={`${prefix} ${label}`} value={levelFeedback[key] ?? ''} onChange={event => updateFeedback(index, key, event.target.value)} />
                        </label>)}
                    </td>
                </tr>;
            })}
        </tbody>
    </table>;
}
