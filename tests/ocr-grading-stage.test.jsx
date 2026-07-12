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

function Harness({ initial = [] }) {
    const [submissions, setSubmissions] = useState(initial);
    return <SubmissionFileProvider><OcrGradingStage assessment={makeAssessment()} submissions={submissions} onChange={setSubmissions}/></SubmissionFileProvider>;
}

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
    expect(await screen.findByRole('button', { name: '이학생 채점 승인' })).toBeEnabled();
    resolveFirst(Response.json({ grading }));
    expect(await screen.findByRole('button', { name: '김학생 채점 승인' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '이학생 채점 승인' })).toBeEnabled();
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
    expect(screen.getByRole('button', { name: '김학생 채점 승인' })).toBeDisabled();
});
