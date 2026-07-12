'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { runWithConcurrency } from '@/lib/batch-queue';
import { gradingContentIsValid, gradingIsCurrent } from '@/lib/workflow-lineage';
import { StudentPdfUpload } from './StudentPdfUpload.jsx';
import { StudentRosterEditor } from './StudentRosterEditor.jsx';
import { useSubmissionFiles } from './SubmissionFileProvider.jsx';
import { SubmissionReviewWorkspace } from './SubmissionReviewWorkspace.jsx';

const EMPTY_COLLECTION = Object.freeze([]);
const gradingRequestFingerprint = (assessment, submission, studentName) => JSON.stringify({
    assessment, id: submission.id, studentId: submission.studentId ?? null, studentName,
    originalRevision: submission.originalRevision, extractedText: submission.extractedText, elements: submission.elements,
    elementsTruncated: submission.elementsTruncated, visualAnalysisStatus: submission.visualAnalysisStatus,
    autoScoreAllowed: submission.autoScoreAllowed, requiresVisualReview: submission.requiresVisualReview,
    grading: submission.grading,
});

export function OcrGradingStage({ assessment, students = EMPTY_COLLECTION, submissions, onStudentsChange = () => {}, onDeleteStudent = () => {}, records = EMPTY_COLLECTION, onChange }) {
    const files = useSubmissionFiles();
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [fileBusy, setFileBusy] = useState(false);
    const visualAnalysisRequired = assessment?.visualAnalysisRequired === true;
    const visualAnalysisRequiredRef = useRef(visualAnalysisRequired);
    const assessmentRef = useRef(assessment);
    const studentsRef = useRef(students);
    useLayoutEffect(() => {
        visualAnalysisRequiredRef.current = visualAnalysisRequired;
        assessmentRef.current = assessment;
        studentsRef.current = students;
    }, [assessment, students, visualAnalysisRequired]);
    useEffect(() => {
        const detached = submissions.filter(item => item.originalAttached !== false && !files.has(item.id) && !item.file);
        if (!detached.length) return;
        const detachedIds = new Set(detached.map(item => item.id));
        onChange(current => current.map(item => detachedIds.has(item.id) ? { ...item, status: item.grading ? 'graded' : item.extractedText ? 'extracted' : 'pending', originalAttached: false, originalReviewedAt: null, reviewedOriginalRevision: null, approved: false, approvalRevoked: Boolean(item.approved || item.grading) } : item));
    }, [files.has, files.revision, onChange, submissions]);
    useEffect(() => {
        const invalidated = submissions.filter(item => item.grading && (item.originalReviewedAt || item.approved) && !gradingIsCurrent(assessment, item));
        if (!invalidated.length) return;
        const ids = new Set(invalidated.map(item => item.id));
        onChange(current => current.map(item => ids.has(item.id) ? { ...item, status: item.grading ? 'graded' : item.status, originalReviewedAt: null, reviewedOriginalRevision: null, approved: false, approvalRevoked: true } : item));
    }, [assessment, onChange, submissions]);
    const updateOne = (id, patch) => onChange(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    const processOcr = async targets => {
        setBusy(true); setMessage('');
        const apply = (id, originalRevision, patch) => onChange(current => current.map(item => item.id === id && item.originalRevision === originalRevision ? { ...item, ...patch } : item));
        await runWithConcurrency(targets, 2, async item => {
            const originalRevision = item.originalRevision;
            apply(item.id, originalRevision, { status: 'extracting', error: '' });
            try {
                const answerFile = files.get(item.id)?.answerFile ?? item.file;
                if (!answerFile) throw new Error('원본 PDF를 다시 연결해주세요.');
                const requestedVisualAnalysis = visualAnalysisRequiredRef.current;
                const form = new FormData(); form.set('document', answerFile, answerFile.name); form.set('visualAnalysis', String(requestedVisualAnalysis));
                const response = await fetch('/api/ocr', { method: 'POST', body: form });
                const body = await response.json().catch(() => ({}));
                if (visualAnalysisRequiredRef.current !== requestedVisualAnalysis) throw new Error('수행평가의 시각 분석 설정이 변경되었습니다. 현재 설정으로 OCR을 다시 시도해주세요.');
                if (!response.ok) throw new Error(body.message || 'OCR 처리에 실패했습니다.');
                apply(item.id, originalRevision, { ...body, status: 'extracted', error: '', file: undefined, grading: null, originalReviewedAt: null, reviewedOriginalRevision: null, confirmedElementIds: [], approved: false });
            } catch (error) { apply(item.id, originalRevision, { status: 'ocr_error', error: error.message || 'OCR 처리에 실패했습니다.' }); }
        });
        setBusy(false);
    };
    const grade = async submission => {
        const linkedStudent = students.find(student => student.id === submission.studentId);
        const studentName = linkedStudent?.name || submission.studentName;
        const requestFingerprint = gradingRequestFingerprint(assessment, submission, studentName);
        updateOne(submission.id, { status: 'grading', error: '' });
        try {
            const response = await fetch('/api/grade-submission', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                assessment, submissionId: submission.id, studentId: submission.studentId ?? null, originalRevision: submission.originalRevision, studentName, extractedText: submission.extractedText, elements: submission.elements ?? [],
                elementsTruncated: submission.elementsTruncated === true, visualAnalysisStatus: submission.visualAnalysisStatus ?? 'not_requested',
                autoScoreAllowed: submission.autoScoreAllowed !== false,
                requiresVisualReview: submission.requiresVisualReview === true,
            }) });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.message || '채점 결과를 만들지 못했습니다.');
            onChange(current => current.map(item => {
                const currentName = studentsRef.current.find(student => student.id === item.studentId)?.name || item.studentName;
                if (item.id !== submission.id) return item;
                if (gradingRequestFingerprint(assessmentRef.current, item, currentName) === requestFingerprint) {
                    return { ...item, studentName, status: 'graded', grading: body.grading, originalReviewedAt: null, reviewedOriginalRevision: null, confirmedElementIds: [], approved: false, approvalRevoked: false, sourceHash: body.grading.sourceHash, error: '' };
                }
                return item.status === 'grading' ? { ...item, status: item.grading ? 'graded' : 'extracted', error: '채점 중 내용이 변경되어 새 결과를 적용하지 않았습니다. 현재 내용으로 다시 채점해주세요.' } : item;
            }));
        } catch (error) {
            onChange(current => current.map(item => {
                const currentName = studentsRef.current.find(student => student.id === item.studentId)?.name || item.studentName;
                if (item.id !== submission.id) return item;
                if (gradingRequestFingerprint(assessmentRef.current, item, currentName) === requestFingerprint) return { ...item, status: 'grade_error', error: error.message || '채점 결과를 만들지 못했습니다.' };
                return item.status === 'grading' ? { ...item, status: item.grading ? 'graded' : 'extracted', error: '채점 중 내용이 변경되어 새 결과를 적용하지 않았습니다. 현재 내용으로 다시 채점해주세요.' } : item;
            }));
        }
    };
    const finalize = async submission => {
        const response = await fetch('/api/grade-submission', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            mode: 'finalize', assessment, submissionId: submission.id, studentId: submission.studentId ?? null, studentName: submission.studentName, extractedText: submission.extractedText, elements: submission.elements ?? [],
            elementsTruncated: submission.elementsTruncated === true, grading: submission.grading, originalAttached: submission.originalAttached,
            visualAnalysisStatus: submission.visualAnalysisStatus ?? 'not_requested',
            autoScoreAllowed: submission.autoScoreAllowed !== false, requiresVisualReview: submission.requiresVisualReview === true,
            originalReviewedAt: submission.originalReviewedAt, originalRevision: submission.originalRevision,
            reviewedOriginalRevision: submission.reviewedOriginalRevision, confirmedElementIds: submission.confirmedElementIds ?? [],
        }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || '현재 원본과 근거를 모두 확인해야 승인할 수 있습니다.');
        return body.grading;
    };
    return <section className="workflow-stage workflow-stage--wide">
        <header className="workflow-stage__header"><div><p className="eyebrow">4단계 · OCR·채점</p><h1>학생 PDF를 읽고 루브릭으로 검토해요</h1><p>여러 PDF를 선택하면 최대 두 개씩 처리합니다. <span className="nowrap">OCR 원문과 채점 근거를</span> <span className="nowrap">교사가 직접 확인하고</span> 승인합니다.</p></div></header>
        <aside className="ocr-privacy-note"><strong>처리 전 확인</strong><span>PDF는 Upstage에 전송되며 원본은 저장하지 않습니다. <span className="nowrap">학생 이름·OCR·채점·세특은</span> 현재 탭에만 임시 보관되어 <span className="nowrap">새로고침 후 복구되고</span>, <span className="nowrap">탭을 닫으면 사라집니다.</span></span></aside>
        <StudentRosterEditor students={students} submissions={submissions} records={records} onChange={onStudentsChange} onDeleteStudent={onDeleteStudent}/>
        <StudentPdfUpload students={students} submissions={submissions} onChange={onChange} onBusyChange={setFileBusy}/>
        {submissions.some(item => item.originalAttached === true && (files.has(item.id) || item.file) && ['pending', 'ocr_error'].includes(item.status)) && <div className="ocr-start-actions"><button type="button" disabled={busy || fileBusy} onClick={() => processOcr(submissions.filter(item => item.originalAttached === true && (files.has(item.id) || item.file) && ['pending', 'ocr_error'].includes(item.status)))}>연결한 답안 PDF OCR 시작</button></div>}
        {message && <p className="form-alert" role="alert">{message}</p>}
        <div className="submission-list">{submissions.map((submission, index) => {
            const linkedStudent = students.find(student => student.id === submission.studentId);
            const studentName = linkedStudent?.name || submission.studentName;
            const lineageSubmission = { ...submission, studentName };
            const stale = Boolean(submission.grading && !gradingIsCurrent(assessment, lineageSubmission));
            const validGrading = gradingContentIsValid(assessment, submission.grading, submission.extractedText, submission.elements, lineageSubmission);
            const visualStatus = submission.approved ? 'approved' : submission.status === 'approved' ? 'graded' : submission.status;
            return <article className={`submission-item submission-item--${visualStatus}`} key={submission.id}>
            <div className="submission-link-field"><label>{studentName} 명단 연결<select aria-label={`${studentName} 명단 연결`} value={submission.studentId ?? ''} onChange={event => { const student = students.find(item => item.id === event.target.value); updateOne(submission.id, { studentId: student?.id ?? null, studentName: student?.name ?? submission.studentName, needsStudentLink: !student, status: submission.grading ? 'graded' : 'extracted', originalReviewedAt: null, reviewedOriginalRevision: null, approved: false }); }}><option value="">교사가 직접 연결</option>{students.map(student => <option value={student.id} key={student.id}>{student.grade}학년 {student.className}반 {student.number}번 {student.name}</option>)}</select></label>{submission.needsStudentLink !== false && <p>파일명과 학생 이름이 같아도 자동 연결하지 않습니다.</p>}</div>
            <div className="submission-item__head"><label>학생 이름 {index + 1}<input value={studentName} disabled={Boolean(linkedStudent)} onChange={event => updateOne(submission.id, { studentName: event.target.value, approved: false })}/></label><div><strong>{submission.fileName}</strong><span>{submission.originalAttached !== true ? '원본 PDF 다시 연결 필요' : submission.status === 'pending' ? 'OCR 대기' : submission.status === 'extracting' ? 'OCR 처리 중…' : submission.status === 'extracted' ? `${submission.pageCount}쪽 OCR 완료` : submission.status === 'grading' ? '루브릭 채점 중…' : stale ? '다시 채점 필요' : submission.approved ? '교사 승인 완료' : submission.grading ? '채점 검토 필요' : '처리 확인 필요'}</span></div><button type="button" className="text-button" onClick={() => { files.remove(submission.id); onChange(current => current.filter(item => item.id !== submission.id)); }}>{studentName} 삭제</button></div>
            {submission.originalAttached !== true && <p className="stale-notice" role="status"><strong>원본 PDF 다시 연결</strong><span>새로고침으로 원본 파일이 사라졌습니다. <span className="nowrap">OCR·채점 초안은</span> 남아 있지만 <span className="nowrap">원본을 다시 연결하기 전에는</span> 승인할 수 없습니다.</span></p>}
            {submission.error && <p className="item-error" role="alert">{submission.error}</p>}
            {submission.approvalRevoked && !submission.grading && <p className="approval-revoked" role="status">수정되어 교사 승인이 해제되었습니다.</p>}
            {submission.originalAttached === true && submission.status === 'ocr_error' && (files.has(submission.id) || submission.file) && <button type="button" className="secondary-button" onClick={() => processOcr([submission])}>{studentName} OCR 다시 시도</button>}
            {submission.extractedText && !submission.grading && <label className="ocr-text-field">OCR 추출 원문<textarea rows="9" value={submission.extractedText} onChange={event => updateOne(submission.id, { extractedText: event.target.value, status: 'extracted', grading: null, originalReviewedAt: null, reviewedOriginalRevision: null, confirmedElementIds: [], approved: false, approvalRevoked: Boolean(submission.approved || submission.grading) })}/></label>}
            {submission.extractedText?.trim().length >= 20 && (!submission.grading || stale) && <button type="button" disabled={submission.status === 'grading'} onClick={() => grade(submission)}>{stale ? `${studentName} 다시 채점하기` : `${studentName} 채점하기`}</button>}
            {stale && <p className="stale-notice" role="status"><strong>수행평가가 변경됨</strong><span>이전 채점은 참고용으로 유지됩니다. 현재 루브릭으로 다시 채점해주세요.</span></p>}
            {submission.grading && <SubmissionReviewWorkspace
                assessment={assessment} submission={lineageSubmission} studentName={studentName}
                fileUrl={files.get(submission.id)?.packetUrl ?? ''} stale={stale} validGrading={validGrading}
                onFinalize={finalize} onPatch={patch => updateOne(submission.id, patch)}/>
            }
        </article>;})}</div>
        {!submissions.length && <p className="empty-state">학생별 PDF 파일명을 <span className="nowrap">학생 이름으로 준비하면</span> <span className="nowrap">확인이 더 빠릅니다.</span></p>}
    </section>;
}
