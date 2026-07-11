'use client';
import { useState } from 'react';
import { recommendWorksheetFormat, worksheetFormats } from '@/lib/worksheet-formats';
import { sourceHash } from '@/lib/source-hash';
import { WorksheetEditor } from './WorksheetEditor.jsx';

async function downloadWorkflowPdf(kind, value, filename) {
    const response = await fetch(`/api/export-workflow/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    if (!response.ok) throw new Error('PDF 저장에 실패했습니다.');
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

export function WorksheetStage({ lessonPlan, value, onChange }) {
    const recommended = recommendWorksheetFormat(lessonPlan.instructionModel);
    const [selectedFormatId, setSelectedFormatId] = useState(value?.formatId ?? recommended.id);
    const [status, setStatus] = useState({ type: 'idle', message: '' });
    const currentSourceHash = sourceHash(lessonPlan);
    const stale = Boolean(value && value.sourceHash !== currentSourceHash);
    const generate = async () => {
        setStatus({ type: 'loading', message: '수업 모형과 지도안을 분석해 학습지를 만들고 있습니다.' });
        try {
            const response = await fetch('/api/generate-worksheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonPlan, selectedFormatId }) });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.message || '학습지를 생성하지 못했습니다.');
            onChange({ ...body.worksheet, sourceHash: currentSourceHash });
            setStatus({ type: 'done', message: '학습지 초안을 만들었습니다. 교사가 내용을 확인하고 수정해주세요.' });
        } catch (error) { setStatus({ type: 'error', message: error.message || '다시 시도해주세요.' }); }
    };
    return <section className="workflow-stage workflow-stage--wide">
        <header className="workflow-stage__header"><div><p className="eyebrow">2단계 · 학습지</p><h1>수업 흐름에 맞는 학습지를 만들어요</h1><p>수업 모형의 사고 과정을 학생이 직접 기록할 수 있는 형식을 선택합니다.</p></div></header>
        <div className="generation-toolbar"><label>학습지 형식<select aria-label="학습지 형식" value={selectedFormatId} onChange={event => setSelectedFormatId(event.target.value)}>{worksheetFormats.map(format => <option key={format.id} value={format.id}>{format.name}</option>)}</select><small>추천: {recommended.name} · {recommended.guide}</small></label><button type="button" disabled={status.type === 'loading'} onClick={generate}>{value ? '선택 형식으로 다시 생성' : '학습지 생성하기'}</button></div>
        {stale && <p className="stale-notice" role="status"><strong>이전 지도안으로 생성됨</strong><span>지도안이 바뀌었습니다. 현재 편집본은 유지되며 다시 생성할 수 있습니다.</span></p>}
        {status.message && <p className={`status-line status-line--${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.message}</p>}
        {value && <><div className="stage-document-head"><div><span className="status-pill">AI 초안</span><strong>{value.formatName}</strong><p>{value.selectionReason}</p></div><button type="button" className="secondary-button" onClick={() => downloadWorkflowPdf('worksheet', value, `${value.document.title}.pdf`).catch(error => setStatus({ type: 'error', message: error.message }))}>PDF 저장</button></div><WorksheetEditor value={value} onChange={onChange}/></>}
    </section>;
}
