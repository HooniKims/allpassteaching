'use client';
import { useEffect, useRef, useState } from 'react';
import { runWithConcurrency } from '@/lib/batch-queue';
import { recordSourceHash, submissionIsApprovedFor } from '@/lib/workflow-lineage';

function upsert(collection, value) { return collection.some(item => item.submissionId === value.submissionId) ? collection.map(item => item.submissionId === value.submissionId ? value : item) : [...collection, value]; }

export function RecordsStage({ lessonPlan, assessment, submissions, records, onChange }) {
    const approved = submissions.filter(item => submissionIsApprovedFor(assessment, item));
    const [targetLength, setTargetLength] = useState(500);
    const [busy, setBusy] = useState(false);
    const [copyMessage, setCopyMessage] = useState('');
    const recordFor = id => records.find(item => item.submissionId === id);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const generateBatch = async targets => {
        setBusy(true);
        const apply = value => { if (mounted.current) onChange(current => upsert(current, value)); };
        await runWithConcurrency(targets, 2, async submission => {
            const sourceHashValue = recordSourceHash(assessment, submission);
            apply({ ...(recordFor(submission.id) ?? {}), submissionId: submission.id, studentName: submission.studentName, sourceHash: sourceHashValue, status: 'generating', text: recordFor(submission.id)?.text ?? '', error: '', approved: false });
            try {
                const response = await fetch('/api/generate-record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonPlan, assessment, submission, targetLength }) });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(body.message || '세특 초안을 만들지 못했습니다.');
                apply({ submissionId: submission.id, studentName: submission.studentName, sourceHash: sourceHashValue, status: 'done', text: body.record.text, error: '', approved: false });
            } catch (error) { apply({ ...(recordFor(submission.id) ?? {}), submissionId: submission.id, studentName: submission.studentName, sourceHash: sourceHashValue, status: 'error', text: recordFor(submission.id)?.text ?? '', error: error.message || '세특 초안을 만들지 못했습니다.', approved: false }); }
        });
        if (mounted.current) setBusy(false);
    };
    const updateRecord = (id, patch) => onChange(current => current.map(item => item.submissionId === id ? { ...item, ...patch } : item));
    const copyRecord = async record => {
        try { await navigator.clipboard.writeText(record.text); setCopyMessage(`${record.studentName} 세특을 복사했습니다.`); }
        catch { setCopyMessage('복사하지 못했습니다. 텍스트를 직접 선택해주세요.'); }
    };
    const missing = approved.filter(submission => !recordFor(submission.id)?.text);
    return <section className="workflow-stage workflow-stage--wide">
        <header className="workflow-stage__header"><div><p className="eyebrow">5단계 · 세특</p><h1>승인된 수행 증거로 세특을 작성해요</h1><p>점수를 옮기지 않고 교과 학습 과정, 수행 특성, 근거, 다음 학습 방향을 기록합니다.</p></div>{missing.length > 0 && <button type="button" disabled={busy} onClick={() => generateBatch(missing)}>미생성 학생 전체 생성</button>}</header>
        <div className="record-settings"><label>학생별 최대 글자 수<input aria-label="학생별 최대 글자 수" type="number" min="300" max="1000" step="50" value={targetLength} onChange={event => setTargetLength(Math.min(1000, Math.max(300, Number(event.target.value) || 500)))}/></label><p>기본 500자이며 300–1000자 사이에서 조절할 수 있습니다.</p></div>
        {copyMessage && <p className="status-line" role="status">{copyMessage}</p>}
        <div className="record-list">{approved.map(submission => {
            const record = recordFor(submission.id);
            const stale = Boolean(record?.text && record.sourceHash !== recordSourceHash(assessment, submission));
            return <article className="record-item" key={submission.id}>
                <div className="record-item__head"><div><strong>{submission.studentName}</strong><span>승인된 수행평가 · {submission.grading.totalScore}점</span></div>{!record?.text && <button type="button" disabled={busy || record?.status === 'generating'} onClick={() => generateBatch([submission])}>{submission.studentName} 세특 생성</button>}</div>
                {stale && <p className="stale-notice"><strong>이전 채점 결과로 생성됨</strong><span>현재 글은 유지되며 다시 생성할 수 있습니다.</span></p>}
                {record?.error && <p className="item-error" role="alert">{record.error}</p>}
                {record?.text && <><label className="record-text-field">세특 초안<textarea rows="7" value={record.text} maxLength={targetLength} onChange={event => updateRecord(submission.id, { text: event.target.value, approved: false })}/></label><div className="record-item__footer"><span>{record.text.length}자 / {targetLength}자</span><div><button type="button" className="secondary-button" onClick={() => generateBatch([submission])}>다시 생성</button><button type="button" className="secondary-button" onClick={() => copyRecord(record)}>복사</button><button type="button" onClick={() => updateRecord(submission.id, { approved: !record.approved })}>{record.approved ? '확인 완료 취소' : '교사 확인 완료'}</button></div></div></>}
            </article>;
        })}</div>
        {!approved.length && <p className="empty-state">OCR·채점 단계에서 학생별 채점 근거를 확인하고 승인해주세요.</p>}
    </section>;
}
