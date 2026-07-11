const splitLines = value => value.split('\n').map(item => item.trim()).filter(Boolean);

export function RubricEditor({ value, onChange }) {
    const updateTask = patch => onChange({ ...value, task: { ...value.task, ...patch } });
    const updateCriterion = (index, patch) => onChange({ ...value, rubric: { ...value.rubric, criteria: value.rubric.criteria.map((criterion, criterionIndex) => criterionIndex === index ? { ...criterion, ...patch } : criterion) } });
    const updateLevel = (index, levelId, description) => {
        const criterion = value.rubric.criteria[index];
        updateCriterion(index, { levels: { ...criterion.levels, [levelId]: description } });
    };
    return <div className="structured-editor assessment-editor">
        <section className="document-section"><h2>수행과제</h2>
            <label>과제명<input value={value.task.title} onChange={event => updateTask({ title: event.target.value })}/></label>
            <div className="field-grid field-grid--two"><label>상황<textarea rows="3" value={value.task.situation} onChange={event => updateTask({ situation: event.target.value })}/></label><label>학생 역할<textarea rows="3" value={value.task.role} onChange={event => updateTask({ role: event.target.value })}/></label><label>공유 대상<textarea rows="3" value={value.task.audience} onChange={event => updateTask({ audience: event.target.value })}/></label><label>산출물<textarea rows="3" value={value.task.product} onChange={event => updateTask({ product: event.target.value })}/></label></div>
            <div className="field-grid field-grid--two"><label>수행 절차 <span className="optional">한 줄에 하나</span><textarea rows="5" value={value.task.procedure.join('\n')} onChange={event => updateTask({ procedure: splitLines(event.target.value) })}/></label><label>제출 조건 <span className="optional">한 줄에 하나</span><textarea rows="5" value={value.task.conditions.join('\n')} onChange={event => updateTask({ conditions: splitLines(event.target.value) })}/></label><label>준비물 <span className="optional">한 줄에 하나</span><textarea rows="4" value={value.task.materials.join('\n')} onChange={event => updateTask({ materials: splitLines(event.target.value) })}/></label><label>유의점 <span className="optional">한 줄에 하나</span><textarea rows="4" value={value.task.cautions.join('\n')} onChange={event => updateTask({ cautions: splitLines(event.target.value) })}/></label></div>
        </section>
        <section className="document-section"><h2>4수준 분석적 루브릭</h2>
            <div className="rubric-table-wrap"><table className="rubric-editor-table"><thead><tr><th>평가 요소</th><th>배점</th>{value.rubric.levels.map(level => <th key={level.id}>{level.label}</th>)}<th>관찰 증거</th></tr></thead><tbody>{value.rubric.criteria.map((criterion, index) => <tr key={criterion.id}>
                <td data-label="평가 요소"><label className="rubric-field-label" htmlFor={`${criterion.id}-name`}>요소명<input id={`${criterion.id}-name`} value={criterion.name} onChange={event => updateCriterion(index, { name: event.target.value })}/></label><label className="rubric-field-label" htmlFor={`${criterion.id}-description`}>평가 내용<textarea id={`${criterion.id}-description`} rows="4" value={criterion.description} onChange={event => updateCriterion(index, { description: event.target.value })}/></label></td>
                <td data-label="배점"><label className="sr-only" htmlFor={`${criterion.id}-points`}>{criterion.name} 배점</label><input id={`${criterion.id}-points`} aria-label={`${criterion.name} 배점`} type="number" min="1" max="100" value={criterion.maxPoints} onChange={event => updateCriterion(index, { maxPoints: Number(event.target.value) })}/></td>
                {value.rubric.levels.map(level => <td data-label={level.label} key={level.id}><label className="sr-only" htmlFor={`${criterion.id}-${level.id}`}>{criterion.name} {level.label} 수준</label><textarea id={`${criterion.id}-${level.id}`} rows="6" value={criterion.levels[level.id]} onChange={event => updateLevel(index, level.id, event.target.value)}/></td>)}
                <td data-label="관찰 증거"><label className="sr-only" htmlFor={`${criterion.id}-evidence`}>{criterion.name} 관찰 증거</label><textarea id={`${criterion.id}-evidence`} rows="6" value={criterion.evidence} onChange={event => updateCriterion(index, { evidence: event.target.value })}/></td>
            </tr>)}</tbody></table></div>
        </section>
    </div>;
}
