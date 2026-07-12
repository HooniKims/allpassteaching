function canonicalRef(element) {
    return { elementId: element.id, page: element.page, text: element.text, coordinates: element.coordinates ?? [] };
}

function criterionIsConfirmable(criterion) {
    return criterion.status === 'scored'
        && criterion.sourceRefs?.length > 0
        && Boolean(criterion.evidence?.trim() && criterion.reason?.trim() && criterion.feedback?.trim());
}

export function GradingEditor({ assessment, submission, onChange, onSourceSelect = () => {} }) {
    const rubricById = new Map(assessment.rubric.criteria.map(item => [item.id, item]));
    const applyGrading = grading => {
        const provisionalTotal = grading.criteria.reduce((sum, criterion) => sum + (criterion.status === 'scored' ? criterion.score : 0), 0);
        onChange({
            ...submission,
            grading: { ...grading, provisionalTotal, totalScore: null },
            originalReviewedAt: null,
            reviewedOriginalRevision: null,
            approved: false,
            approvalRevoked: Boolean(submission.approved || submission.approvalRevoked),
        });
    };
    const updateCriterion = (index, patch) => applyGrading({
        ...submission.grading,
        criteria: submission.grading.criteria.map((criterion, criterionIndex) => criterionIndex === index ? { ...criterion, ...patch, teacherConfirmed: patch.teacherConfirmed ?? false } : criterion),
    });
    const chooseLevel = (index, criterion, rubric, levelId) => {
        const level = rubric.levels.find(item => item.levelId === levelId);
        if (!level) return;
        const next = {
            status: 'scored', decisionSource: 'teacher', criterionId: criterion.criterionId, selectedLevelId: level.levelId, score: level.score,
            evidence: criterion.evidence, reason: criterion.status === 'scored' ? criterion.reason : '',
            feedback: criterion.status === 'scored' ? criterion.feedback : '', confidence: criterion.confidence,
            sourceRefs: criterion.sourceRefs ?? [], teacherConfirmed: false,
        };
        applyGrading({ ...submission.grading, criteria: submission.grading.criteria.map((item, itemIndex) => itemIndex === index ? next : item) });
    };
    const availableElements = (submission.elements ?? []).filter(element => element?.id && Number.isInteger(element.page));
    const totalLabel = submission.grading.totalScore == null
        ? `임시 합계 ${submission.grading.provisionalTotal ?? 0}점`
        : `확정 총점 ${submission.grading.totalScore}점`;

    return <section className="grading-editor" aria-label={`${submission.studentName} 채점 결과 편집`}>
        <div className="grading-editor__head"><div><h3>루브릭 채점 결과</h3>{submission.grading.totalScore == null && <p>확정 총점은 모든 평가영역 확인 뒤 계산됩니다.</p>}</div><strong>{totalLabel}</strong></div>
        {submission.approvalRevoked && <p className="approval-revoked" role="status">수정되어 교사 승인이 해제되었습니다.</p>}
        <div className="grading-criteria">{submission.grading.criteria.map((criterion, index) => {
            const rubric = rubricById.get(criterion.criterionId);
            if (!rubric) return null;
            return <fieldset key={criterion.criterionId} className={criterion.status === 'teacher_review' ? 'grading-criterion grading-criterion--review' : 'grading-criterion'}>
                <legend>{rubric.name}</legend>
                <div className="grading-criterion__status"><span className={`review-badge${criterion.status === 'teacher_review' ? ' review-badge--warning' : ''}`}>{criterion.status === 'teacher_review' ? '교사 확인 필요' : criterion.decisionSource === 'teacher' ? '교사 선택' : 'AI 수준 추천'}</span><span>신뢰도 {Math.round(criterion.confidence * 100)}%</span></div>
                {criterion.status === 'teacher_review' && <p className="grading-review-reason">{criterion.reviewReason}</p>}
                <label>성취 수준<select aria-label={`${rubric.name} 성취 수준`} value={criterion.selectedLevelId ?? ''} onChange={event => chooseLevel(index, criterion, rubric, event.target.value)}><option value="">원본 확인 후 수준 선택</option>{rubric.levels.map(level => <option value={level.levelId} key={level.levelId}>{assessment.rubric.levels.find(item => item.id === level.levelId)?.label ?? level.levelId} · {level.score}점</option>)}</select></label>
                <div className="grading-score-readonly" aria-label={`${rubric.name} 선택 점수`}><span>선택 수준 점수</span><strong>{criterion.status === 'scored' ? `${criterion.score}점` : '미정'}</strong></div>
                <label>제출물 직접 근거<textarea aria-label={`${rubric.name} 제출물 직접 근거`} rows="3" value={criterion.evidence} onChange={event => updateCriterion(index, { evidence: event.target.value })}/></label>
                {criterion.status === 'scored' && <><label>평가 이유<textarea aria-label={`${rubric.name} 평가 이유`} rows="3" value={criterion.reason} onChange={event => updateCriterion(index, { reason: event.target.value })}/></label><label>다음 성장 피드백<textarea aria-label={`${rubric.name} 다음 성장 피드백`} rows="3" value={criterion.feedback} onChange={event => updateCriterion(index, { feedback: event.target.value })}/></label></>}
                <div className="grading-source-links">{criterion.sourceRefs?.length
                    ? criterion.sourceRefs.map((sourceRef, sourceIndex) => <span className="grading-source-link" key={`${sourceRef.elementId}-${sourceIndex}`}><button type="button" className="text-button grading-source-view" aria-label={`${criterion.evidence} 원본에서 보기`} onClick={() => onSourceSelect(sourceRef)}>원본에서 보기</button><button type="button" className="text-button grading-source-remove" aria-label={`${criterion.evidence} 원본 연결 삭제`} onClick={() => updateCriterion(index, { sourceRefs: criterion.sourceRefs.filter((_, refIndex) => refIndex !== sourceIndex) })}>연결 삭제</button></span>)
                    : <span>원본 위치 연결 안 됨</span>}
                    {availableElements.length > 0 && <label className="grading-source-picker">원본 근거 위치<select aria-label={`${rubric.name} 원본 근거 위치 연결`} value="" onChange={event => { const element = availableElements.find(item => item.id === event.target.value); if (element) updateCriterion(index, { sourceRefs: [canonicalRef(element)] }); }}><option value="">OCR 요소 선택</option>{availableElements.map(element => <option value={element.id} key={element.id}>{element.page}쪽 · {element.text.slice(0, 50) || element.category}</option>)}</select></label>}
                </div>
                <label className="grading-confirm"><input type="checkbox" aria-label={`${rubric.name} 근거와 수준 확인 완료`} checked={criterion.teacherConfirmed === true} disabled={!criterionIsConfirmable(criterion)} onChange={event => updateCriterion(index, { teacherConfirmed: event.target.checked })}/><span>원본 근거와 선택 수준을 확인했습니다.</span></label>
            </fieldset>;
        })}</div>
        <label>종합 의견<textarea rows="3" value={submission.grading.summary} onChange={event => applyGrading({ ...submission.grading, summary: event.target.value })}/></label>
        <label>다음 학습 제안<textarea rows="3" value={submission.grading.nextSteps} onChange={event => applyGrading({ ...submission.grading, nextSteps: event.target.value })}/></label>
    </section>;
}
