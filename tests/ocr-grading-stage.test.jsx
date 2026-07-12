import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PDFDocument } from 'pdf-lib';
import { OcrGradingStage } from '@/components/workflow/OcrGradingStage.jsx';
import { SubmissionFileProvider } from '@/components/workflow/SubmissionFileProvider.jsx';
import { makeAssessment } from './fixtures/workflow.mjs';
import { gradingSourceHash } from '@/lib/workflow-lineage';

afterEach(() => vi.restoreAllMocks());

function Harness({ initial = [], assessment = makeAssessment() }) {
    const [submissions, setSubmissions] = useState(initial);
    return <SubmissionFileProvider><OcrGradingStage assessment={assessment} submissions={submissions} onChange={setSubmissions}/></SubmissionFileProvider>;
}

function reviewedSubmission(assessment = makeAssessment()) {
    const grading = { criteria: [
        { criterionId: 'criterion-1', score: 35, evidence: '관찰 근거', feedback: '구체적입니다.', sourceRefs: [{ elementId: 'element-1', page: 2, text: '관찰 근거', coordinates: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.3 }] }] },
        { criterionId: 'criterion-2', score: 35, evidence: '기능 설명', feedback: '연결했습니다.', sourceRefs: [] },
        { criterionId: 'criterion-3', score: 15, evidence: '수정 과정', feedback: '과정을 확인했습니다.', sourceRefs: [] },
    ], totalScore: 85, summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명합니다.' };
    return {
        id: 'reviewed', studentName: '김하늘', fileName: '김하늘.pdf', file: new File(['%PDF-review'], '김하늘.pdf', { type: 'application/pdf' }),
        originalAttached: true, originalReviewedAt: null, originalRevision: 1, coverPages: [1], answerPages: [2], status: 'graded',
        extractedText: '관찰 근거와 기능 설명 및 수정 과정을 충분히 기록한 학생 제출 내용입니다.',
        elements: [{ id: 'element-1', page: 2, category: 'equation', text: '관찰 근거', confidence: 0.7, coordinates: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.3 }] }],
        elementsTruncated: false, grading, approved: false,
        sourceHash: gradingSourceHash(assessment, '관찰 근거와 기능 설명 및 수정 과정을 충분히 기록한 학생 제출 내용입니다.'),
    };
}

test('Given linked risky evidence When grading is reviewed Then source and original checks gate approval and mobile review tabs remain accessible', async () => {
    const user = userEvent.setup();
    const assessment = makeAssessment();
    render(<Harness initial={[reviewedSubmission(assessment)]} assessment={assessment}/>);

    expect(screen.getByRole('tab', { name: '원본 답안' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'OCR 결과' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '채점 결과' })).toBeInTheDocument();
    expect(screen.getByText('수식')).toBeInTheDocument();
    expect(screen.getByText('낮은 신뢰도')).toBeInTheDocument();
    expect(screen.getByText('교사 확인 필요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '김하늘 채점 승인' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '관찰 근거 원본에서 보기' }));
    expect(screen.getByRole('tab', { name: '원본 답안' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByRole('tab', { name: '원본 답안' })).toHaveFocus());
    await user.click(screen.getByLabelText('김하늘 element-1 근거 확인 완료'));
    await user.click(screen.getByLabelText('김하늘 원본 답안 확인 완료'));

    expect(screen.getByRole('button', { name: '김하늘 채점 승인' })).toBeEnabled();
});

test('Given mobile review tabs When arrow keys are pressed Then focus and selection move without a pointer', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[reviewedSubmission()]}/>);
    const originalTab = screen.getByRole('tab', { name: '원본 답안' });
    originalTab.focus();

    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'OCR 결과' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'OCR 결과' })).toHaveAttribute('aria-selected', 'true');
});

test('Given an approved original When the rubric changes Then original review and approval are revoked', async () => {
    const assessment = makeAssessment();
    const initial = { ...reviewedSubmission(assessment), originalReviewedAt: '2026-07-12T12:00:00.000Z', confirmedElementIds: ['element-1'], approved: true };
    const { rerender } = render(<Harness initial={[initial]} assessment={assessment}/>);

    rerender(<Harness initial={[initial]} assessment={{ ...assessment, totalPoints: assessment.totalPoints + 1 }}/>);

    await waitFor(() => expect(screen.getByLabelText('김하늘 원본 답안 확인 완료')).not.toBeChecked());
    expect(screen.getByRole('button', { name: '김하늘 채점 승인' })).toBeDisabled();
    expect(screen.getByText('수정되어 교사 승인이 해제되었습니다.')).toBeInTheDocument();
});

test('Given a reviewed original When OCR text is edited Then review and approval are cleared', async () => {
    const user = userEvent.setup();
    const assessment = makeAssessment();
    const initial = { ...reviewedSubmission(assessment), originalReviewedAt: '2026-07-12T12:00:00.000Z', confirmedElementIds: ['element-1'], approved: true };
    render(<Harness initial={[initial]} assessment={assessment}/>);

    const ocr = screen.getByLabelText('OCR 추출 원문');
    await user.type(ocr, ' 수정');

    expect(screen.queryByLabelText('김하늘 원본 답안 확인 완료')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '김하늘 채점 승인' })).not.toBeInTheDocument();
    expect(screen.getByText('수정되어 교사 승인이 해제되었습니다.')).toBeInTheDocument();
});

function RosterHarness() {
    const [students, setStudents] = useState([{ id: 'student-a', grade: '2', className: '3', number: 7, name: '김학생' }]);
    const [submissions, setSubmissions] = useState([]);
    return <SubmissionFileProvider>
        <OcrGradingStage assessment={makeAssessment()} students={students} submissions={submissions} onStudentsChange={setStudents} onDeleteStudent={() => {}} onChange={setSubmissions}/>
        <output data-testid="submission-state">{JSON.stringify(submissions)}</output>
    </SubmissionFileProvider>;
}

async function validPdf(name) {
    const document = await PDFDocument.create();
    document.addPage([300, 400]);
    return new File([await document.save()], name, { type: 'application/pdf' });
}

test('replaces the old ten-file limit with the shared fifty-student limit', () => {
    render(<RosterHarness/>);

    expect(screen.getByText('최대 50개 · 각 10MB')).toBeInTheDocument();
    expect(screen.getByLabelText('학생별 개별 PDF 파일')).toHaveAttribute('multiple');
    expect(screen.getByLabelText('학생별 개별 PDF 파일')).toHaveAttribute('accept', 'application/pdf,.pdf');
});

test('같은 이름의 명단이 있어도 PDF는 자동 연결하지 않고 교사가 안정적인 학생 ID를 직접 연결한다', async () => {
    const user = userEvent.setup();
    render(<RosterHarness/>);

    await user.upload(screen.getByLabelText('학생별 개별 PDF 파일'), await validPdf('김학생.pdf'));
    expect(JSON.parse(screen.getByTestId('submission-state').textContent)).toEqual([]);

    await user.selectOptions(screen.getByRole('combobox', { name: '김학생.pdf 학생 연결' }), 'student-a');
    await user.click(screen.getByRole('button', { name: '학생별 PDF 연결하기' }));

    const after = JSON.parse(await waitFor(() => screen.getByTestId('submission-state').textContent.includes('student-a') ? screen.getByTestId('submission-state').textContent : ''));
    expect(after[0]).toMatchObject({ studentName: '김학생', studentId: 'student-a', needsStudentLink: false });
});

test('rejects more than fifty files without creating partial rows', async () => {
    const user = userEvent.setup();
    render(<RosterHarness/>);
    const selected = Array.from({ length: 51 }, (_, index) => new File(['%PDF-'], `${index + 1}번.pdf`, { type: 'application/pdf' }));
    await user.upload(screen.getByLabelText('학생별 개별 PDF 파일'), selected);

    expect(screen.getByRole('alert')).toHaveTextContent('최대 50개');
    expect(JSON.parse(screen.getByTestId('submission-state').textContent)).toEqual([]);
});

test('keeps successful OCR when another student fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(Response.json({ extractedText: '첫 학생 관찰 결과는 충분히 구체적으로 기록되었습니다.', ocrModel: 'document-parse', pageCount: 1 }))
        .mockResolvedValueOnce(Response.json({ message: '읽을 수 없는 PDF' }, { status: 422 })));
    const initial = [
        { id: 'a', studentName: '김학생', fileName: '김학생.pdf', file: new File(['%PDF'], '김학생.pdf', { type: 'application/pdf' }), originalAttached: true, status: 'pending', extractedText: '' },
        { id: 'b', studentName: '이학생', fileName: '이학생.pdf', file: new File(['%PDF'], '이학생.pdf', { type: 'application/pdf' }), originalAttached: true, status: 'pending', extractedText: '' },
    ];
    render(<Harness initial={initial}/>);
    await user.click(screen.getByRole('button', { name: '연결한 답안 PDF OCR 시작' }));

    expect(await screen.findByDisplayValue('첫 학생 관찰 결과는 충분히 구체적으로 기록되었습니다.')).toBeInTheDocument();
    expect(await screen.findByText('읽을 수 없는 PDF')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이학생 OCR 다시 시도' })).toBeEnabled();
});

test('sends the approved visual-analysis requirement for every batch and retry OCR request', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json({ message: '읽을 수 없는 PDF' }, { status: 422 }))));
    const assessment = { ...makeAssessment(), approved: true, visualAnalysisRequired: true };
    const initial = [
        { id: 'a', studentName: '김학생', fileName: '김학생.pdf', file: new File(['%PDF-a'], '김학생.pdf', { type: 'application/pdf' }), originalAttached: true, status: 'pending', extractedText: '' },
        { id: 'b', studentName: '이학생', fileName: '이학생.pdf', file: new File(['%PDF-b'], '이학생.pdf', { type: 'application/pdf' }), originalAttached: true, status: 'pending', extractedText: '' },
    ];
    render(<Harness initial={initial} assessment={assessment}/>);

    await user.click(screen.getByRole('button', { name: '연결한 답안 PDF OCR 시작' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await user.click(await screen.findByRole('button', { name: '김학생 OCR 다시 시도' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));

    expect(fetch.mock.calls.map(([, options]) => options.body.get('visualAnalysis'))).toEqual(['true', 'true', 'true']);
});

test('sends an explicit false visual-analysis requirement for nonvisual assessments', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ extractedText: '관찰 결과를 충분히 기록한 서술형 답안입니다.', ocrModel: 'document-parse', pageCount: 1 })));
    const assessment = { ...makeAssessment(), approved: true, visualAnalysisRequired: false };
    const initial = [{ id: 'a', studentName: '김학생', fileName: '김학생.pdf', file: new File(['%PDF-a'], '김학생.pdf', { type: 'application/pdf' }), originalAttached: true, status: 'pending', extractedText: '' }];
    render(<Harness initial={initial} assessment={assessment}/>);

    await user.click(screen.getByRole('button', { name: '연결한 답안 PDF OCR 시작' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    expect(fetch.mock.calls[0][1].body.get('visualAnalysis')).toBe('false');
});

test('discards an OCR response when the current assessment changes to a different visual mode', async () => {
    const user = userEvent.setup();
    let resolveFirst;
    vi.stubGlobal('fetch', vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
        .mockResolvedValueOnce(Response.json({ extractedText: '현재 시각 분석 설정으로 다시 추출한 답안 내용입니다.', ocrModel: 'document-parse', pageCount: 1, visualAnalysisStatus: 'enhanced_used', reviewState: 'teacher_review', autoScoreAllowed: false })));
    const initial = [{ id: 'a', studentName: '김학생', fileName: '김학생.pdf', file: new File(['%PDF-a'], '김학생.pdf', { type: 'application/pdf' }), originalAttached: true, status: 'pending', extractedText: '' }];
    const nonvisual = { ...makeAssessment(), approved: true, visualAnalysisRequired: false };
    const visual = { ...makeAssessment(), approved: true, visualAnalysisRequired: true };
    const { rerender } = render(<Harness initial={initial} assessment={nonvisual}/>);

    await user.click(screen.getByRole('button', { name: '연결한 답안 PDF OCR 시작' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0][1].body.get('visualAnalysis')).toBe('false');
    rerender(<Harness initial={initial} assessment={visual}/>);
    resolveFirst(Response.json({ extractedText: '이전 설정으로 도착한 OCR 결과는 사용하지 않습니다.', ocrModel: 'document-parse', pageCount: 1, visualAnalysisStatus: 'not_requested', reviewState: 'ready_for_rubric_review', autoScoreAllowed: true }));

    expect(await screen.findByText(/수행평가의 시각 분석 설정이 변경/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('이전 설정으로 도착한 OCR 결과는 사용하지 않습니다.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '김학생 OCR 다시 시도' }));
    expect(await screen.findByDisplayValue('현재 시각 분석 설정으로 다시 추출한 답안 내용입니다.')).toBeInTheDocument();
    expect(fetch.mock.calls[1][1].body.get('visualAnalysis')).toBe('true');
});

test('keeps both grading results when two student requests finish in reverse order', async () => {
    const user = userEvent.setup();
    const assessment = makeAssessment();
    const base = studentName => ({ id: studentName, studentName, fileName: `${studentName}.pdf`, file: new File(['%PDF-attached'], `${studentName}.pdf`, { type: 'application/pdf' }), originalAttached: true, status: 'extracted', extractedText: `${studentName}의 관찰 기록은 뿌리에 가는 털과 물 흡수 기능을 구체적으로 설명한다.`, grading: null, approved: false });
    const grading = { criteria: [
        { criterionId: 'criterion-1', score: 35, evidence: '뿌리에 가는 털', feedback: '구체적입니다.' },
        { criterionId: 'criterion-2', score: 35, evidence: '물 흡수 기능', feedback: '연결했습니다.' },
        { criterionId: 'criterion-3', score: 15, evidence: '관찰 기록', feedback: '수정 과정의 근거를 확인했습니다.' },
    ], totalScore: 85, summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명합니다.' };
    let resolveFirst; let resolveSecond;
    vi.stubGlobal('fetch', vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
        .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; })));
    function ConcurrentHarness() { const [items, setItems] = useState([base('김학생'), base('이학생')]); return <SubmissionFileProvider><OcrGradingStage assessment={assessment} submissions={items} onChange={setItems}/></SubmissionFileProvider>; }
    render(<ConcurrentHarness/>);

    await user.click(screen.getByRole('button', { name: '김학생 채점하기' }));
    await user.click(screen.getByRole('button', { name: '이학생 채점하기' }));
    resolveSecond(Response.json({ grading }));
    expect(await screen.findByRole('button', { name: '이학생 채점 승인' })).toBeDisabled();
    resolveFirst(Response.json({ grading }));
    expect(await screen.findByRole('button', { name: '김학생 채점 승인' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이학생 채점 승인' })).toBeDisabled();
});

test('does not restore a deleted student when an in-flight OCR request finishes', async () => {
    const user = userEvent.setup();
    let resolveOcr;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(resolve => { resolveOcr = resolve; })));
    const initial = [{ id: 'a', studentName: '김학생', fileName: '김학생.pdf', file: new File(['%PDF'], '김학생.pdf', { type: 'application/pdf' }), originalAttached: true, status: 'pending', extractedText: '' }];
    render(<Harness initial={initial}/>);
    await user.click(screen.getByRole('button', { name: '연결한 답안 PDF OCR 시작' }));
    await user.click(screen.getByRole('button', { name: '김학생 삭제' }));
    resolveOcr(Response.json({ extractedText: '삭제 뒤 도착한 OCR 내용은 다시 추가되면 안 됩니다.', ocrModel: 'document-parse', pageCount: 1 }));
    await waitFor(() => expect(screen.queryByDisplayValue('김학생')).not.toBeInTheDocument());
    expect(screen.queryByText('삭제 뒤 도착한 OCR 내용은 다시 추가되면 안 됩니다.')).not.toBeInTheDocument();
});

test('disables approval when a teacher score exceeds the criterion maximum', () => {
    const assessment = makeAssessment();
    const grading = { criteria: [
        { criterionId: 'criterion-1', score: 99, evidence: '관찰 근거', feedback: '피드백' },
        { criterionId: 'criterion-2', score: 1, evidence: '기능 설명', feedback: '피드백' },
        { criterionId: 'criterion-3', score: 0, evidence: '학생 제출', feedback: '피드백' },
    ], totalScore: 100, summary: '요약', nextSteps: '다음 단계' };
    const submission = { id: 's1', studentName: '김학생', fileName: '김학생.pdf', status: 'graded', extractedText: '관찰 근거와 기능 설명을 충분히 기록한 학생 제출 내용입니다.', grading, approved: false };
    submission.sourceHash = gradingSourceHash(assessment, submission.extractedText);
    render(<Harness initial={[submission]}/>);
    expect(screen.getByRole('button', { name: '김학생 채점 승인' })).toBeDisabled();
    expect(screen.getByText(/모든 점수는 평가 요소별 배점 범위/)).toBeInTheDocument();
});

test.each([
    ['missing', {}],
    ['undefined', { originalAttached: undefined }],
    ['null', { originalAttached: null }],
    ['false', { originalAttached: false }],
])('Given %s original attachment state When OCR and approval controls render Then both are blocked and reconnection is required', (_label, attachment) => {
    const assessment = makeAssessment();
    const grading = { criteria: [
        { criterionId: 'criterion-1', score: 35, evidence: '관찰 근거', feedback: '구체적입니다.' },
        { criterionId: 'criterion-2', score: 35, evidence: '기능 설명', feedback: '연결했습니다.' },
        { criterionId: 'criterion-3', score: 15, evidence: '수정 과정', feedback: '과정을 확인했습니다.' },
    ], totalScore: 85, summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명합니다.' };
    const submission = {
        id: `attachment-${_label}`,
        studentName: '김학생',
        fileName: '김학생.pdf',
        file: new File(['%PDF-legacy'], '김학생.pdf', { type: 'application/pdf' }),
        status: 'graded',
        extractedText: '관찰 근거와 기능 설명 및 수정 과정을 충분히 기록한 학생 제출 내용입니다.',
        grading,
        approved: false,
        ...attachment,
    };
    submission.sourceHash = gradingSourceHash(assessment, submission.extractedText);

    render(<Harness initial={[submission]}/>);

    expect(screen.queryByRole('button', { name: '연결한 답안 PDF OCR 시작' })).not.toBeInTheDocument();
    expect(screen.getByText('원본 PDF 다시 연결')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '원본 PDF 다시 연결하기' })).toHaveAttribute('href', '#student-pdf-upload-title');
    expect(screen.getByRole('button', { name: '김학생 채점 승인' })).toBeDisabled();
});
