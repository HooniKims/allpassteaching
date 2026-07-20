'use client';
import { useMemo, useState } from 'react';
import { assessmentRequestSchema, integratedAssessmentScoreIssue } from '@/lib/assessment-request';
import { sourceHash } from '@/lib/source-hash';
import { assessmentOutputSchema, unresolvedBlockingAlignmentIssues } from '@/lib/assessment-schema';
import { downloadFilename } from '@/lib/download-filename';
import { BackwardDesignForm } from './BackwardDesignForm.jsx';
import { RubricEditor } from './RubricEditor.jsx';
import { AssessmentCoverEditor } from './AssessmentCoverEditor.jsx';
import { AssessmentSheetEditor } from './AssessmentSheetEditor.jsx';
import { OperationBusyError, useOperation } from './OperationProvider.jsx';
import { upgradeAssessmentStudentSheet } from '@/lib/assessment-student-sheet';

async function downloadAssessment(kind, format, value, signal) {
    const response = await fetch(`/api/export-workflow/${kind}?format=${format}`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || '파일 저장에 실패했습니다.');
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    const suffix = { 'assessment-cover': '학생-안내문', 'assessment-sheet': '제출용-수행평가지', assessment: '안내문-포함-전체본' }[kind] ?? '';
    anchor.download = downloadFilename(value.task.title, suffix, format);
    anchor.click();
    URL.revokeObjectURL(url);
}

const rubricDownloads = [
    { format: 'pdf', label: 'PDF' },
    { format: 'hwpx', label: 'HWPX' },
    { format: 'docx', label: 'DOCX' },
    { format: 'xlsx', label: 'Excel' },
];

async function downloadRubric(format, value, signal) {
    const response = await fetch(`/api/export-rubric/${format}`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || '루브릭 저장에 실패했습니다.');
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadFilename(value.assessmentName || value.task.title, '루브릭', format);
    anchor.click();
    URL.revokeObjectURL(url);
}

export function AssessmentStage({ lessonPlan, value: storedValue, request, onRequestChange, onChange }) {
    const value = useMemo(() => upgradeAssessmentStudentSheet(storedValue), [storedValue]);
    const { active: operationActive, runOperation } = useOperation();
    const [status, setStatus] = useState({ type: 'idle', message: '' });
    const [candidate, setCandidate] = useState(null);
    const currentSourceHash = sourceHash(lessonPlan);
    const requestFingerprint = useMemo(() => sourceHash({ lessonPlan, request }), [lessonPlan, request]);
    const assessmentFingerprint = useMemo(() => value ? sourceHash(value) : '', [value]);
    const stale = Boolean(value && value.sourceHash !== currentSourceHash);
    const total = value?.rubric.criteria.reduce((sum, criterion) => sum + (Number(criterion.maxPoints) || 0), 0) ?? 0;
    const validation = value ? assessmentOutputSchema.safeParse(value) : null;
    const requestValidation = assessmentRequestSchema.safeParse(request);
    const integratedScoreIssue = requestValidation.success && lessonPlan.instructionModel.id === 'integrated' ? integratedAssessmentScoreIssue(requestValidation.data) : null;
    const requestValid = requestValidation.success && !integratedScoreIssue;
    const blockingIssues = unresolvedBlockingAlignmentIssues(value);
    const requestedGenerationSettings = { outputTypes: request.outputTypes, answerTypes: request.answerTypes, stages: request.stages, additionalRequirements: request.additionalRequirements, assessmentApproachId: request.assessmentApproachId ?? 'backward-design' };
    const valueGenerationSettings = value?.generationSettings && { ...value.generationSettings, assessmentApproachId: value.generationSettings.assessmentApproachId ?? 'backward-design' };
    const valueContractMatchesRequest = !value || (value.assessmentName === request.assessmentName
        && value.totalPoints === request.totalPoints
        && value.rubric.levels.length === request.levelCount
        && value.scoring.includeProcessInScore === request.includeProcessInScore
        && value.scoring.processWeightPercent === request.processWeightPercent
        && value.visualAnalysisRequired === request.visualAnalysisRequired
        && value.includeStudentCover === request.includeStudentCover
        && JSON.stringify(valueGenerationSettings) === JSON.stringify(requestedGenerationSettings));
    const readyForApproval = Boolean(validation?.success && !stale && blockingIssues.length === 0 && valueContractMatchesRequest);
    const generate = async () => {
        setStatus({ type: 'loading', message: '성취기준, 도착점, 증거와 수행 과정을 연결해 수행평가를 만들고 있습니다.' });
        try {
            const body = await runOperation({ kind: 'assessment-generation', label: '수행평가와 루브릭 생성', phase: 'upstageWaiting', cancelable: true, model: 'configured-generation-model' }, async ({ signal }) => {
                const response = await fetch('/api/generate-assessment', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonPlan, assessmentRequest: request }) });
                const responseBody = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(responseBody.message || '수행평가를 생성하지 못했습니다.');
                return responseBody;
            });
            if (!body) { setStatus({ type: 'idle', message: '' }); return; }
            const next = { ...body.assessment, sourceHash: currentSourceHash, approved: false };
            if (value) setCandidate({ assessment: next, requestFingerprint, assessmentFingerprint });
            else onChange(next);
            setStatus({ type: 'done', message: value ? '새 초안을 후보로 만들었습니다. 비교한 뒤 적용하거나 현재안을 유지하세요.' : '수행평가 초안을 만들었습니다. 연결표, 배점, 수준 기술과 표지를 확인해주세요.' });
        } catch (error) { if (!(error instanceof OperationBusyError)) setStatus({ type: 'error', message: error.message || '다시 시도해주세요.' }); }
    };
    const exportAssessment = async (kind, format) => {
        const target = { 'assessment-cover': '학생 안내문', 'assessment-sheet': '제출용 수행평가지', assessment: '안내문과 수행평가지 전체본' }[kind] ?? '수행평가';
        const label = `${target} ${format.toUpperCase()} 저장`;
        try { await runOperation({ kind: 'assessment-export', label, phase: 'serverWaiting', cancelable: true }, ({ signal }) => downloadAssessment(kind, format, value, signal)); }
        catch (error) { if (!(error instanceof OperationBusyError)) setStatus({ type: 'error', message: error.message }); }
    };
    const exportRubric = async ({ format, label }) => {
        try { await runOperation({ kind: `rubric-export-${format}`, label: `루브릭 ${label} 저장`, phase: 'serverWaiting', cancelable: true }, ({ signal }) => downloadRubric(format, value, signal)); }
        catch (error) { if (!(error instanceof OperationBusyError)) setStatus({ type: 'error', message: error.message }); }
    };
    const applyCandidate = () => {
        if (candidate.requestFingerprint !== requestFingerprint) {
            setStatus({ type: 'error', message: '후보 생성 뒤 입력이 바뀌었습니다. 현재 입력으로 다시 생성해주세요.' });
            return;
        }
        if (candidate.assessmentFingerprint !== assessmentFingerprint) {
            setStatus({ type: 'error', message: '후보 생성 뒤 현재 평가가 바뀌었습니다. 교사의 편집본을 유지하고 다시 생성해주세요.' });
            return;
        }
        onChange(candidate.assessment);
        setCandidate(null);
    };
    const validationMessage = total !== value?.totalPoints ? `평가 요소 배점 합계가 ${value?.totalPoints}점이어야 합니다. 현재 ${total}점입니다.` : '성취기준 연결, 도착점, 연결표, 수행과제, 표지, 평가 요소, 과정 배점과 수준별 점수를 확인해주세요.';
    return <section className="workflow-stage workflow-stage--wide">
        <header className="workflow-stage__header"><div><p className="eyebrow">3단계 · 수행평가</p><h1>성취기준에 맞는 수행평가를 설계해요</h1><p>학생이 도달할 이해와 증거를 먼저 정하고, 수행과제·피드백 과정·점수형 루브릭을 거꾸로 설계합니다.</p></div></header>
        <BackwardDesignForm lessonPlan={lessonPlan} value={request} onChange={onRequestChange}/>
        <div className="generation-toolbar"><p>{integratedScoreIssue?.message ?? (requestValid ? '필수 도착점이 입력되었습니다.' : '첫 번째 질문과 생성 옵션을 확인해주세요.')}</p><button type="button" disabled={!requestValid || status.type === 'loading' || operationActive} onClick={generate}>{value ? '수행평가 다시 생성' : '수행평가 생성하기'}</button></div>
        {stale && <p className="stale-notice" role="status"><strong>이전 지도안으로 생성됨</strong><span>현재 편집본은 유지됩니다. 바뀐 지도안으로 다시 생성할 수 있습니다.</span></p>}
        {status.message && <p className={`status-line status-line--${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.message}</p>}
        {candidate && <aside className="candidate-panel" aria-label="새 수행평가 후보"><span className="status-pill">적용 전 후보</span><h2>{candidate.assessment.task.title}</h2><p>{candidate.assessment.backwardDesign.transferGoal}</p><div className="row-actions"><button type="button" onClick={applyCandidate}>새 후보 적용</button><button type="button" className="secondary-button" onClick={() => setCandidate(null)}>현재안 유지</button></div></aside>}
        {value && <>
            <div className="stage-document-head"><div><span className="status-pill">{value.approved ? '교사 확인 완료' : 'AI 초안'}</span><strong>{value.task.title || '과제명 확인 필요'}</strong><p>루브릭 배점 합계 {total}점 · {value.rubric.levels.length}수준</p><p className="stage-edit-hint" role="status">과제, 루브릭, 학생 안내 표지의 문구와 배점은 아래에서 직접 수정할 수 있어요. 수정하면 확인 완료 상태가 해제됩니다.</p></div><div className="stage-document-actions">{value.includeStudentCover && request.includeStudentCover && <><button type="button" className="secondary-button" disabled={operationActive || !validation?.success || !valueContractMatchesRequest} onClick={() => exportAssessment('assessment-cover', 'pdf')}>학생 안내문 PDF 저장</button><button type="button" className="secondary-button" disabled={operationActive || !validation?.success || !valueContractMatchesRequest} onClick={() => exportAssessment('assessment-cover', 'hwpx')}>학생 안내문 HWPX 저장</button></>}<button type="button" className="secondary-button" disabled={operationActive || !validation?.success || !valueContractMatchesRequest} onClick={() => exportAssessment('assessment-sheet', 'pdf')}>제출용 수행평가지 PDF 저장</button><button type="button" className="secondary-button" disabled={operationActive || !validation?.success || !valueContractMatchesRequest} onClick={() => exportAssessment('assessment-sheet', 'hwpx')}>제출용 수행평가지 HWPX 저장</button>{value.includeStudentCover && request.includeStudentCover && <><button type="button" className="secondary-button" disabled={operationActive || !validation?.success || !valueContractMatchesRequest} onClick={() => exportAssessment('assessment', 'pdf')}>안내문과 수행평가지 전체 PDF 저장</button><button type="button" className="secondary-button" disabled={operationActive || !validation?.success || !valueContractMatchesRequest} onClick={() => exportAssessment('assessment', 'hwpx')}>안내문과 수행평가지 전체 HWPX 저장</button></>}<button type="button" disabled={operationActive || !readyForApproval} onClick={() => onChange({ ...value, approved: !value.approved })}>{value.approved ? '확인 완료 취소' : '수행평가·루브릭 확인 완료'}</button></div></div>
            {validation && !validation.success && <p className="form-alert" role="alert">{validationMessage}</p>}
            {!valueContractMatchesRequest && <p className="form-alert" role="alert">생성 뒤 평가 설정이 바뀌었습니다. 현재 교사 설정으로 수행평가를 다시 생성해주세요.</p>}
            {blockingIssues.length > 0 && <div className="form-alert" role="alert"><strong>성취기준 연결을 먼저 보완해주세요.</strong>{blockingIssues.map(item => <p key={item.id}>{item.message}</p>)}</div>}
            {value.backwardDesign.alignmentIssues.some(item => item.severity === 'warning' && !item.resolved) && <aside className="alignment-warning"><h2>정합성 확인 권장</h2>{value.backwardDesign.alignmentIssues.filter(item => item.severity === 'warning' && !item.resolved).map(item => <p key={item.id}>{item.message}<br/><strong>수정 방법:</strong> {item.repairAction}</p>)}</aside>}
            <div className="rubric-download-panel" role="group" aria-label="루브릭 다운로드"><div><strong>현재 루브릭 다운로드</strong><p>수정한 문구, 성취수준, 배점과 급간을 그대로 반영합니다. HWPX·DOCX·Excel은 파일을 연 뒤에도 <span className="rubric-download-panel__editing-note">표를 이어서 편집할 수 있어요.</span></p></div><div className="rubric-download-panel__actions">{rubricDownloads.map(item => <button key={item.format} type="button" className="secondary-button" disabled={operationActive || !validation?.success || !valueContractMatchesRequest} onClick={() => exportRubric(item)}>루브릭 {item.label} 저장</button>)}</div></div>
            <section className="document-section alignment-map"><h2>성취기준 ↔ 과제 ↔ 평가영역 연결표</h2>{value.backwardDesign.evidenceMap.map(mapping => <article key={mapping.standardCode}><strong>[{mapping.standardCode}]</strong><span>과제 증거: {mapping.taskEvidenceTypes.join(', ')}</span><span>평가영역: {mapping.criterionIds.map(id => value.rubric.criteria.find(item => item.id === id)?.name ?? id).join(', ')}</span><span>증거 구분: {mapping.evidenceTypes.join(', ')}</span><span className="alignment-map__score-basis">점수 근거: {mapping.scoreBasis}</span></article>)}<h3>수업 중 지원 계획</h3><ol>{value.backwardDesign.supportPlan.toSorted((a, b) => a.order - b.order).map(item => <li key={item.id}><strong>{item.title}</strong> — {item.teacherAction} / 확인 증거: {item.studentEvidence}</li>)}</ol></section>
            <RubricEditor value={value} request={request} onRequestChange={onRequestChange} onChange={next => onChange({ ...next, approved: false })}/>
            <AssessmentSheetEditor value={value} onChange={next => onChange({ ...next, approved: false })}/>
            {value.includeStudentCover && request.includeStudentCover
                ? <AssessmentCoverEditor value={value} onChange={next => onChange({ ...next, approved: false })}/>
                : <p className="cover-disabled-notice" role="status">학생당 안내 표지를 사용하지 않습니다.</p>}
        </>}
    </section>;
}
