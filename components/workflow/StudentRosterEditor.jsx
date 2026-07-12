'use client';
import { useEffect, useRef, useState } from 'react';
import { createStudent, MAX_STUDENTS, validateRoster } from '@/lib/student-roster.js';
import { createRosterTemplate, parseRosterWorkbook } from '@/lib/student-roster-excel.js';

const EMPTY_COLLECTION = Object.freeze([]);

function readFile(file) {
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(reader.result);
        reader.readAsArrayBuffer(file);
    });
}

function downloadBytes(bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '학생명단_입력양식.xlsx';
    anchor.click();
    URL.revokeObjectURL(url);
}

function move(collection, index, offset) {
    const target = index + offset;
    if (target < 0 || target >= collection.length) return collection;
    const next = [...collection];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

export function StudentRosterEditor({ students, submissions = EMPTY_COLLECTION, records = EMPTY_COLLECTION, onChange, onDeleteStudent }) {
    const [importIssues, setImportIssues] = useState([]);
    const [draftStudents, setDraftStudents] = useState(students);
    const [editIssues, setEditIssues] = useState([]);
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirmId, setConfirmId] = useState(null);
    const dialogRef = useRef(null);
    const cancelButtonRef = useRef(null);
    const confirmedStudent = draftStudents.find(student => student.id === confirmId);
    useEffect(() => { setDraftStudents(students); setEditIssues([]); }, [students]);
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (confirmedStudent && !dialog.open) {
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
            cancelButtonRef.current?.focus();
        } else if (!confirmedStudent && dialog.open) {
            if (typeof dialog.close === 'function') dialog.close();
            else dialog.removeAttribute('open');
        }
    }, [confirmedStudent]);
    const applyDraft = next => {
        const issues = validateRoster(next);
        setDraftStudents(next);
        setEditIssues(issues);
        if (!issues.length) onChange(next);
    };
    const addStudent = () => {
        if (draftStudents.length >= MAX_STUDENTS) return;
        const previous = draftStudents.at(-1);
        applyDraft([...draftStudents, createStudent({ grade: previous?.grade ?? '', className: previous?.className ?? '', number: draftStudents.length + 1, name: '' })]);
    };
    const updateStudent = (id, field, value) => {
        applyDraft(draftStudents.map(student => student.id === id ? { ...student, [field]: field === 'number' && value !== '' ? Number(value) : value } : student));
    };
    const requestDelete = student => {
        const linked = submissions.some(item => item.studentId === student.id) || records.some(item => item.studentId === student.id);
        if (linked) setConfirmId(student.id);
        else if (students.some(item => item.id === student.id)) onDeleteStudent(student.id);
        else applyDraft(draftStudents.filter(item => item.id !== student.id));
    };
    const importWorkbook = async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setBusy(true);
        setStatus('');
        setImportIssues([]);
        try {
            const result = await parseRosterWorkbook(await readFile(file));
            if (result.issues.length) {
                setImportIssues(result.issues);
                return;
            }
            setDraftStudents(result.students);
            setEditIssues([]);
            onChange(result.students);
            setStatus(`${result.students.length}명을 불러왔습니다. Excel 행 순서를 그대로 사용합니다.`);
        } catch {
            setImportIssues([{ row: 1, column: '파일', message: 'Excel 파일을 읽을 수 없습니다.' }]);
        } finally {
            setBusy(false);
        }
    };
    const downloadTemplate = async () => {
        setBusy(true);
        setStatus('');
        try {
            downloadBytes(await createRosterTemplate());
            setStatus('학생 명단 입력 양식을 내려받았습니다.');
        } finally {
            setBusy(false);
        }
    };
    return <section className="student-roster" aria-labelledby="student-roster-heading">
        <div className="student-roster__heading">
            <div><p className="eyebrow">공용 학생 명단</p><h2 id="student-roster-heading">채점과 세특에 함께 쓸 학생을 등록해요</h2><p>학년·반·번호·이름만 입력하세요. 한 프로젝트에 <span className="nowrap">최대 {MAX_STUDENTS}명까지</span> 등록할 수 있습니다.</p></div>
            <strong aria-label={`등록 학생 ${draftStudents.length}명, 최대 ${MAX_STUDENTS}명`}>현재 {draftStudents.length}명 / 최대 {MAX_STUDENTS}명</strong>
        </div>
        <div className="student-roster__tools">
            <button type="button" className="secondary-button" disabled={busy} onClick={downloadTemplate}>Excel 입력 양식 받기</button>
            <label className="secondary-button student-roster__upload">Excel 명단 불러오기<input aria-label="학생 명단 Excel 업로드" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={importWorkbook}/></label>
            <button type="button" disabled={busy || draftStudents.length >= MAX_STUDENTS} onClick={addStudent}>학생 직접 추가</button>
        </div>
        <p className="field-help">Excel은 이 브라우저 안에서만 읽으며 <span className="nowrap">파일 자체를 서버로 보내지 않습니다.</span> 열 순서는 학년 · 반 · 번호 · 이름입니다.</p>
        {status && <p className="status-line" role="status">{status}</p>}
        {importIssues.length > 0 && <div className="roster-issues" role="alert"><strong>명단을 바꾸지 않았습니다. 아래 셀을 확인해주세요.</strong><ul>{importIssues.map(item => <li key={`${item.code}-${item.row}-${item.column}`}>{item.row}행 · {item.column}: {item.message}</li>)}</ul></div>}
        {editIssues.length > 0 && draftStudents.length > 0 && <div className="roster-issues roster-issues--editing" role="status"><strong>명단에 적용하지 않았습니다. 입력 중인 셀을 확인해주세요.</strong><ul>{editIssues.map(item => <li key={`${item.code}-${item.row}-${item.column}`}>{item.row}번 학생 · {item.column}: {item.message}</li>)}</ul></div>}
        <div className="student-roster__list" aria-label="학생 명단 편집">
            {draftStudents.map((student, index) => <fieldset className="student-roster__row" key={student.id}>
                <legend>{index + 1}번 학생</legend>
                <label>학년<input aria-label={`${index + 1}번 학생 학년`} value={student.grade} onChange={event => updateStudent(student.id, 'grade', event.target.value)}/></label>
                <label>반<input aria-label={`${index + 1}번 학생 반`} value={student.className} onChange={event => updateStudent(student.id, 'className', event.target.value)}/></label>
                <label>번호<input aria-label={`${index + 1}번 학생 번호`} type="number" min="1" value={student.number} onChange={event => updateStudent(student.id, 'number', event.target.value)}/></label>
                <label className="student-roster__name">이름<input aria-label={`${index + 1}번 학생 이름`} value={student.name} onChange={event => updateStudent(student.id, 'name', event.target.value)}/></label>
                <div className="student-roster__row-actions">
                    <button type="button" className="secondary-button" aria-label={`${student.name || `${index + 1}번 학생`} 위로 이동`} disabled={index === 0} onClick={() => applyDraft(move(draftStudents, index, -1))}>위로</button>
                    <button type="button" className="secondary-button" aria-label={`${student.name || `${index + 1}번 학생`} 아래로 이동`} disabled={index === draftStudents.length - 1} onClick={() => applyDraft(move(draftStudents, index, 1))}>아래로</button>
                    <button type="button" className="text-button" aria-label={`${student.name || `${index + 1}번 학생`} 삭제`} onClick={() => requestDelete(student)}>삭제</button>
                </div>
            </fieldset>)}
        </div>
        {!draftStudents.length && <p className="empty-state">학생을 직접 추가하거나 Excel 입력 양식으로 한 번에 불러오세요.</p>}
        <dialog ref={dialogRef} className="roster-delete-dialog" role="alertdialog" aria-labelledby="roster-delete-title" onCancel={event => { event.preventDefault(); setConfirmId(null); }}>
            {confirmedStudent && <><h3 id="roster-delete-title">학생 삭제 확인</h3>
                <p>{confirmedStudent.name} 학생의 제출물과 세특도 함께 삭제됩니다. 다른 학생 자료는 그대로 유지합니다.</p>
                <div><button type="button" className="danger-button" onClick={() => { onDeleteStudent(confirmedStudent.id); setConfirmId(null); }}>학생과 연결 자료 삭제</button><button ref={cancelButtonRef} type="button" className="secondary-button" onClick={() => setConfirmId(null)}>취소</button></div></>}
        </dialog>
    </section>;
}
