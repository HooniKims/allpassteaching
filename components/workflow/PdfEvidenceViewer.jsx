'use client';
import { useEffect, useMemo, useRef, useState } from 'react';

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;

function coordinateBox(coordinates, rotation) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    if (!coordinates.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y)
        && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)) return null;
    const xMin = Math.min(...coordinates.map(point => point.x));
    const xMax = Math.max(...coordinates.map(point => point.x));
    const yMin = Math.min(...coordinates.map(point => point.y));
    const yMax = Math.max(...coordinates.map(point => point.y));
    const boxes = {
        0: { left: xMin, top: yMin, width: xMax - xMin, height: yMax - yMin },
        90: { left: 1 - yMax, top: xMin, width: yMax - yMin, height: xMax - xMin },
        180: { left: 1 - xMax, top: 1 - yMax, width: xMax - xMin, height: yMax - yMin },
        270: { left: yMin, top: 1 - xMax, width: yMax - yMin, height: xMax - xMin },
    };
    return boxes[rotation];
}

function percent(value) {
    return `${Number((value * 100).toFixed(4))}%`;
}

export function PdfEvidenceViewer({ fileUrl, studentName, coverPages = [], answerPages = [], activeSourceRef = null }) {
    const rootRef = useRef(null);
    const viewportRef = useRef(null);
    const canvasRef = useRef(null);
    const [pdf, setPdf] = useState(null);
    const [pageCount, setPageCount] = useState(1);
    const [pageNumber, setPageNumber] = useState(Math.max(1, coverPages.length + 1));
    const [scale, setScale] = useState(1);
    const [renderedScale, setRenderedScale] = useState(1);
    const [fitMode, setFitMode] = useState('width');
    const [rotation, setRotation] = useState(0);
    const [renderRevision, setRenderRevision] = useState(0);
    const [status, setStatus] = useState('PDF 불러오는 중…');
    const [error, setError] = useState('');
    const highlight = useMemo(() => coordinateBox(activeSourceRef?.coordinates, rotation), [activeSourceRef, rotation]);
    const isCover = pageNumber <= coverPages.length;

    useEffect(() => {
        setPageNumber(Math.max(1, coverPages.length + 1));
    }, [coverPages.length, fileUrl, studentName]);

    useEffect(() => {
        if (!activeSourceRef?.page) return;
        setPageNumber(Math.max(1, coverPages.length + activeSourceRef.page));
    }, [activeSourceRef, coverPages.length]);

    useEffect(() => {
        if (!fileUrl || typeof window === 'undefined') return undefined;
        let cancelled = false;
        let documentHandle;
        setStatus('PDF 불러오는 중…');
        setError('');
        import('pdfjs-dist/build/pdf.mjs').then(module => {
            module.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
            const task = module.getDocument(fileUrl);
            return task.promise;
        }).then(document => {
            documentHandle = document;
            if (cancelled) return document.destroy();
            setPdf(document);
            setPageCount(document.numPages);
            setPageNumber(current => Math.min(Math.max(1, current), document.numPages));
        }).catch(reason => {
            if (!cancelled) setError(reason instanceof Error ? reason.message : 'PDF를 표시하지 못했습니다.');
        });
        return () => {
            cancelled = true;
            documentHandle?.destroy();
            setPdf(null);
        };
    }, [fileUrl]);

    useEffect(() => {
        const element = viewportRef.current;
        if (!element || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => setRenderRevision(value => value + 1));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!pdf || !canvasRef.current || !viewportRef.current) return undefined;
        let cancelled = false;
        let renderTask;
        setStatus('페이지 그리는 중…');
        setError('');
        pdf.getPage(pageNumber).then(page => {
            if (cancelled) return;
            const base = page.getViewport({ scale: 1, rotation });
            const container = viewportRef.current;
            const fitted = fitMode === 'width'
                ? Math.max(0.1, (container.clientWidth - 24) / base.width)
                : fitMode === 'screen'
                    ? Math.max(0.1, Math.min((container.clientWidth - 24) / base.width, (container.clientHeight - 24) / base.height))
                    : scale;
            const nextScale = Math.min(MAX_SCALE, fitted);
            const viewport = page.getViewport({ scale: nextScale, rotation });
            setRenderedScale(nextScale);
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('PDF 캔버스를 준비하지 못했습니다.');
            const ratio = window.devicePixelRatio || 1;
            canvas.width = Math.floor(viewport.width * ratio);
            canvas.height = Math.floor(viewport.height * ratio);
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;
            renderTask = page.render({ canvasContext: context, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
            return renderTask.promise;
        }).then(() => { if (!cancelled) setStatus(''); }).catch(reason => {
            if (!cancelled && reason?.name !== 'RenderingCancelledException') setError(reason instanceof Error ? reason.message : 'PDF 페이지를 그리지 못했습니다.');
        });
        return () => { cancelled = true; renderTask?.cancel(); };
    }, [fitMode, pageNumber, pdf, renderRevision, rotation, scale]);

    const changePage = next => setPageNumber(Math.min(pageCount, Math.max(1, Number(next) || 1)));
    const zoom = delta => {
        setFitMode('custom');
        setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((renderedScale + delta).toFixed(2)))));
    };
    const toggleFullscreen = async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (rootRef.current?.requestFullscreen) await rootRef.current.requestFullscreen();
    };

    return <section className="pdf-evidence-viewer" ref={rootRef} aria-label={`${studentName} 원본 답안 PDF`}>
        <div className="pdf-viewer-toolbar" role="toolbar" aria-label="PDF 보기 도구">
            <button type="button" className="secondary-button" aria-label="이전 페이지" onClick={() => changePage(pageNumber - 1)} disabled={pageNumber <= 1}>이전</button>
            <label><span className="sr-only">PDF 페이지</span><input aria-label="PDF 페이지" type="number" min="1" max={pageCount} value={pageNumber} onChange={event => changePage(event.target.value)}/><span>/ {pageCount}</span></label>
            <button type="button" className="secondary-button" aria-label="다음 페이지" onClick={() => changePage(pageNumber + 1)} disabled={pageNumber >= pageCount}>다음</button>
            <button type="button" className="secondary-button" aria-label="축소" onClick={() => zoom(-0.25)}>축소</button>
            <button type="button" className="secondary-button" aria-label="확대" onClick={() => zoom(0.25)}>확대</button>
            <button type="button" className="secondary-button" aria-label="회전" onClick={() => setRotation(value => (value + 90) % 360)}>회전</button>
            <button type="button" className="secondary-button" aria-label="너비 맞춤" onClick={() => setFitMode('width')}>너비</button>
            <button type="button" className="secondary-button" aria-label="화면 맞춤" onClick={() => setFitMode('screen')}>화면</button>
            <button type="button" className="secondary-button" aria-label="전체 화면" onClick={toggleFullscreen}>전체</button>
        </div>
        {isCover && <p className="pdf-cover-label">채점 제외 표지</p>}
        {activeSourceRef && !highlight && <p className="pdf-source-fallback" role="status">원본 위치 연결 안 됨</p>}
        <div className="pdf-page-viewport" ref={viewportRef} tabIndex="0" aria-label={`${studentName} PDF 페이지 스크롤 영역`} aria-busy={Boolean(status)}>
            <div className="pdf-page-layer">
                <canvas ref={canvasRef} aria-label={`${studentName} PDF ${pageNumber}쪽`}/>
                {highlight && <span
                    data-testid="evidence-highlight"
                    className="pdf-evidence-highlight"
                    style={{ left: percent(highlight.left), top: percent(highlight.top), width: percent(highlight.width), height: percent(highlight.height) }}
                />}
            </div>
        </div>
        {status && <p className="pdf-viewer-status" role="status">{status}</p>}
        {error && <p className="item-error" role="alert">{error}</p>}
        {!answerPages.length && <p className="pdf-source-fallback">답안 페이지 정보를 확인해주세요.</p>}
    </section>;
}
