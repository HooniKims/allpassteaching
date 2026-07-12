import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PdfEvidenceViewer } from '@/components/workflow/PdfEvidenceViewer.jsx';

const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn(), workerOptions: {} }));

vi.mock('pdfjs-dist/build/pdf.mjs', () => ({
    getDocument: pdfjs.getDocument,
    GlobalWorkerOptions: pdfjs.workerOptions,
}));

function pdfDocument(pageCount = 3) {
    return {
        numPages: pageCount,
        destroy: vi.fn(),
        getPage: vi.fn(async () => ({
            getViewport: ({ scale, rotation }) => ({ width: 600 * scale, height: 800 * scale, rotation }),
            render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
        })),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    pdfjs.getDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument()) });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
    globalThis.ResizeObserver = class { observe() {} disconnect() {} };
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 324 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 480 });
});

test('Given a fitted narrow page When zooming out Then the rendered page becomes smaller instead of growing', async () => {
    const user = userEvent.setup();
    render(<PdfEvidenceViewer fileUrl="blob:student" studentName="김하늘" answerPages={[1]} coverPages={[]}/>);
    const canvas = await screen.findByLabelText('김하늘 PDF 1쪽');
    await waitFor(() => expect(canvas.style.width).toBe('300px'));

    await user.click(screen.getByRole('button', { name: '축소' }));

    await waitFor(() => expect(Number.parseInt(canvas.style.width, 10)).toBeLessThan(300));
});

test('Given browser fullscreen support When the fullscreen control is pressed Then the viewer requests fullscreen', async () => {
    const user = userEvent.setup();
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: requestFullscreen });
    render(<PdfEvidenceViewer fileUrl="blob:student" studentName="김하늘" answerPages={[1]} coverPages={[]}/>);

    await user.click(screen.getByRole('button', { name: '전체 화면' }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
});

test('Given a packet with a cover When the viewer opens Then it starts on the first answer and exposes complete controls', async () => {
    render(<PdfEvidenceViewer fileUrl="blob:student" studentName="김하늘" answerPages={[2, 3]} coverPages={[1]}/>);

    expect(await screen.findByLabelText('PDF 페이지')).toHaveValue(2);
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '확대' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '축소' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '회전' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '너비 맞춤' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '화면 맞춤' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '전체 화면' })).toBeEnabled();
});

test('Given linked evidence When its source is selected Then the viewer jumps pages and highlights finite normalized coordinates', async () => {
    const sourceRef = { elementId: 'evidence-1', page: 2, text: '관찰 근거', coordinates: [{ x: 0.2, y: 0.3 }, { x: 0.7, y: 0.45 }] };
    const { rerender } = render(<PdfEvidenceViewer fileUrl="blob:student" studentName="김하늘" answerPages={[2, 3]} coverPages={[1]}/>);
    await screen.findByLabelText('PDF 페이지');

    rerender(<PdfEvidenceViewer fileUrl="blob:student" studentName="김하늘" answerPages={[2, 3]} coverPages={[1]} activeSourceRef={sourceRef}/>);

    await waitFor(() => expect(screen.getByLabelText('PDF 페이지')).toHaveValue(3));
    const highlight = screen.getByTestId('evidence-highlight');
    expect(highlight).toBeVisible();
    expect(highlight.style.left).toBe('20%');
    expect(highlight.style.width).toBe('50%');
});

test('Given absent or unusable coordinates When evidence is selected Then the viewer shows the explicit text-only fallback', async () => {
    render(<PdfEvidenceViewer
        fileUrl="blob:student"
        studentName="김하늘"
        answerPages={[1]}
        coverPages={[]}
        activeSourceRef={{ elementId: 'missing', page: 1, text: '텍스트 근거', coordinates: [] }}
    />);

    expect(await screen.findByText('원본 위치 연결 안 됨')).toBeInTheDocument();
    expect(screen.queryByTestId('evidence-highlight')).not.toBeInTheDocument();
});

test('Given a cover page When the teacher navigates to it Then it is visibly excluded from grading', async () => {
    const user = userEvent.setup();
    render(<PdfEvidenceViewer fileUrl="blob:student" studentName="김하늘" answerPages={[2]} coverPages={[1]}/>);
    await screen.findByLabelText('PDF 페이지');

    await user.click(screen.getByRole('button', { name: '이전 페이지' }));

    expect(screen.getByText('채점 제외 표지')).toBeInTheDocument();
});
