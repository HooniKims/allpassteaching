const gradeOptions = { elementary: ['1','2','3','4','5','6'], middle: ['1','2','3'], high: ['1','2','3'] };
const subjectOptions = { elementary: ['국어','수학','사회','과학','도덕','체육','음악','미술','영어','통합교과','실과·기술가정·정보'], middle: ['국어','수학','사회','과학','도덕','체육','음악','미술','영어','실과·기술가정·정보','중학교 선택'], high: ['국어','수학','사회','과학','도덕','체육','음악','미술','영어','한문','교양'] };

export function LessonBasicsStep({ value, onChange, onNext }) {
    const update = (key, next) => onChange({ ...value, [key]: next });
    const submit = event => {
        event.preventDefault();
        if (!value.schoolLevel || !value.grade || !value.subject || !value.intent.trim()) return update('error', '필수 정보를 확인해주세요');
        onNext();
    };
    return <form className="basics" onSubmit={submit}>
        <header><p className="eyebrow">1단계 · 수업 정보</p><h1>어떤 수업을 준비하시나요?</h1><p>수업의 기본 정보를 알려주시면 교육과정 연결을 도와드릴게요.</p></header>
        {value.error && <p className="form-alert" role="alert">{value.error}</p>}
        <div className="field-grid">
            <label>학교급<select aria-label="학교급" value={value.schoolLevel} onChange={event => onChange({ ...value, schoolLevel: event.target.value, grade: '', subject: '', error: '' })}><option value="">선택</option><option value="elementary">초등학교</option><option value="middle">중학교</option><option value="high">일반고등학교</option></select></label>
            <label>학년<select aria-label="학년" value={value.grade} disabled={!value.schoolLevel} onChange={event => update('grade', event.target.value)}><option value="">선택</option>{(gradeOptions[value.schoolLevel] || []).map(grade => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
            <label>과목<select aria-label="과목" value={value.subject} disabled={!value.schoolLevel} onChange={event => update('subject', event.target.value)}><option value="">선택</option>{(subjectOptions[value.schoolLevel] || []).map(subject => <option key={subject}>{subject}</option>)}</select></label>
        </div>
        <fieldset><legend>수업 범위</legend><div className="choice-row">
            <label className={value.mode === 'single' ? 'choice-tile is-selected' : 'choice-tile'}><input aria-label="한 차시 수업" type="radio" name="mode" checked={value.mode === 'single'} onChange={() => onChange({ ...value, mode: 'single', sessions: 1 })}/><strong>한 차시 수업</strong><span>한 번의 수업에서 완결되는 지도안</span></label>
            <label className={value.mode === 'multi' ? 'choice-tile is-selected' : 'choice-tile'}><input aria-label="연속 차시 수업" type="radio" name="mode" checked={value.mode === 'multi'} onChange={() => onChange({ ...value, mode: 'multi', sessions: 2 })}/><strong>연속 차시 수업</strong><span>전체 흐름과 차시별 지도안을 함께 생성</span></label>
        </div></fieldset>
        {value.mode === 'multi' && <label>차시 수<input aria-label="차시 수" type="number" min="2" max="10" value={value.sessions} onChange={event => update('sessions', Number(event.target.value))}/></label>}
        <label>수업할 개념 및 내용<textarea aria-label="수업할 개념 및 내용" rows="5" value={value.intent} onChange={event => update('intent', event.target.value)} placeholder="예: 식물이 자라는 데 필요한 조건을 예상하고 실험으로 확인한다."/></label>
        <label>학생 특성 또는 지원 필요 사항 <span className="optional">선택</span><textarea rows="3" value={value.studentNeeds} onChange={event => update('studentNeeds', event.target.value)} placeholder="예: 관찰 기록에 어려움이 있는 학생에게 문장 틀을 제공해요."/></label>
        <footer><span>입력 내용은 이 기기에 임시 저장됩니다.</span><button type="submit">성취기준 찾기 <span aria-hidden="true">→</span></button></footer>
    </form>;
}
