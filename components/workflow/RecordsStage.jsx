'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { recordSourceHash, submissionIsApprovedFor } from '@/lib/workflow-lineage';
import { RecordDraftComparison } from './RecordDraftComparison.jsx';
import { RecordEvidencePanel } from './RecordEvidencePanel.jsx';
import { useOperation } from './OperationProvider.jsx';

function upsert(collection, value) {
    return collection.some(item => item.submissionId === value.submissionId)
        ? collection.map(item => item.submissionId === value.submissionId ? value : item)
        : [...collection, value];
}

const candidateMessages = Object.freeze({
    stale_evidence: '현재 승인 근거가 후보 생성 시점과 달라졌습니다. 새 근거로 다시 생성해주세요.',
    length_limit: '현재 글자 수 제한과 맞지 않는 후보입니다. 현재 제한으로 다시 생성해주세요.',
    unsupported_claim: '승인 근거로 확인되지 않은 주장이 있어 이 후보를 적용할 수 없습니다.',
    expired_context: '생성 권한 확인 시간이 만료된 후보입니다. 현재 상태를 다시 확인해 생성해주세요.',
});

function candidateIssueFor(record, currentSourceHash, targetLength) {
    if (!record?.candidateText) return null;
    if (record.candidateInvalidCode && candidateMessages[record.candidateInvalidCode]) return { code: record.candidateInvalidCode, message: record.candidateInvalidMessage || candidateMessages[record.candidateInvalidCode] };
    if (record.candidateSourceHash !== currentSourceHash) return { code: 'stale_evidence', message: candidateMessages.stale_evidence };
    if (record.candidateTargetLength !== targetLength || record.candidateText.length > targetLength) return { code: 'length_limit', message: candidateMessages.length_limit };
    if (!record.candidateClaims?.length) return { code: 'unsupported_claim', message: candidateMessages.unsupported_claim };
    return null;
}

export function RecordsStage({ lessonPlan, assessment, students = [], submissions, records, onChange }) {
    const { cancelActive, runBatchOperation } = useOperation();
    const rosterById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
    const approved = submissions.filter(item => rosterById.has(item.studentId) && submissionIsApprovedFor(assessment, item));
    const [targetLength, setTargetLength] = useState(500);
    const [busy, setBusy] = useState(false);
    const [copyMessage, setCopyMessage] = useState('');
    const [batchMessage, setBatchMessage] = useState('');
    const mounted = useRef(true);
    const abortController = useRef(null);
    const recordFor = id => records.find(item => item.submissionId === id);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            abortController.current?.abort();
            onChange(current => current.map(record => {
                if (record.status === 'generating') return { ...record, status: 'error', error: '화면 이동으로 생성 작업이 중단되었습니다.' };
                if (record.regenerationStatus === 'generating') return { ...record, status: 'done', regenerationStatus: 'error', error: '화면 이동으로 재생성 작업이 중단되었습니다.' };
                return record;
            }));
        };
    }, [onChange]);

    const generateBatch = async targets => {
        const controller = new AbortController();
        abortController.current = controller;
        setBusy(true);
        setBatchMessage(targets.length === 1 ? `${rosterById.get(targets[0].studentId)?.name ?? '학생'} 세특 생성 중` : `${targets.length}명 세특 생성 준비 중`);
        const merge = (identity, makePatch) => {
            if (!mounted.current) return;
            onChange(current => {
                const latest = current.find(item => item.submissionId === identity.submissionId);
                const patch = makePatch(latest);
                return upsert(current, { ...latest, ...identity, ...patch });
            });
        };
        try {
            await runBatchOperation({ kind: 'records', label: '과목별 세부능력 및 특기사항 생성', items: targets, itemLabel: submission => rosterById.get(submission.studentId)?.name ?? '학생', concurrency: 2, phase: 'upstageWaiting', profile: { model: 'configured-generation-model' } }, async (submission, _index, { signal }) => {
                const combinedSignal = AbortSignal.any([controller.signal, signal]);
                if (combinedSignal.aborted) throw new DOMException('작업 취소', 'AbortError');
                const student = rosterById.get(submission.studentId);
                if (!student) return;
                const nextSourceHash = recordSourceHash(assessment, submission);
                const identity = { submissionId: submission.id, studentId: student.id, studentName: student.name };
                const hadRecord = Boolean(recordFor(submission.id));
                merge(identity, current => hadRecord
                    ? { status: 'done', regenerationStatus: 'generating', error: '', approved: current?.approved ?? false }
                    : { sourceHash: nextSourceHash, status: 'generating', regenerationStatus: '', text: '', error: '', approved: false });
                try {
                    const authorizationResponse = await fetch('/api/authorize-record-generation', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: combinedSignal,
                        body: JSON.stringify({ lessonPlan, assessment, students, submissions: approved }),
                    });
                    const authorizationBody = await authorizationResponse.json().catch(() => ({}));
                    const recordContext = authorizationBody?.context;
                    if (!authorizationResponse.ok || !recordContext?.payload || !/^[a-f0-9]{64}$/.test(recordContext?.token ?? '')) {
                        const failure = new Error(authorizationBody.message || '현재 명단과 승인 결과를 확인하지 못했습니다.');
                        failure.code = authorizationBody.code;
                        throw failure;
                    }
                    if (combinedSignal.aborted) throw new DOMException('작업 취소', 'AbortError');
                    const response = await fetch('/api/generate-record', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: combinedSignal,
                        body: JSON.stringify({ lessonPlan, assessment, roster: students, recordContext, student, submission, targetLength }),
                    });
                    const body = await response.json().catch(() => ({}));
                    if (!response.ok) { const failure = new Error(body.message || '세특 초안을 만들지 못했습니다.'); failure.code = body.code; throw failure; }
                    if (typeof body?.record?.text !== 'string' || !body.record.text.trim() || body.record.text.length > targetLength) { const failure = new Error('생성 결과 형식을 확인하지 못했습니다. 다시 시도해주세요.'); failure.code = 'unsupported_claim'; throw failure; }
                    merge(identity, current => hadRecord
                        ? { status: 'done', regenerationStatus: 'done', error: '', candidateInvalidCode: '', candidateInvalidMessage: '', previousText: current?.text ?? '', candidateText: body.record.text, candidateClaims: body.record.claims ?? [], candidateEvidenceCriterionIds: body.record.evidenceCriterionIds ?? [], candidateSourceHash: nextSourceHash, candidateTargetLength: targetLength }
                        : { sourceHash: nextSourceHash, status: 'done', regenerationStatus: '', text: body.record.text, claims: body.record.claims ?? [], evidenceCriterionIds: body.record.evidenceCriterionIds ?? [], previousText: '', candidateText: '', candidateClaims: [], candidateEvidenceCriterionIds: [], candidateSourceHash: '', candidateTargetLength: 0, error: '', approved: false });
                    if (mounted.current) setBatchMessage(hadRecord ? `${student.name} 새 초안을 비교할 수 있습니다.` : `${student.name} 세특 초안이 생성되었습니다.`);
                } catch (error) {
                    const cancelled = error instanceof DOMException && error.name === 'AbortError';
                    const candidateInvalidCode = error?.code === 'expired_context' ? 'expired_context'
                        : ['stale_context', 'stale_assessment', 'stale_grading'].includes(error?.code) ? 'stale_evidence'
                            : error?.code === 'invalid_generation' || error?.code === 'unsupported_claim' ? 'unsupported_claim' : '';
                    merge(identity, current => hadRecord
                        ? { status: 'done', regenerationStatus: cancelled ? '' : 'error', candidateInvalidCode: cancelled ? current?.candidateInvalidCode ?? '' : candidateInvalidCode, candidateInvalidMessage: cancelled ? current?.candidateInvalidMessage ?? '' : candidateInvalidCode ? error.message : '', error: cancelled ? '' : error instanceof Error ? error.message : '세특 초안을 만들지 못했습니다.', approved: current?.approved ?? false }
                        : { sourceHash: current?.sourceHash ?? nextSourceHash, status: 'error', regenerationStatus: '', text: current?.text ?? '', error: cancelled ? '작업을 취소했습니다.' : error instanceof Error ? error.message : '세특 초안을 만들지 못했습니다.', approved: current?.approved ?? false });
                    if (mounted.current && !cancelled) setBatchMessage(`${student.name} 세특 생성에 실패했습니다.`);
                    throw error;
                }
            });
        } catch (error) {
            if (mounted.current && !(error instanceof DOMException && error.name === 'AbortError')) setBatchMessage(error instanceof Error ? error.message : '세특 생성을 시작하지 못했습니다.');
        } finally {
            if (mounted.current) setBusy(false);
            if (abortController.current === controller) abortController.current = null;
        }
    };

    const cancelBatch = () => {
        abortController.current?.abort();
        cancelActive();
        setBatchMessage('세특 생성 작업을 취소했습니다. 완료된 결과와 기존 문장은 유지됩니다.');
    };

    const updateRecord = (id, patch) => onChange(current => current.map(item => item.submissionId === id ? { ...item, ...patch } : item));
    const copyRecord = async record => {
        try { await navigator.clipboard.writeText(record.text); setCopyMessage(`${record.studentName} 세특을 복사했습니다.`); }
        catch { setCopyMessage('복사하지 못했습니다. 텍스트를 직접 선택해주세요.'); }
    };
    const missing = approved.filter(submission => !recordFor(submission.id));
    const failed = approved.filter(submission => ['error'].includes(recordFor(submission.id)?.status) || recordFor(submission.id)?.regenerationStatus === 'error');
    const hasCurrentRecords = approved.some(submission => Boolean(recordFor(submission.id)));

    return <section className="workflow-stage workflow-stage--wide" aria-busy={busy}>
        <header className="workflow-stage__header"><div><p className="eyebrow">5단계 · 세특</p><h1>승인된 수행 증거로 세특을 작성해요</h1><p>성취기준과 실제 수행 근거를 확인하고, <span className="nowrap">새 초안은 비교한 뒤에만</span> 적용합니다.</p></div><div className="record-batch-actions">
            {missing.length > 0 && <button type="button" disabled={busy} onClick={() => generateBatch(missing)}>미생성 학생 전체 생성</button>}
            {hasCurrentRecords && <button type="button" className="secondary-button" disabled={busy} onClick={() => generateBatch(approved)}>전체 다시 생성</button>}
            {failed.length > 0 && <button type="button" className="secondary-button" disabled={busy} onClick={() => generateBatch(failed)}>실패 학생만 다시 시도</button>}
            {busy && <button type="button" className="secondary-button" onClick={cancelBatch}>작업 취소</button>}
        </div></header>
        <div className="record-settings"><label>학생별 최대 글자 수<input aria-label="학생별 최대 글자 수" disabled={busy} type="number" min="300" max="1000" step="50" value={targetLength} onChange={event => setTargetLength(Math.min(1000, Math.max(300, Number(event.target.value) || 500)))}/></label><p>기본 500자이며 300–1000자 사이에서 조절할 수 있습니다.</p></div>
        {batchMessage && <p className="status-line" role="status" aria-live="polite">{batchMessage}</p>}
        {copyMessage && <p className="status-line" role="status">{copyMessage}</p>}
        <div className="record-list">{approved.map(submission => {
            const record = recordFor(submission.id);
            const student = rosterById.get(submission.studentId);
            const currentSourceHash = recordSourceHash(assessment, submission);
            const stale = Boolean(record?.text && record.sourceHash !== currentSourceHash);
            const candidateIssue = candidateIssueFor(record, currentSourceHash, targetLength);
            return <article className="record-item" key={submission.id}>
                <div className="record-item__head"><div><strong>{student.name}</strong><span>현재 명단 · 승인된 수행평가 근거</span></div>{!record && <button type="button" disabled={busy} onClick={() => generateBatch([submission])}>{student.name} 세특 생성</button>}</div>
                <RecordEvidencePanel assessment={assessment} submission={submission} studentName={student.name}/>
                {stale && <p className="stale-notice"><strong>이전 채점 결과로 생성됨</strong><span>현재 글은 유지되며 새 근거로 다시 생성할 수 있습니다.</span></p>}
                {record?.error && <p className="item-error" role="alert">{record.error}</p>}
                {record && <><label className="record-text-field">{student.name} 세특 초안<textarea rows="7" value={record.text ?? ''} disabled={record.status === 'generating'} maxLength={targetLength} onChange={event => updateRecord(submission.id, { text: event.target.value, claims: [], evidenceCriterionIds: [], approved: false })}/></label>
                    <RecordDraftComparison studentName={student.name} record={record} candidateIssue={candidateIssue} onApply={() => { updateRecord(submission.id, { previousText: '', text: record.candidateText, claims: record.candidateClaims ?? [], evidenceCriterionIds: record.candidateEvidenceCriterionIds ?? [], sourceHash: record.candidateSourceHash, candidateText: '', candidateClaims: [], candidateEvidenceCriterionIds: [], candidateSourceHash: '', candidateTargetLength: 0, candidateInvalidCode: '', candidateInvalidMessage: '', regenerationStatus: '', error: '', approved: false }); setBatchMessage(`${student.name} 새 초안을 적용했습니다.`); }} onKeep={() => { updateRecord(submission.id, { previousText: '', candidateText: '', candidateClaims: [], candidateEvidenceCriterionIds: [], candidateSourceHash: '', candidateTargetLength: 0, candidateInvalidCode: '', candidateInvalidMessage: '', regenerationStatus: '', status: 'done', error: '' }); setBatchMessage(`${student.name} 기존 문장을 유지했습니다.`); }}/>
                    {!record.claims?.length && record.text && <p className="record-lineage-note">직접 수정되어 AI 근거 연결이 해제되었습니다. 다시 생성하면 근거를 재연결할 수 있습니다.</p>}
                    <div className="record-item__footer"><span>{(record.text ?? '').length}자 / {targetLength}자</span><div><button type="button" className="secondary-button" disabled={busy} onClick={() => generateBatch([submission])}>{student.name} 다시 생성</button><button type="button" className="secondary-button" disabled={!record.text} onClick={() => copyRecord(record)}>복사</button><button type="button" disabled={stale || !record.text || !record.claims?.length} onClick={() => updateRecord(submission.id, { approved: !record.approved })}>{record.approved ? '확인 완료 취소' : '교사 확인 완료'}</button></div></div></>}
            </article>;
        })}</div>
        {!approved.length && <p className="empty-state">현재 학생 명단과 연결된 승인 채점이 없습니다. OCR·채점 단계에서 학생별 근거를 확인하고 승인해주세요.</p>}
    </section>;
}
