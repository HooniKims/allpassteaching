import { normalizeEditorLines, splitEditorLines } from './editor-lines.js';

function LinesField({ label, value, onChange }) {
    return <label><span>{label}</span><textarea aria-label={label} value={(value ?? []).join('\n')} onChange={event => onChange(splitEditorLines(event.target.value))} onBlur={event => onChange(normalizeEditorLines(event.target.value))}/></label>;
}

export function DetailedPlanEditor({ value, onChange }) {
    const detail = value.detailedPlan;
    const updateDetail = patch => onChange({ ...value, detailedPlan: { ...detail, ...patch } });
    const updateSequence = (index, patch) => updateDetail({
        unitSequence: detail.unitSequence.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    });
    const addSequence = () => updateDetail({
        unitSequence: [...detail.unitSequence, { session: `${detail.unitSequence.length + 1}차시`, topic: '차시 주제', learningGoal: '학습 목표', focus: '지도 및 평가 중점' }],
    });
    const removeSequence = index => updateDetail({ unitSequence: detail.unitSequence.filter((_, itemIndex) => itemIndex !== index) });

    return <section className="lesson-document-page lesson-document-page--detail" aria-labelledby="detailed-plan-title">
        <p className="lesson-document-page__running-title">교수·학습 과정안 · 세안</p>
        <h1 id="detailed-plan-title">세안 설계 개요</h1>
        <p className="detailed-plan-intro">단원 전체 맥락과 학생 분석을 포함한 상세 지도안입니다. 모든 내용은 교사가 직접 수정할 수 있습니다.</p>
        <div className="detailed-plan-fields">
            <label><span>수업자 의도 및 지도 중점</span><textarea aria-label="수업자 의도 및 지도 중점" value={detail.teacherIntent} onChange={event => updateDetail({ teacherIntent: event.target.value })}/></label>
            <label><span>단원 개관</span><textarea aria-label="단원 개관" value={detail.unitOverview} onChange={event => updateDetail({ unitOverview: event.target.value })}/></label>
            <LinesField label="단원 목표" value={detail.unitGoals} onChange={unitGoals => updateDetail({ unitGoals })}/>
            <label><span>학습자 분석 및 지도 대책</span><textarea aria-label="학습자 분석 및 지도 대책" value={detail.learnerAnalysis} onChange={event => updateDetail({ learnerAnalysis: event.target.value })}/></label>
            <label><span>수업 모형·설계 틀 적용 전략</span><textarea aria-label="수업 모형·설계 틀 적용 전략" value={detail.teachingStrategy} onChange={event => updateDetail({ teachingStrategy: event.target.value })}/></label>
        </div>
        <div className="unit-sequence-editor">
            <div className="unit-sequence-editor__heading"><h2>단원 지도 계획</h2><button type="button" className="secondary-button" onClick={addSequence}>차시 추가</button></div>
            <div className="unit-sequence-table-wrap"><table className="formal-table unit-sequence-table">
                <caption className="sr-only">단원 지도 계획 편집</caption>
                <thead><tr><th scope="col">차시</th><th scope="col">주제</th><th scope="col">학습 목표</th><th scope="col">지도·평가 중점</th><th scope="col">관리</th></tr></thead>
                <tbody>{detail.unitSequence.map((item, index) => <tr key={`${item.session}-${index}`}>
                    <td data-label="차시"><input aria-label={`${index + 1}번째 단원 계획 차시`} value={item.session} onChange={event => updateSequence(index, { session: event.target.value })}/></td>
                    <td data-label="주제"><textarea aria-label={`${index + 1}번째 단원 계획 주제`} value={item.topic} onChange={event => updateSequence(index, { topic: event.target.value })}/></td>
                    <td data-label="학습 목표"><textarea aria-label={`${index + 1}번째 단원 계획 학습 목표`} value={item.learningGoal} onChange={event => updateSequence(index, { learningGoal: event.target.value })}/></td>
                    <td data-label="지도·평가 중점"><textarea aria-label={`${index + 1}번째 단원 계획 지도 및 평가 중점`} value={item.focus} onChange={event => updateSequence(index, { focus: event.target.value })}/></td>
                    <td data-label="관리"><button type="button" className="text-button" aria-label={`${index + 1}번째 단원 계획 삭제`} disabled={detail.unitSequence.length <= 1} onClick={() => removeSequence(index)}>삭제</button></td>
                </tr>)}</tbody>
            </table></div>
        </div>
        <div className="detailed-plan-fields detailed-plan-fields--two">
            <LinesField label="판서·화면 및 자료 활용 계획" value={detail.boardPlan} onChange={boardPlan => updateDetail({ boardPlan })}/>
            <LinesField label="참고 자료" value={detail.references} onChange={references => updateDetail({ references })}/>
        </div>
    </section>;
}
