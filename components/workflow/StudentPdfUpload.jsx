'use client';
import { useMemo, useState } from 'react';
import {
    attachIndividualFiles,
    buildPacketMap,
    inspectCombinedPdf,
    MAX_SUBMISSION_FILES,
    splitCombinedPdf,
} from '@/lib/pdf/student-packets.js';
import { useSubmissionFiles } from './SubmissionFileProvider.jsx';

const MODES = Object.freeze({ individual: 'individual', combined: 'combined' });
const MINIMUM_STATUS_MS = 200;

async function keepStatusVisible(startedAt) {
    const remaining = MINIMUM_STATUS_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
}

function yieldToStatusPaint() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function showProcessing(setBusy, setBusyMessage, message) {
    setBusy(true);
    setBusyMessage(message);
}

function nextSubmissionId() {
    return `submission-${crypto.randomUUID()}`;
}

function submissionForPacket(packet, student, existing, fileName) {
    return {
        ...(existing ?? {}),
        id: existing?.id ?? nextSubmissionId(),
        studentId: student.id,
        studentName: student.name,
        needsStudentLink: false,
        fileName,
        packetPages: packet.packetPages,
        coverPages: packet.coverPages,
        answerPages: packet.answerPages,
        status: existing?.extractedText ? 'extracted' : 'pending',
        extractedText: existing?.extractedText ?? '',
        ocrModel: existing?.ocrModel ?? '',
        pageCount: packet.answerPages.length,
        grading: existing?.grading ?? null,
        originalAttached: true,
        originalReviewedAt: null,
        confirmedElementIds: [],
        originalRevision: (existing?.originalRevision ?? 0) + 1,
        approved: false,
        approvalRevoked: Boolean(existing?.approved || existing?.grading),
        error: '',
    };
}

function mergePackets(current, packets, students, fileName) {
    const next = [...current];
    const runtime = [];
    const studentById = new Map(students.map(student => [student.id, student]));
    const submissionByStudentId = new Map();
    for (const item of current) if (item.studentId) submissionByStudentId.set(item.studentId, item);
    const indexBySubmissionId = new Map(current.map((item, index) => [item.id, index]));
    for (const packet of packets) {
        const student = studentById.get(packet.studentId);
        const submission = submissionForPacket(packet, student, submissionByStudentId.get(packet.studentId), fileName(packet));
        const existingIndex = indexBySubmissionId.get(submission.id) ?? -1;
        if (existingIndex === -1) next.push(submission);
        else next[existingIndex] = submission;
        runtime.push({ id: submission.id, studentId: packet.studentId, packetFile: packet.packetFile, answerFile: packet.answerFile });
    }
    return { next, runtime };
}

function AlertMessage({ message }) {
    const phrase = '올바른 PDF 파일이 아닙니다.';
    if (!message.includes(phrase)) return message;
    const [prefix, suffix] = message.split(phrase);
    return <>{prefix}<span className="nowrap">{phrase}</span>{suffix}</>;
}

export function StudentPdfUpload({ students, submissions, onChange, onBusyChange = () => {} }) {
    const files = useSubmissionFiles();
    const [mode, setMode] = useState(MODES.individual);
    const [hasCoverPerStudent, setHasCoverPerStudent] = useState(false);
    const [answerPagesPerStudent, setAnswerPagesPerStudent] = useState(1);
    const [individualDrafts, setIndividualDrafts] = useState([]);
    const [combinedFile, setCombinedFile] = useState(null);
    const [actualPages, setActualPages] = useState(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [busyMessage, setBusyMessage] = useState('');
    const pickerDisabled = !students.length || busy;

    const combinedPreview = useMemo(() => {
        if (!combinedFile || !actualPages || !students.length) return { map: [], error: '' };
        try {
            return { map: buildPacketMap({ students, answerPagesPerStudent, hasCoverPerStudent, actualPages }), error: '' };
        } catch (error) {
            return { map: [], error: error.message };
        }
    }, [actualPages, answerPagesPerStudent, combinedFile, hasCoverPerStudent, students]);

    const switchMode = nextMode => {
        setMode(nextMode);
        setMessage('');
    };
    const chooseIndividual = event => {
        const selected = Array.from(event.target.files ?? []);
        setMessage('');
        if (selected.length > MAX_SUBMISSION_FILES) {
            setMessage(`학생 PDF는 최대 ${MAX_SUBMISSION_FILES}개까지 처리할 수 있습니다.`);
            event.target.value = '';
            return;
        }
        setIndividualDrafts(selected.map((file, index) => ({ key: `${file.name}-${file.size}-${index}`, file, studentId: '' })));
        event.target.value = '';
    };
    const chooseCombined = async event => {
        const selected = event.target.files?.[0] ?? null;
        setMessage('');
        setCombinedFile(null);
        setActualPages(null);
        if (!selected) return;
        const startedAt = Date.now();
        showProcessing(setBusy, setBusyMessage, 'PDF 페이지 확인 중…');
        onBusyChange(true);
        await yieldToStatusPaint();
        try {
            const pages = await inspectCombinedPdf(selected);
            setCombinedFile(selected);
            setActualPages(pages);
        } catch (error) {
            setMessage(error.message);
        } finally {
            await keepStatusVisible(startedAt);
            setBusy(false);
            setBusyMessage('');
            onBusyChange(false);
            event.target.value = '';
        }
    };
    const applyPackets = (packets, fileName, generationToken) => {
        const { next, runtime } = mergePackets(submissions, packets, students, fileName);
        if (!files.setMany(runtime, generationToken)) return false;
        onChange(next);
        return true;
    };
    const attachIndividuals = async () => {
        const generationToken = files.beginGeneration();
        const startedAt = Date.now();
        showProcessing(setBusy, setBusyMessage, '학생별 PDF 연결 준비 중…');
        onBusyChange(true);
        setMessage('');
        await yieldToStatusPaint();
        try {
            const packets = await attachIndividualFiles(individualDrafts, { students, hasCoverPerStudent });
            const accepted = applyPackets(packets, packet => individualDrafts.find(item => item.studentId === packet.studentId).file.name, generationToken);
            if (accepted) setIndividualDrafts([]);
        } catch (error) {
            setMessage(error.message);
        } finally {
            await keepStatusVisible(startedAt);
            setBusy(false);
            setBusyMessage('');
            onBusyChange(false);
        }
    };
    const splitCombined = async () => {
        const generationToken = files.beginGeneration();
        const startedAt = Date.now();
        showProcessing(setBusy, setBusyMessage, '학생별 PDF 묶음 생성 중…');
        onBusyChange(true);
        setMessage('');
        await yieldToStatusPaint();
        try {
            const packets = await splitCombinedPdf(combinedFile, { students, answerPagesPerStudent, hasCoverPerStudent });
            const accepted = applyPackets(packets, () => combinedFile.name, generationToken);
            if (accepted) {
                setCombinedFile(null);
                setActualPages(null);
            }
        } catch (error) {
            setMessage(error.message);
        } finally {
            await keepStatusVisible(startedAt);
            setBusy(false);
            setBusyMessage('');
            onBusyChange(false);
        }
    };

    return <section className="student-pdf-upload" aria-labelledby="student-pdf-upload-title" aria-busy={busy}>
        <div className="student-pdf-upload__heading">
            <div><h2 id="student-pdf-upload-title">학생 제출 PDF 연결</h2><p>원본은 이 화면이 열린 동안에만 보관하며, OCR에는 <span className="nowrap">표지를 뺀 답안 PDF만</span> 전송합니다.</p></div>
            <strong>{students.length} / {MAX_SUBMISSION_FILES}명</strong>
        </div>
        {!students.length && <p className="form-alert" role="alert">먼저 공용 학생 명단을 등록해주세요.</p>}
        <fieldset className="pdf-upload-modes" disabled={!students.length || busy}>
            <legend>PDF 입력 방식</legend>
            <label><input type="radio" name="pdf-upload-mode" checked={mode === MODES.individual} onChange={() => switchMode(MODES.individual)}/>학생별 개별 PDF</label>
            <label><input type="radio" name="pdf-upload-mode" checked={mode === MODES.combined} onChange={() => switchMode(MODES.combined)}/>명단 순서 합본 PDF</label>
        </fieldset>

        {mode === MODES.individual && <div className="pdf-upload-panel">
            <label className="inline-check"><input type="checkbox" checked={hasCoverPerStudent} onChange={event => setHasCoverPerStudent(event.target.checked)}/>각 개별 PDF의 첫 페이지가 <span className="nowrap">이 학생의 수행평가 안내 표지</span></label>
            <p className="field-help">개별 PDF의 표지도 원본 확인에는 포함하지만 OCR에서는 제외합니다.</p>
            <label className={`file-picker${pickerDisabled ? ' file-picker--disabled' : ''}`}><span>학생별 PDF <span className="optional">최대 50개 · 각 10MB</span></span><span className="file-picker__button">개별 PDF 선택</span><span className="file-picker__summary">{individualDrafts.length ? `${individualDrafts.length}개 선택됨` : '선택된 파일 없음'}</span><input aria-label="학생별 개별 PDF 파일" type="file" accept="application/pdf,.pdf" multiple disabled={pickerDisabled} onChange={chooseIndividual}/></label>
            {individualDrafts.length > 0 && <div className="individual-pdf-links">{individualDrafts.map((draft, index) => <label key={draft.key}><span>{index + 1}. {draft.file.name}</span><select aria-label={`${draft.file.name} 학생 연결`} value={draft.studentId} onChange={event => setIndividualDrafts(current => current.map(item => item.key === draft.key ? { ...item, studentId: event.target.value } : item))}><option value="">학생 선택</option>{students.map(student => <option key={student.id} value={student.id}>{student.grade}학년 {student.className}반 {student.number}번 {student.name}</option>)}</select></label>)}</div>}
            {individualDrafts.length > 0 && <button type="button" disabled={busy || individualDrafts.some(item => !item.studentId)} onClick={attachIndividuals}>학생별 PDF 연결하기</button>}
        </div>}

        {mode === MODES.combined && <div className="pdf-upload-panel">
            <div className="combined-pdf-settings"><label>학생 1명당 답안 페이지 수<input aria-label="학생 1명당 답안 페이지 수" type="number" min="1" max="300" value={answerPagesPerStudent} onChange={event => setAnswerPagesPerStudent(event.target.value)}/><span className="field-help">안내 표지를 제외한 실제 답안 쪽수입니다.</span></label><label className="inline-check"><input type="checkbox" checked={hasCoverPerStudent} onChange={event => setHasCoverPerStudent(event.target.checked)}/>각 학생 묶음 첫 페이지가 수행평가 안내 표지</label></div>
            <p className="field-help">표지는 웹 원본 확인에 포함하고 OCR·자동 채점에서는 제외합니다.</p>
            <label className={`file-picker${pickerDisabled ? ' file-picker--disabled' : ''}`}><span>명단 순서 합본 PDF <span className="optional">최대 100MB · 300쪽</span></span><span className="file-picker__button">합본 PDF 선택</span><span className="file-picker__summary">{combinedFile?.name ?? '선택된 파일 없음'}</span><input aria-label="명단 순서 합본 PDF 파일" type="file" accept="application/pdf,.pdf" disabled={pickerDisabled} onChange={chooseCombined}/></label>
            {actualPages != null && <p className={combinedPreview.error ? 'form-alert' : 'packet-page-count'} role={combinedPreview.error ? 'alert' : 'status'}>예상 {students.length * (Number(answerPagesPerStudent) + (hasCoverPerStudent ? 1 : 0))}쪽 · 실제 {actualPages}쪽{combinedPreview.error ? ` — ${combinedPreview.error}` : ''}</p>}
            {combinedPreview.map.length > 0 && <ol className="packet-preview">{combinedPreview.map.map((packet, index) => <li key={packet.studentId}>{students[index].name} · 묶음 {packet.packetPages[0]}–{packet.packetPages.at(-1)}쪽 · {packet.coverPages.length ? `표지 ${packet.coverPages[0]}쪽 · ` : '표지 없음 · '}답안 {packet.answerPages[0]}–{packet.answerPages.at(-1)}쪽</li>)}</ol>}
            {combinedPreview.map.length > 0 && <button type="button" disabled={busy} onClick={splitCombined}>학생별 PDF 묶음 만들기</button>}
        </div>}
        {busyMessage && <p className="status-line" role="status" aria-live="polite">{busyMessage}</p>}
        {message && <p className="form-alert" role="alert"><AlertMessage message={message}/></p>}
    </section>;
}
