import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OcrGradingStage } from '@/components/workflow/OcrGradingStage.jsx';
import { makeAssessment } from './fixtures/workflow.mjs';
import { gradingSourceHash } from '@/lib/workflow-lineage';

afterEach(() => vi.restoreAllMocks());

function Harness({ initial = [] }) {
    const [submissions, setSubmissions] = useState(initial);
    return <OcrGradingStage assessment={makeAssessment()} submissions={submissions} onChange={setSubmissions}/>;
}

test('accepts up to ten PDF files and derives editable student names', async () => {
    const user = userEvent.setup();
    render(<Harness/>);
    const input = screen.getByLabelText('학생 PDF 파일');
    expect(input).toHaveAttribute('multiple');
    expect(input).toHaveAttribute('accept', 'application/pdf,.pdf');

    await user.upload(input, [new File(['%PDF'], '김학생.pdf', { type: 'application/pdf' }), new File(['%PDF'], '이학생.pdf', { type: 'application/pdf' })]);

    expect(screen.getByDisplayValue('김학생')).toBeInTheDocument();
    expect(screen.getByDisplayValue('이학생')).toBeInTheDocument();
});

test('rejects more than ten files without creating partial rows', async () => {
    const user = userEvent.setup();
    render(<Harness/>);
    const files = Array.from({ length: 11 }, (_, index) => new File(['%PDF'], `${index + 1}번.pdf`, { type: 'application/pdf' }));
    await user.upload(screen.getByLabelText('학생 PDF 파일'), files);

    expect(screen.getByRole('alert')).toHaveTextContent('최대 10개');
    expect(screen.queryAllByLabelText(/학생 이름/)).toHaveLength(0);
});

test('keeps successful OCR when another student fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce(Response.json({ extractedText: '첫 학생 관찰 결과는 충분히 구체적으로 기록되었습니다.', ocrModel: 'document-parse', pageCount: 1 }))
        .mockResolvedValueOnce(Response.json({ message: '읽을 수 없는 PDF' }, { status: 422 })));
    render(<Harness/>);
    await user.upload(screen.getByLabelText('학생 PDF 파일'), [new File(['%PDF'], '김학생.pdf', { type: 'application/pdf' }), new File(['%PDF'], '이학생.pdf', { type: 'application/pdf' })]);
    await user.click(screen.getByRole('button', { name: '선택한 PDF OCR 시작' }));

    expect(await screen.findByDisplayValue('첫 학생 관찰 결과는 충분히 구체적으로 기록되었습니다.')).toBeInTheDocument();
    expect(await screen.findByText('읽을 수 없는 PDF')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이학생 OCR 다시 시도' })).toBeEnabled();
});

test('keeps both grading results when two student requests finish in reverse order', async () => {
    const user = userEvent.setup();
    const assessment = makeAssessment();
    const base = studentName => ({ id: studentName, studentName, fileName: `${studentName}.pdf`, status: 'extracted', extractedText: `${studentName}의 관찰 기록은 뿌리에 가는 털과 물 흡수 기능을 구체적으로 설명한다.`, grading: null, approved: false });
    const grading = { criteria: [
        { criterionId: 'criterion-1', score: 35, evidence: '뿌리에 가는 털', feedback: '구체적입니다.' },
        { criterionId: 'criterion-2', score: 35, evidence: '물 흡수 기능', feedback: '연결했습니다.' },
        { criterionId: 'criterion-3', score: 15, evidence: '관찰 기록', feedback: '수정 과정의 근거를 확인했습니다.' },
    ], totalScore: 85, summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명합니다.' };
    let resolveFirst; let resolveSecond;
    vi.stubGlobal('fetch', vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
        .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; })));
    function ConcurrentHarness() { const [items, setItems] = useState([base('김학생'), base('이학생')]); return <OcrGradingStage assessment={assessment} submissions={items} onChange={setItems}/>; }
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
    render(<Harness/>);
    await user.upload(screen.getByLabelText('학생 PDF 파일'), new File(['%PDF'], '김학생.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: '선택한 PDF OCR 시작' }));
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
    expect(screen.getByRole('alert')).toHaveTextContent('배점 범위');
});
