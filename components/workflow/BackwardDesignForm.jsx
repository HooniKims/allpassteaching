import { useState } from 'react';
import { BACKWARD_DESIGN_QUESTIONS } from '@/lib/assessment-request';

const examples = {
    desiredResult: '예: 자료를 해석해 자신의 결론을 근거와 함께 설명한다.',
    evidenceOfSuccess: '예: 보고서, 발표, 제작물처럼 직접 확인할 수 있는 증거를 적어주세요.',
    growthProcess: '예: 초안, 피드백 표시, 수정본과 수정 이유를 확인합니다.',
};

const splitComma = value => value.split(',').map(item => item.trim()).filter(Boolean);
const protectedPhrases = { desiredResult: '해낼 수 있길', evidenceOfSuccess: '판단할 수 있나요?' };
const questionLabel = (key, label) => {
    const phrase = protectedPhrases[key];
    if (!phrase) return label;
    const [before, after] = label.split(phrase);
    return <>{before}<span className="question-phrase">{phrase}</span>{after}</>;
};

export function BackwardDesignForm({ lessonPlan, value, onChange }) {
    const [status, setStatus] = useState({ type: 'idle', message: '' });
    const update = patch => onChange({ ...value, ...patch });
    const updateIntent = patch => update({ teacherIntent: { ...value.teacherIntent, ...patch } });
    const suggest = async () => {
        setStatus({ type: 'loading', message: '성취기준과 수업 내용을 바탕으로 관찰 가능한 증거를 제안하고 있습니다.' });
        try {
            const response = await fetch('/api/suggest-assessment-intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonPlan, desiredResult: value.teacherIntent.desiredResult }) });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.message || 'AI 초안을 제안하지 못했습니다.');
            updateIntent(body.suggestion);
            setStatus({ type: 'done', message: '제안 내용을 넣었습니다. 교사의 의도에 맞게 자유롭게 고쳐주세요.' });
        } catch (error) {
            setStatus({ type: 'error', message: error.message || '다시 시도해주세요.' });
        }
    };
    return <section className="document-section backward-design-form">
        <div className="section-heading"><div><p className="eyebrow">백워드 설계 · 도착점부터</p><h2>평가의 도착점을 먼저 정해볼까요?</h2></div><button type="button" className="secondary-button" disabled={!value.teacherIntent.desiredResult.trim() || status.type === 'loading'} onClick={suggest}>백워드 설계 AI 초안 제안</button></div>
        <div className="backward-question-list">{Object.entries(BACKWARD_DESIGN_QUESTIONS).map(([key, label], index) => <label key={key}>{questionLabel(key, label)}{index === 0 && <span aria-hidden="true"> *</span>}<textarea aria-label={label} required={index === 0} rows="3" value={value.teacherIntent[key]} placeholder={examples[key]} onChange={event => updateIntent({ [key]: event.target.value })}/><span className="field-help">{examples[key]}</span></label>)}</div>
        {status.message && <p className={`status-line status-line--${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.message}</p>}
        <div className="field-grid field-grid--two">
            <label>평가 이름<input value={value.assessmentName} onChange={event => update({ assessmentName: event.target.value })}/></label>
            <label>생성할 평가 총점<input type="number" min="1" max="1000" value={value.totalPoints} onChange={event => update({ totalPoints: Number(event.target.value) })}/></label>
            <label>성취수준 수<select value={value.levelCount} onChange={event => update({ levelCount: Number(event.target.value) })}>{[2, 3, 4, 5, 6].map(count => <option key={count} value={count}>{count}수준</option>)}</select></label>
            <label>과정 점수 비중(%)<input type="number" min="0" max="100" disabled={!value.includeProcessInScore} value={value.processWeightPercent} onChange={event => update({ processWeightPercent: Number(event.target.value) })}/></label>
            <label>산출물 유형 <span className="optional">쉼표로 구분</span><input value={value.outputTypes.join(', ')} onChange={event => update({ outputTypes: splitComma(event.target.value) })}/></label>
            <label>응답 유형 <span className="optional">쉼표로 구분</span><input value={value.answerTypes.join(', ')} onChange={event => update({ answerTypes: splitComma(event.target.value) })}/></label>
        </div>
        <fieldset className="inline-checks"><legend>수행 과정과 자료</legend>
            <label><input type="checkbox" checked={value.includeProcessInScore} onChange={event => update({ includeProcessInScore: event.target.checked, processWeightPercent: event.target.checked ? Math.max(1, value.processWeightPercent) : 0 })}/> 과정도 점수에 포함</label>
            {Object.entries({ draft: '초안', checkpoint: '중간 점검', revision: '수정', final: '최종본' }).map(([key, label]) => <label key={key}><input type="checkbox" checked={value.stages[key]} onChange={event => update({ stages: { ...value.stages, [key]: event.target.checked } })}/>{label}</label>)}
            <label><input type="checkbox" checked={value.visualAnalysisRequired} onChange={event => update({ visualAnalysisRequired: event.target.checked })}/> 수식·도표·그림 응답 포함</label>
            <label><input type="checkbox" checked={value.includeStudentCover} onChange={event => update({ includeStudentCover: event.target.checked })}/> 학생당 안내 표지 포함</label>
        </fieldset>
        <label>추가 요구사항<textarea rows="3" value={value.additionalRequirements} onChange={event => update({ additionalRequirements: event.target.value })}/></label>
    </section>;
}
