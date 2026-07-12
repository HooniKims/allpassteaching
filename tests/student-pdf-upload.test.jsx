import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudentPdfUpload } from '@/components/workflow/StudentPdfUpload.jsx';
import { SubmissionFileProvider, useSubmissionFiles } from '@/components/workflow/SubmissionFileProvider.jsx';

const students = [
    { id: 'student-a', grade: '2', className: '3', number: 1, name: '김학생' },
    { id: 'student-b', grade: '2', className: '3', number: 2, name: '이학생' },
];

async function sixPagePdf() {
    const document = await PDFDocument.create();
    for (let index = 0; index < 6; index += 1) document.addPage([300, 400]);
    return new File([await document.save()], '2반-수행평가.pdf', { type: 'application/pdf' });
}

async function threeHundredPagePdf() {
    const document = await PDFDocument.create();
    for (let index = 0; index < 300; index += 1) document.addPage([20, 20]);
    return new File([await document.save()], '300쪽-수행평가.pdf', { type: 'application/pdf' });
}

function Harness() {
    const [submissions, setSubmissions] = useState([]);
    const [uploadBusy, setUploadBusy] = useState(false);
    const files = useSubmissionFiles();
    return <>
        <StudentPdfUpload students={students} submissions={submissions} onChange={setSubmissions} onBusyChange={setUploadBusy}/>
        <button type="button" data-testid="downstream-action" disabled={uploadBusy}>다음 처리</button>
        <output data-testid="submissions">{JSON.stringify(submissions)}</output>
        <output data-testid="files">{submissions.filter(item => files.has(item.id)).length}</output>
    </>;
}

test('Given combined upload mode When the teacher selects per-student covers Then the UI explains cover exclusion and exact page ranges', async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:packet');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    render(<SubmissionFileProvider><Harness/></SubmissionFileProvider>);

    await user.click(screen.getByRole('radio', { name: '명단 순서 합본 PDF' }));
    await user.clear(screen.getByRole('spinbutton', { name: '학생 1명당 답안 페이지 수' }));
    await user.type(screen.getByRole('spinbutton', { name: '학생 1명당 답안 페이지 수' }), '2');
    await user.click(screen.getByRole('checkbox', { name: '각 학생 묶음 첫 페이지가 수행평가 안내 표지' }));
    await user.upload(screen.getByLabelText('명단 순서 합본 PDF 파일'), await sixPagePdf());

    expect(await screen.findByText('예상 6쪽 · 실제 6쪽')).toBeInTheDocument();
    expect(screen.getByText(/김학생.*묶음 1–3쪽.*표지 1쪽.*답안 2–3쪽/)).toBeInTheDocument();
    expect(screen.getByText(/표지는 웹 원본 확인에 포함하고 OCR·자동 채점에서는 제외합니다/)).toBeInTheDocument();

    const splitButton = screen.getByRole('button', { name: '학생별 PDF 묶음 만들기' });
    await waitFor(() => expect(splitButton).toBeEnabled());
    fireEvent.click(splitButton);
    await waitFor(() => expect(screen.getByTestId('files')).toHaveTextContent('2'));
    const submissions = JSON.parse(screen.getByTestId('submissions').textContent);
    expect(submissions.map(item => ({ studentId: item.studentId, packetPages: item.packetPages, coverPages: item.coverPages, answerPages: item.answerPages, originalAttached: item.originalAttached }))).toEqual([
        { studentId: 'student-a', packetPages: [1, 2, 3], coverPages: [1], answerPages: [2, 3], originalAttached: true },
        { studentId: 'student-b', packetPages: [4, 5, 6], coverPages: [4], answerPages: [5, 6], originalAttached: true },
    ]);
});

test('Given individual upload mode When shown Then the per-student cover choice is explicit', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:packet');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    render(<SubmissionFileProvider><Harness/></SubmissionFileProvider>);

    expect(screen.getByRole('checkbox', { name: '각 개별 PDF의 첫 페이지가 이 학생의 수행평가 안내 표지' })).toBeInTheDocument();
    expect(screen.getByText('개별 PDF의 표지도 원본 확인에는 포함하지만 OCR에서는 제외합니다.')).toBeInTheDocument();
});

test('Given a valid combined PDF When splitting starts Then the teacher and screen reader receive a processing status', async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:packet');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    render(<SubmissionFileProvider><Harness/></SubmissionFileProvider>);
    await user.click(screen.getByRole('radio', { name: '명단 순서 합본 PDF' }));
    await user.clear(screen.getByRole('spinbutton', { name: '학생 1명당 답안 페이지 수' }));
    await user.type(screen.getByRole('spinbutton', { name: '학생 1명당 답안 페이지 수' }), '150');
    await user.upload(screen.getByLabelText('명단 순서 합본 PDF 파일'), await threeHundredPagePdf());

    const splitButton = await screen.findByRole('button', { name: '학생별 PDF 묶음 만들기' });
    await waitFor(() => expect(splitButton).toBeEnabled());
    fireEvent.click(splitButton);

    expect(screen.getByText('학생별 PDF 묶음 생성 중…')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('region', { name: '학생 제출 PDF 연결' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('downstream-action')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('files')).toHaveTextContent('2'));
});
