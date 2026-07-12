'use client';
import { useState } from 'react';
import { runWithConcurrency } from '@/lib/batch-queue';
import { gradingContentIsValid, gradingIsCurrent, gradingSourceHash } from '@/lib/workflow-lineage';
import { GradingEditor } from './GradingEditor.jsx';
import { StudentRosterEditor } from './StudentRosterEditor.jsx';

export const MAX_SUBMISSION_FILES = 10;
export const MAX_SUBMISSION_SIZE = 10 * 1024 * 1024;
const EMPTY_COLLECTION = Object.freeze([]);

function studentNameFromFile(file) { return file.name.replace(/\.pdf$/i, '').trim() || '이름 미입력'; }
function newSubmission(file, index) { return { id: `submission-${Date.now()}-${index}`, studentId: null, needsStudentLink: true, studentName: studentNameFromFile(file), fileName: file.name, file, status: 'pending', extractedText: '', ocrModel: '', pageCount: 0, grading: null, approved: false, error: '' }; }

export function OcrGradingStage({ assessment, students = EMPTY_COLLECTION, submissions, onStudentsChange = () => {}, onDeleteStudent = () => {}, records = EMPTY_COLLECTION, onChange }) {
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const updateOne = (id, patch) => onChange(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    const addFiles = event => {
        const files = Array.from(event.target.files ?? []);
        setMessage('');
        if (submissions.length + files.length > MAX_SUBMISSION_FILES) { setMessage(`학생 PDF는 한 번에 최대 ${MAX_SUBMISSION_FILES}개까지 처리할 수 있습니다.`); event.target.value = ''; return; }
        const invalid = files.find(file => file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf'));
        if (invalid) { setMessage(`${invalid.name}: PDF 파일만 선택할 수 있습니다.`); event.target.value = ''; return; }
        const oversized = files.find(file => file.size > MAX_SUBMISSION_SIZE);
        if (oversized) { setMessage(`${oversized.name}: 파일당 10MB 이하만 처리할 수 있습니다.`); event.target.value = ''; return; }
        onChange(current => [...current, ...files.map(newSubmission)]);
        event.target.value = '';
    };
    const processOcr = async targets => {
        setBusy(true); setMessage('');
        const apply = (id, patch) => onChange(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
        await runWithConcurrency(targets, 2, async item => {
            apply(item.id, { status: 'extracting', error: '' });
            try {
                const form = new FormData(); form.set('document', item.file, item.file.name);
                const response = await fetch('/api/ocr', { method: 'POST', body: form });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(body.message || 'OCR 처리에 실패했습니다.');
                apply(item.id, { ...body, status: 'extracted', error: '', file: undefined, grading: null, approved: false });
            } catch (error) { apply(item.id, { status: 'ocr_error', error: error.message || 'OCR 처리에 실패했습니다.' }); }
        });
        setBusy(false);
    };
    const grade = async submission => {
        const linkedStudent = students.find(student => student.id === submission.studentId);
        const studentName = linkedStudent?.name || submission.studentName;
        updateOne(submission.id, { status: 'grading', error: '' });
        try {
            const response = await fetch('/api/grade-submission', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assessment, studentName, extractedText: submission.extractedText }) });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.message || '채점 결과를 만들지 못했습니다.');
            updateOne(submission.id, { status: 'graded', grading: body.grading, approved: false, approvalRevoked: false, sourceHash: gradingSourceHash(assessment, submission.extractedText), error: '' });
        } catch (error) { updateOne(submission.id, { status: 'grade_error', error: error.message || '채점 결과를 만들지 못했습니다.' }); }
    };
    return <section className="workflow-stage workflow-stage--wide">
        <header className="workflow-stage__header"><div><p className="eyebrow">4단계 · OCR·채점</p><h1>학생 PDF를 읽고 루브릭으로 검토해요</h1><p>여러 PDF를 선택하면 최대 두 개씩 처리합니다. <span className="nowrap">OCR 원문과 채점 근거를</span> <span className="nowrap">교사가 직접 확인하고</span> 승인합니다.</p></div></header>
        <aside className="ocr-privacy-note"><strong>처리 전 확인</strong><span>PDF는 Upstage에 전송되며 원본은 저장하지 않습니다. <span className="nowrap">학생 이름·OCR·채점·세특은</span> 현재 탭에만 임시 보관되어 <span className="nowrap">새로고침 후 복구되고</span>, <span className="nowrap">탭을 닫으면 사라집니다.</span></span></aside>
        <StudentRosterEditor students={students} submissions={submissions} records={records} onChange={onStudentsChange} onDeleteStudent={onDeleteStudent}/>
        <div className="file-upload-panel"><label className="file-picker"><span>학생 PDF 파일 <span className="optional">최대 10개 · 각 10MB</span></span><span className="file-picker__button">PDF 선택</span><span className="file-picker__summary">{submissions.length ? `${submissions.length}명 파일 선택됨` : '선택된 파일 없음'}</span><input aria-label="학생 PDF 파일" type="file" accept="application/pdf,.pdf" multiple onChange={addFiles}/></label>{submissions.some(item => item.file && ['pending', 'ocr_error'].includes(item.status)) && <button type="button" disabled={busy} onClick={() => processOcr(submissions.filter(item => item.file && ['pending', 'ocr_error'].includes(item.status)))}>선택한 PDF OCR 시작</button>}</div>
        {message && <p className="form-alert" role="alert">{message}</p>}
        <div className="submission-list">{submissions.map((submission, index) => {
            const stale = Boolean(submission.grading && !gradingIsCurrent(assessment, submission));
            const validGrading = gradingContentIsValid(assessment, submission.grading, submission.extractedText);
            const linkedStudent = students.find(student => student.id === submission.studentId);
            const studentName = linkedStudent?.name || submission.studentName;
            return <article className={`submission-item submission-item--${submission.status}`} key={submission.id}>
            <div className="submission-link-field"><label>{studentName} 명단 연결<select aria-label={`${studentName} 명단 연결`} value={submission.studentId ?? ''} onChange={event => { const student = students.find(item => item.id === event.target.value); updateOne(submission.id, { studentId: student?.id ?? null, studentName: student?.name ?? submission.studentName, needsStudentLink: !student, approved: false }); }}><option value="">교사가 직접 연결</option>{students.map(student => <option value={student.id} key={student.id}>{student.grade}학년 {student.className}반 {student.number}번 {student.name}</option>)}</select></label>{submission.needsStudentLink !== false && <p>파일명과 학생 이름이 같아도 자동 연결하지 않습니다.</p>}</div>
            <div className="submission-item__head"><label>학생 이름 {index + 1}<input value={studentName} disabled={Boolean(linkedStudent)} onChange={event => updateOne(submission.id, { studentName: event.target.value, approved: false })}/></label><div><strong>{submission.fileName}</strong><span>{submission.status === 'pending' ? 'OCR 대기' : submission.status === 'extracting' ? 'OCR 처리 중…' : submission.status === 'extracted' ? `${submission.pageCount}쪽 OCR 완료` : submission.status === 'grading' ? '루브릭 채점 중…' : stale ? '다시 채점 필요' : submission.approved ? '교사 승인 완료' : submission.grading ? '채점 검토 필요' : '처리 확인 필요'}</span></div><button type="button" className="text-button" onClick={() => onChange(current => current.filter(item => item.id !== submission.id))}>{studentName} 삭제</button></div>
            {submission.error && <p className="item-error" role="alert">{submission.error}</p>}
            {submission.status === 'ocr_error' && submission.file && <button type="button" className="secondary-button" onClick={() => processOcr([submission])}>{studentName} OCR 다시 시도</button>}
            {submission.extractedText && <label className="ocr-text-field">OCR 추출 원문<textarea rows="9" value={submission.extractedText} onChange={event => updateOne(submission.id, { extractedText: event.target.value, status: 'extracted', grading: null, approved: false })}/></label>}
            {submission.extractedText?.trim().length >= 20 && (!submission.grading || stale) && <button type="button" disabled={submission.status === 'grading'} onClick={() => grade(submission)}>{stale ? `${studentName} 다시 채점하기` : `${studentName} 채점하기`}</button>}
            {stale && <p className="stale-notice" role="status"><strong>수행평가가 변경됨</strong><span>이전 채점은 참고용으로 유지됩니다. 현재 루브릭으로 다시 채점해주세요.</span></p>}
            {submission.grading && <><GradingEditor assessment={assessment} submission={{ ...submission, studentName }} onChange={next => updateOne(submission.id, next)}/>{!validGrading && <p className="form-alert" role="alert">모든 점수는 평가 요소별 배점 범위 안에 있어야 하며 근거와 피드백을 입력해야 합니다.</p>}<div className="approval-actions"><p>AI 채점은 초안입니다. OCR 원문과 모든 근거를 확인한 뒤 승인해주세요.</p><button type="button" disabled={stale || !validGrading} className={submission.approved ? 'secondary-button' : ''} onClick={() => updateOne(submission.id, { approved: !submission.approved, status: submission.approved ? 'graded' : 'approved', approvalRevoked: false })}>{submission.approved ? '승인 취소' : `${studentName} 채점 승인`}</button></div></>}
        </article>;})}</div>
        {!submissions.length && <p className="empty-state">학생별 PDF 파일명을 <span className="nowrap">학생 이름으로 준비하면</span> <span className="nowrap">확인이 더 빠릅니다.</span></p>}
    </section>;
}
