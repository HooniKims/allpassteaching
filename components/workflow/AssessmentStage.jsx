'use client';
import { useState } from 'react';
import { sourceHash } from '@/lib/source-hash';
import { assessmentOutputSchema } from '@/lib/assessment-schema';
import { RubricEditor } from './RubricEditor.jsx';

async function downloadAssessment(value) {
    const response = await fetch('/api/export-workflow/assessment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    if (!response.ok) throw new Error('PDF 저장에 실패했습니다.');
    const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${value.task.title}.pdf`; anchor.click(); URL.revokeObjectURL(url);
}

export function AssessmentStage({ lessonPlan, value, onChange }) {
    const [status, setStatus] = useState({ type: 'idle', message: '' });
    const currentSourceHash = sourceHash(lessonPlan);
    const stale = Boolean(value && value.sourceHash !== currentSourceHash);
    const total = value?.rubric.criteria.reduce((sum, criterion) => sum + (Number(criterion.maxPoints) || 0), 0) ?? 0;
    const validation = value ? assessmentOutputSchema.safeParse(value) : null;
    const readyForApproval = Boolean(validation?.success && !stale);
    const generate = async () => {
        setStatus({ type: 'loading', message: '성취기준과 수업 활동을 분석해 수행평가와 루브릭을 만들고 있습니다.' });
        try {
            const response = await fetch('/api/generate-assessment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonPlan }) });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.message || '수행평가를 생성하지 못했습니다.');
            onChange({ ...body.assessment, sourceHash: currentSourceHash, approved: false });
            setStatus({ type: 'done', message: '수행평가 초안을 만들었습니다. 배점과 수준 기술을 확인해주세요.' });
        } catch (error) { setStatus({ type: 'error', message: error.message || '다시 시도해주세요.' }); }
    };
    return <section className="workflow-stage workflow-stage--wide">
        <header className="workflow-stage__header"><div><p className="eyebrow">3단계 · 수행평가</p><h1>성취기준에 맞는 수행평가를 설계해요</h1><p>실제적 수행과제와 관찰 가능한 4수준 분석적 루브릭을 함께 만듭니다.</p></div><button type="button" disabled={status.type === 'loading'} onClick={generate}>{value ? '수행평가 다시 생성' : '수행평가 생성하기'}</button></header>
        {stale && <p className="stale-notice" role="status"><strong>이전 지도안으로 생성됨</strong><span>현재 편집본은 유지됩니다. 바뀐 지도안으로 다시 생성할 수 있습니다.</span></p>}
        {status.message && <p className={`status-line status-line--${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.message}</p>}
        {value && <><div className="stage-document-head"><div><span className="status-pill">{value.approved ? '교사 확인 완료' : 'AI 초안'}</span><strong>{value.task.title || '과제명 확인 필요'}</strong><p>루브릭 배점 합계 {total}점</p></div><div className="stage-document-actions"><button type="button" className="secondary-button" disabled={!validation?.success} onClick={() => downloadAssessment(value).catch(error => setStatus({ type: 'error', message: error.message }))}>PDF 저장</button><button type="button" disabled={!readyForApproval} onClick={() => onChange({ ...value, approved: !value.approved })}>{value.approved ? '확인 완료 취소' : '수행평가·루브릭 확인 완료'}</button></div></div>{validation && !validation.success && <p className="form-alert" role="alert">{total !== 100 ? `평가 요소 배점 합계가 100점이어야 합니다. 현재 ${total}점입니다.` : '과제명, 수행 조건, 평가 요소, 수준 설명과 관찰 증거를 모두 입력해주세요.'}</p>}<RubricEditor value={value} onChange={next => onChange({ ...next, approved: false })}/></>}
    </section>;
}
