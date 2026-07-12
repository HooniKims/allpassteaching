'use client';
import { useMemo, useRef, useState } from 'react';
import { GradingEditor } from './GradingEditor.jsx';
import { PdfEvidenceViewer } from './PdfEvidenceViewer.jsx';

const TABS = [
    { id: 'original', label: '원본 답안' },
    { id: 'ocr', label: 'OCR 결과' },
    { id: 'grading', label: '채점 결과' },
];
const VISUAL_CATEGORIES = new Set(['equation', 'chart', 'figure']);
const CATEGORY_LABELS = { equation: '수식', chart: '도표', figure: '그림' };

function coordinatesUsable(value) {
    return Array.isArray(value) && value.length >= 2 && value.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y)
        && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1);
}

function elementNeedsReview(element) {
    return VISUAL_CATEGORIES.has(element?.category) || (Number.isFinite(element?.confidence) && element.confidence < 0.85) || !coordinatesUsable(element?.coordinates);
}

function EvidenceChecks({ submission, studentName, confirmedIds, onToggle, onSourceSelect }) {
    const elements = submission.elements ?? [];
    const risky = elements.filter(elementNeedsReview);
    return <section className="evidence-checks" aria-label={`${studentName} OCR 근거 확인`}>
        <div className="evidence-checks__heading"><h4>OCR 근거 확인</h4><p>수식·도표·그림과 낮은 신뢰도는 원본을 보고 확인하세요.</p></div>
        {submission.elementsTruncated && <label className="evidence-check"><span><strong>OCR 요소 일부 생략</strong><small><span className="review-badge">요소 일부 생략</span><span className="review-badge review-badge--warning">교사 확인 필요</span></small></span><input type="checkbox" aria-label={`${studentName} 생략된 OCR 요소 확인 완료`} checked={confirmedIds.includes('__elements_truncated__')} onChange={() => onToggle('__elements_truncated__')}/></label>}
        {risky.map(element => <article className="evidence-check" key={element.id}>
            <button type="button" className="evidence-check__source" onClick={() => onSourceSelect({ elementId: element.id, page: element.page, text: element.text, coordinates: element.coordinates })}>
                <strong>{element.text || `${element.page}쪽 OCR 요소`}</strong>
                <span>{CATEGORY_LABELS[element.category] && <span className="review-badge">{CATEGORY_LABELS[element.category]}</span>}{Number.isFinite(element.confidence) && element.confidence < 0.85 && <span className="review-badge">낮은 신뢰도</span>}{!coordinatesUsable(element.coordinates) && <span className="review-badge">원본 위치 연결 안 됨</span>}<span className="review-badge review-badge--warning">교사 확인 필요</span></span>
            </button>
            <label><span className="sr-only">{studentName} {element.id} 근거 확인 완료</span><input type="checkbox" aria-label={`${studentName} ${element.id} 근거 확인 완료`} checked={confirmedIds.includes(element.id)} onChange={() => onToggle(element.id)}/></label>
        </article>)}
        {!risky.length && !submission.elementsTruncated && <p className="evidence-checks__empty">별도 확인이 필요한 시각·저신뢰 근거가 없습니다.</p>}
    </section>;
}

export function requiredEvidenceCheckIds(submission) {
    const ids = (submission.elements ?? []).filter(elementNeedsReview).map(element => element.id);
    if (submission.elementsTruncated) ids.push('__elements_truncated__');
    return [...new Set(ids)];
}

export function SubmissionReviewWorkspace({ assessment, submission, studentName, fileUrl, stale, validGrading, onPatch }) {
    const [activeTab, setActiveTab] = useState('original');
    const [activeSourceRef, setActiveSourceRef] = useState(null);
    const tabRefs = useRef({});
    const reviewRef = useRef(null);
    const requiredIds = useMemo(() => requiredEvidenceCheckIds(submission), [submission]);
    const confirmedIds = submission.confirmedElementIds ?? [];
    const sourceChecksComplete = requiredIds.every(id => confirmedIds.includes(id));
    const originalAvailable = submission.originalAttached === true && Boolean(fileUrl || submission.file);
    const originalReviewed = originalAvailable && Boolean(submission.originalReviewedAt) && !stale;
    const approvalAllowed = !stale && validGrading && originalAvailable && originalReviewed && sourceChecksComplete;
    const selectSource = sourceRef => {
        setActiveSourceRef(sourceRef);
        setActiveTab('original');
        requestAnimationFrame(() => {
            const viewport = reviewRef.current?.querySelector('.pdf-page-viewport');
            if (viewport) viewport.focus();
            else tabRefs.current.original?.focus();
        });
    };
    const toggleEvidence = id => {
        const next = confirmedIds.includes(id) ? confirmedIds.filter(value => value !== id) : [...confirmedIds, id];
        onPatch({ confirmedElementIds: next, originalReviewedAt: null, approved: false, approvalRevoked: Boolean(submission.approved || submission.approvalRevoked) });
    };
    const editOcr = value => onPatch({ extractedText: value, status: 'extracted', grading: null, originalReviewedAt: null, confirmedElementIds: [], approved: false, approvalRevoked: Boolean(submission.approved || submission.grading) });
    const moveTab = (event, currentIndex) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1
            : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
        const next = TABS[nextIndex];
        setActiveTab(next.id);
        tabRefs.current[next.id]?.focus();
    };

    return <div className="submission-review" ref={reviewRef}>
        <div className="submission-review-tabs" role="tablist" aria-label={`${studentName} 제출물 검토 보기`}>
            {TABS.map((tab, index) => <button key={tab.id} ref={node => { tabRefs.current[tab.id] = node; }} id={`${submission.id}-${tab.id}-tab`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${submission.id}-${tab.id}-panel`} tabIndex={activeTab === tab.id ? 0 : -1} onKeyDown={event => moveTab(event, index)} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
        </div>
        <section id={`${submission.id}-original-panel`} role="tabpanel" aria-labelledby={`${submission.id}-original-tab`} className={`submission-review__panel submission-review__panel--original${activeTab === 'original' ? ' is-active' : ''}`}>
            {fileUrl
                ? <PdfEvidenceViewer fileUrl={fileUrl} studentName={studentName} answerPages={submission.answerPages} coverPages={submission.coverPages} activeSourceRef={activeSourceRef}/>
                : <div className="pdf-reattach"><p>새로고침으로 원본 파일이 사라졌습니다. OCR·채점 초안은 유지됩니다.</p><a href="#student-pdf-upload-title">원본 PDF 다시 연결하기</a></div>}
        </section>
        <section id={`${submission.id}-ocr-panel`} role="tabpanel" aria-labelledby={`${submission.id}-ocr-tab`} className={`submission-review__panel submission-review__panel--ocr${activeTab === 'ocr' ? ' is-active' : ''}`}>
            <label className="ocr-text-field">OCR 추출 원문<textarea rows="12" value={submission.extractedText} onChange={event => editOcr(event.target.value)}/></label>
            <EvidenceChecks submission={submission} studentName={studentName} confirmedIds={confirmedIds} onToggle={toggleEvidence} onSourceSelect={selectSource}/>
        </section>
        <section id={`${submission.id}-grading-panel`} role="tabpanel" aria-labelledby={`${submission.id}-grading-tab`} className={`submission-review__panel submission-review__panel--grading${activeTab === 'grading' ? ' is-active' : ''}`}>
            <GradingEditor assessment={assessment} submission={submission} onChange={onPatch} onSourceSelect={selectSource}/>
            {!validGrading && <p className="form-alert" role="alert">모든 점수는 평가 요소별 배점 범위 안에 있어야 하며 근거와 피드백을 입력해야 합니다.</p>}
            <div className="original-review-gate">
                {!sourceChecksComplete && <p>교사 확인 필요 근거 {requiredIds.filter(id => !confirmedIds.includes(id)).length}개를 먼저 확인해주세요.</p>}
                <label><input type="checkbox" aria-label={`${studentName} 원본 답안 확인 완료`} checked={originalReviewed} disabled={!originalAvailable || !validGrading || !sourceChecksComplete} onChange={event => onPatch({ originalReviewedAt: event.target.checked ? new Date().toISOString() : null, approved: false })}/>{studentName} 원본 답안 확인 완료</label>
            </div>
            <div className="approval-actions"><p>AI 채점은 초안입니다. 현재 원본과 <span className="nowrap">모든 근거를 확인한 뒤</span> 승인해주세요.</p><button type="button" disabled={!approvalAllowed} className={submission.approved ? 'secondary-button' : ''} onClick={() => onPatch({ approved: !submission.approved, status: submission.approved ? 'graded' : 'approved', approvalRevoked: false })}>{submission.approved ? '승인 취소' : `${studentName} 채점 승인`}</button></div>
        </section>
    </div>;
}
