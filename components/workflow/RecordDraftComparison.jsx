export function RecordDraftComparison({ studentName, record, candidateCurrent, onApply, onKeep }) {
    if (!record.candidateText) return null;
    return <section className="record-comparison" aria-label={`${studentName} 기존 문장과 새 초안 비교`}>
        <header><div><p className="eyebrow">적용 전 비교</p><h3>현재 문장을 바꾸지 않고 <span className="nowrap">새 초안</span>을 만들었어요</h3></div>{!candidateCurrent && <span className="record-comparison__stale">근거가 바뀌어 다시 생성해야 합니다.</span>}</header>
        <div className="record-comparison__grid">
            <section><h4>현재 교사 문장</h4><p>{record.text}</p></section>
            <section><h4>새 AI 초안</h4><p>{record.candidateText}</p></section>
        </div>
        <p className="record-comparison__note">위의 승인된 근거와 비교한 뒤 선택하세요. <span className="nowrap">자동으로 덮어쓰지 않습니다.</span></p>
        <div className="record-comparison__actions">
            <button type="button" disabled={!candidateCurrent} onClick={onApply}>{studentName} 새 초안 적용</button>
            <button type="button" className="secondary-button" onClick={onKeep}>{studentName} 기존 문장 유지</button>
        </div>
    </section>;
}
