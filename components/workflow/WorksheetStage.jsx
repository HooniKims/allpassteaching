'use client';
import { useMemo, useState } from 'react';
import { recommendWorksheetFormat, worksheetFormats } from '@/lib/worksheet-formats';
import { worksheetQuestionTypes } from '@/lib/worksheet-schema';
import { sourceHash } from '@/lib/source-hash';
import { WorksheetEditor } from './WorksheetEditor.jsx';

async function downloadWorkflowPdf(kind, value, filename) {
    const response = await fetch(`/api/export-workflow/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    const body = response.ok ? await response.blob() : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'PDF 저장에 실패했습니다. 편집 내용을 확인해주세요.');
    const url = URL.createObjectURL(body);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function upgradeWorksheet(value, lessonPlan) {
    if (!value) return null;
    const defaultCodes = lessonPlan.standards.map(standard => standard.code);
    return {
        ...value,
        standards: value.standards ?? lessonPlan.standards,
        generationRequest: value.generationRequest ?? { additionalRequirements: '', questionTypes: ['descriptive'] },
        document: {
            ...value.document,
            sections: value.document.sections.map(section => ({
                ...section,
                questions: section.questions.map(question => ({
                    type: 'descriptive',
                    standardCodes: defaultCodes,
                    ...question,
                })),
            })),
        },
    };
}

export function WorksheetStage({ lessonPlan, value, onChange }) {
    const recommended = recommendWorksheetFormat(lessonPlan.instructionModel);
    const upgradedValue = useMemo(() => upgradeWorksheet(value, lessonPlan), [value, lessonPlan]);
    const [selectedFormatId, setSelectedFormatId] = useState(value?.formatId ?? recommended.id);
    const [generationRequest, setGenerationRequest] = useState(upgradedValue?.generationRequest ?? { additionalRequirements: '', questionTypes: ['descriptive'] });
    const [status, setStatus] = useState({ type: 'idle', message: '' });
    const currentSourceHash = sourceHash(lessonPlan);
    const stale = Boolean(value && value.sourceHash !== currentSourceHash);
    const toggleType = type => setGenerationRequest(current => ({
        ...current,
        questionTypes: current.questionTypes.includes(type)
            ? current.questionTypes.length === 1 ? current.questionTypes : current.questionTypes.filter(item => item !== type)
            : [...current.questionTypes, type],
    }));
    const generate = async () => {
        setStatus({ type: 'loading', message: '수업 모형, 성취기준, 요청한 문항 유형을 분석해 학습지를 만들고 있습니다.' });
        try {
            const response = await fetch('/api/generate-worksheet', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lessonPlan, selectedFormatId, generationRequest }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.message || '학습지를 생성하지 못했습니다.');
            onChange({ ...body.worksheet, sourceHash: currentSourceHash });
            setStatus({ type: 'done', message: '학습지 초안을 만들었습니다. 교사가 내용을 확인하고 수정해주세요.' });
        } catch (error) { setStatus({ type: 'error', message: error.message || '다시 시도해주세요.' }); }
    };
    const download = (kind, suffix) => downloadWorkflowPdf(kind, upgradedValue, `${upgradedValue.document.title}-${suffix}.pdf`).catch(error => setStatus({ type: 'error', message: error.message }));
    return <section className="workflow-stage workflow-stage--wide">
        <header className="workflow-stage__header"><div><p className="eyebrow">2단계 · 학습지</p><h1>수업 흐름에 맞는 학습지를 만들어요</h1><p>수업 모형의 사고 과정과 성취기준을 학생이 직접 기록할 문항으로 구성합니다.</p></div></header>
        <section className="worksheet-request" aria-label="학습지 생성 설정">
            <div className="worksheet-request__grid">
                <label><span>학습지 형식</span><select aria-label="학습지 형식" value={selectedFormatId} onChange={event => setSelectedFormatId(event.target.value)}>{worksheetFormats.map(format => <option key={format.id} value={format.id}>{format.name}</option>)}</select><small>추천: {recommended.name} · {recommended.guide}</small></label>
                <label>학습지 추가 요구사항<textarea aria-label="학습지 추가 요구사항" rows="4" value={generationRequest.additionalRequirements} onChange={event => setGenerationRequest(current => ({ ...current, additionalRequirements: event.target.value }))} placeholder="예: 그래프 해석 근거 문항을 넣어 주세요."/></label>
            </div>
            <fieldset className="question-type-picker"><legend>포함할 문항 유형</legend><p>필요한 유형을 하나 이상 선택하세요. AI 생성 후에도 유형과 내용을 바꿀 수 있습니다.</p><div>{worksheetQuestionTypes.map(type => <label key={type.id}><input type="checkbox" checked={generationRequest.questionTypes.includes(type.id)} onChange={() => toggleType(type.id)}/><span>{type.label}</span></label>)}</div></fieldset>
            <button type="button" disabled={status.type === 'loading'} onClick={generate}>{value ? '요청 내용으로 다시 생성' : '학습지 생성하기'}</button>
        </section>
        {stale && <p className="stale-notice" role="status"><strong>이전 지도안으로 생성됨</strong><span>지도안이 바뀌었습니다. 현재 편집본은 유지되며 다시 생성할 수 있습니다.</span></p>}
        {status.message && <p className={`status-line status-line--${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.message}</p>}
        {upgradedValue && <><div className="stage-document-head"><div><span className="status-pill">AI 초안</span><strong>{upgradedValue.formatName}</strong><p>{upgradedValue.selectionReason}</p></div><div className="stage-document-actions"><button type="button" className="secondary-button" onClick={() => download('worksheet-student', '학생용')}>학생용 PDF</button><button type="button" className="secondary-button" onClick={() => download('worksheet-teacher', '교사용-답안')}>교사용 PDF</button></div></div><WorksheetEditor value={upgradedValue} onChange={onChange}/></>}
    </section>;
}
