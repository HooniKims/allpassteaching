'use client';
import { useMemo, useState } from 'react';
import { assessmentDesignSchema, assessmentOutputSchema } from '@/lib/assessment-schema';
import { assessmentRequestForLesson } from '@/lib/assessment-request';
import { extractAssessmentDesign } from '@/lib/assessment-design';
import { sourceHash } from '@/lib/source-hash';
import { downloadFilename } from '@/lib/download-filename';
import { BackwardDesignForm } from './BackwardDesignForm.jsx';
import { RubricEditor } from './RubricEditor.jsx';
import { AssessmentSheetEditor } from './AssessmentSheetEditor.jsx';
import { AssessmentCoverEditor } from './AssessmentCoverEditor.jsx';
import { OperationBusyError, useOperation } from './OperationProvider.jsx';

async function postGeneration(body, signal) {
    const response = await fetch('/api/generate-assessment', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(responseBody.message || '수행평가를 생성하지 못했습니다.');
    return responseBody;
}

async function downloadFile(url, value, filename, signal) {
    const response = await fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || '파일 저장에 실패했습니다.');
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
}

const rubricFormats = [{ id: 'pdf', label: 'PDF' }, { id: 'hwpx', label: 'HWPX' }, { id: 'docx', label: 'DOCX' }, { id: 'xlsx', label: 'Excel' }];
const sheetFormats = [{ id: 'pdf', label: 'PDF' }, { id: 'hwpx', label: 'HWPX' }];

function SaveMenu({ label, formats, onSave, disabled }) {
    const [format, setFormat] = useState(formats[0].id);
    return <div className="save-menu">
        <span className="save-menu__label">{label}</span>
        <select aria-label={`${label} 저장 형식`} value={format} onChange={event => setFormat(event.target.value)} disabled={disabled}>{formats.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => onSave(format)}>저장</button>
    </div>;
}

function LessonSource({ lessonPlan }) {
    return <section className="assessment-source-card" aria-label="AI 초안 생성 기준"><div><p className="eyebrow">AI가 읽을 확정 정보</p><h2>{lessonPlan.title}</h2><p>{lessonPlan.subject} · {lessonPlan.grade}</p></div><ul>{lessonPlan.standards.map(standard => <li key={standard.code}><strong>[{standard.code}]</strong> {standard.text}</li>)}</ul></section>;
}

export function AssessmentDesignStage({ lessonPlan, design, value, request, onDesignChange, onRequestChange, onChange }) {
    const { active: operationActive, runOperation } = useOperation();
    const [status, setStatus] = useState({ type: 'idle', message: '' });
    const currentSourceHash = sourceHash(lessonPlan);
    const cleanDesign = useMemo(() => design ? extractAssessmentDesign(design) : null, [design]);
    const designValidation = cleanDesign ? assessmentDesignSchema.safeParse(cleanDesign) : null;
    const assessmentValidation = value ? assessmentOutputSchema.safeParse(value) : null;
    const currentDesignHash = cleanDesign ? sourceHash(cleanDesign) : '';
    const completedDesignHash = value ? (value.designHash || sourceHash(extractAssessmentDesign(value))) : '';
    const designChanged = Boolean(value && currentDesignHash && completedDesignHash !== currentDesignHash);
    const stale = Boolean(design && design.sourceHash !== currentSourceHash);

    const generateDesign = async () => {
        const nextRequest = assessmentRequestForLesson(lessonPlan, request);
        onRequestChange(nextRequest);
        setStatus({ type: 'loading', message: '성취기준과 지도안에서 수행과제와 루브릭 초안을 만들고 있습니다.' });
        try {
            const body = await runOperation({ kind: 'assessment-design-generation', label: '수행평가 설계 초안 생성', phase: 'upstageWaiting', cancelable: true, model: 'configured-generation-model' }, ({ signal }) => postGeneration({ phase: 'design', lessonPlan, assessmentRequest: nextRequest }, signal));
            if (!body) return setStatus({ type: 'idle', message: '' });
            onDesignChange({ ...body.assessmentDesign, sourceHash: currentSourceHash });
            setStatus({ type: 'done', message: 'AI 초안을 만들었습니다. 과제와 루브릭을 고친 뒤 학생용 수행평가지를 만드세요.' });
        } catch (error) {
            if (!(error instanceof OperationBusyError)) setStatus({ type: 'error', message: error.message || '다시 시도해주세요.' });
        }
    };

    const generateStudentSheet = async () => {
        if (!designValidation?.success) return setStatus({ type: 'error', message: '과제, 배점, 성취기준 연결과 수준별 수행 기술을 먼저 확인해주세요.' });
        setStatus({ type: 'loading', message: '교사가 확정한 설계로 학생용 문항과 채점 참고를 만들고 있습니다.' });
        try {
            const body = await runOperation({ kind: 'assessment-sheet-generation', label: '학생용 수행평가지 생성', phase: 'upstageWaiting', cancelable: true, model: 'configured-generation-model' }, ({ signal }) => postGeneration({ phase: 'student-sheet', lessonPlan, assessmentDesign: cleanDesign }, signal));
            if (!body) return setStatus({ type: 'idle', message: '' });
            onChange({ ...body.assessment, sourceHash: currentSourceHash, designHash: currentDesignHash, approved: false });
            setStatus({ type: 'done', message: '학생용 수행평가지를 만들었습니다. 문항과 채점 참고를 확인해주세요.' });
        } catch (error) {
            if (!(error instanceof OperationBusyError)) setStatus({ type: 'error', message: error.message || '다시 시도해주세요.' });
        }
    };

    const updateDesign = next => onDesignChange({ ...next, sourceHash: design.sourceHash });
    const updateAssessment = next => onChange({ ...next, approved: false });
    const exportRubric = async formatId => {
        const format = rubricFormats.find(item => item.id === formatId) ?? rubricFormats[0];
        const exportValue = { ...value, ...cleanDesign, studentSheet: value.studentSheet, cover: value.cover };
        try { await runOperation({ kind: `rubric-export-${format.id}`, label: `루브릭 ${format.label} 저장`, phase: 'serverWaiting', cancelable: true }, ({ signal }) => downloadFile(`/api/export-rubric/${format.id}`, exportValue, downloadFilename(cleanDesign.assessmentName, '루브릭', format.id), signal)); }
        catch (error) { if (!(error instanceof OperationBusyError)) setStatus({ type: 'error', message: error.message }); }
    };
    const exportAssessment = async (kind, format, label) => {
        try { await runOperation({ kind: 'assessment-export', label: `${label} 저장`, phase: 'serverWaiting', cancelable: true }, ({ signal }) => downloadFile(`/api/export-workflow/${kind}?format=${format}`, value, downloadFilename(value.task.title, label, format), signal)); }
        catch (error) { if (!(error instanceof OperationBusyError)) setStatus({ type: 'error', message: error.message }); }
    };
    return <section className="workflow-stage workflow-stage--wide assessment-design-flow">
        <header className="workflow-stage__header"><div><p className="eyebrow">3단계 · 수행평가</p><h1>AI 초안을 고쳐서 수행평가지를 만들어요</h1><p>지도안과 성취기준은 AI가 읽고, 교사는 제안된 과제와 루브릭을 확인·수정합니다.</p></div></header>
        <LessonSource lessonPlan={lessonPlan}/>
        <div className="assessment-primary-action"><div><strong>{design ? '설계를 다시 제안받을 수 있어요' : '별도 입력 없이 시작할 수 있어요'}</strong><p>평가 이름, 도착점, 산출물, 총점, 4수준 루브릭과 <span className="keep-together">과정 배점</span>을 자동으로 채웁니다.</p></div><button type="button" disabled={operationActive || status.type === 'loading'} onClick={generateDesign}>{design ? 'AI 초안 다시 만들기' : 'AI로 수행평가 초안 만들기'}</button></div>
        <details className="assessment-settings"><summary>세부 설정</summary><p>필요할 때만 평가 방식, 총점, 수준 수, 과정 비중과 산출물 유형을 바꾸세요.</p><BackwardDesignForm lessonPlan={lessonPlan} value={request} onChange={onRequestChange}/></details>
        {status.message && <p className={`status-line status-line--${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.message}</p>}
        {stale && <p className="stale-notice" role="status"><strong>이전 지도안으로 만든 설계입니다.</strong><span>현재 지도안으로 AI 초안을 다시 만들어주세요.</span></p>}
        {design && <>
            <div className="assessment-flow-step"><span>1</span><div><strong>AI 설계 초안 검토</strong><p>과제와 평가영역, 배점, 수준별 수행 기술을 교사가 직접 고칩니다.</p></div></div>
            {!designValidation?.success && <p className="form-alert" role="alert">과제, 배점, 성취기준 연결과 수준별 수행 기술을 확인해주세요.</p>}
            <RubricEditor value={design} request={request} onRequestChange={onRequestChange} onChange={updateDesign}/>
            <div className="assessment-primary-action assessment-primary-action--sheet"><div><strong>교사 수정이 끝났나요?</strong><p>현재 화면의 설계를 그대로 고정해 학생용 문항과 교사용 채점 참고를 생성합니다.</p></div><button type="button" disabled={operationActive || stale || !designValidation?.success} onClick={generateStudentSheet}>이 설계로 수행평가지 만들기</button></div>
        </>}
        {value && <section className="assessment-complete-panel"><div className="assessment-flow-step"><span>2</span><div><strong>완성 · 저장 · 확인</strong><p>학생용 수행평가지가 만들어졌어요. 여기서 바로 저장하고, 확인 완료를 눌러 OCR·채점 단계를 여세요.</p></div></div>
            {designChanged && <p className="form-alert" role="alert">설계가 바뀌었어요. 위의 &lsquo;이 설계로 수행평가지 만들기&rsquo;를 다시 눌러야 저장·확인 완료할 수 있습니다.</p>}
            {!designChanged && !assessmentValidation?.success && <p className="form-alert" role="alert">학생용 문항·채점 참고·표지 내용을 확인해주세요.</p>}
            <div className="assessment-complete-bar">
                <div className="assessment-complete-bar__saves" role="group" aria-label="저장">
                    <SaveMenu label="루브릭" formats={rubricFormats} disabled={operationActive || !designValidation?.success} onSave={exportRubric}/>
                    <SaveMenu label="수행평가지" formats={sheetFormats} disabled={operationActive || designChanged || !assessmentValidation?.success} onSave={format => exportAssessment('assessment-sheet', format, '제출용 수행평가지')}/>
                    {value.includeStudentCover && <><SaveMenu label="학생 안내문" formats={sheetFormats} disabled={operationActive || designChanged || !assessmentValidation?.success} onSave={format => exportAssessment('assessment-cover', format, '학생 안내문')}/><SaveMenu label="안내문+평가지 전체" formats={sheetFormats} disabled={operationActive || designChanged || !assessmentValidation?.success} onSave={format => exportAssessment('assessment', format, '안내문과 수행평가지 전체')}/></>}
                </div>
                <div className="assessment-complete-bar__approve">
                    <button type="button" disabled={operationActive || designChanged || !assessmentValidation?.success} onClick={() => onChange({ ...value, approved: !value.approved })}>{value.approved ? '확인 완료 취소' : '수행평가·루브릭 확인 완료'}</button>
                    {value.approved ? <p className="approve-hint approve-hint--done">확인 완료됨 · OCR·채점 단계가 열렸습니다.</p> : (designChanged || !assessmentValidation?.success) ? <p className="approve-hint">위 안내를 해결하면 확인 완료를 누를 수 있어요.</p> : <p className="approve-hint">확인 완료를 누르면 다음 단계(OCR·채점)가 열립니다.</p>}
                </div>
            </div>
            <details className="assessment-review-editors"><summary>학생 문항·표지 자세히 보고 고치기</summary>
                <AssessmentSheetEditor value={value} onChange={updateAssessment}/>
                {value.includeStudentCover ? <AssessmentCoverEditor value={value} onChange={updateAssessment}/> : <p className="cover-disabled-notice" role="status">학생당 안내 표지를 사용하지 않습니다.</p>}
            </details>
        </section>}
    </section>;
}
