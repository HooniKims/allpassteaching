export function GradingEditor({ assessment, submission, onChange }) {
    const rubricById = new Map(assessment.rubric.criteria.map(item => [item.id, item]));
    const applyGrading = grading => {
        const totalScore = grading.criteria.reduce((sum, criterion) => sum + (Number(criterion.score) || 0), 0);
        onChange({ ...submission, grading: { ...grading, totalScore }, approved: false, approvalRevoked: submission.approved || submission.approvalRevoked || false });
    };
    const updateCriterion = (index, patch) => applyGrading({ ...submission.grading, criteria: submission.grading.criteria.map((criterion, criterionIndex) => criterionIndex === index ? { ...criterion, ...patch } : criterion) });
    return <section className="grading-editor" aria-label={`${submission.studentName} 채점 결과 편집`}>
        <div className="grading-editor__head"><h3>루브릭 채점 결과</h3><strong>총점 {submission.grading.totalScore}점</strong></div>
        {submission.approvalRevoked && <p className="approval-revoked" role="status">수정되어 교사 승인이 해제되었습니다.</p>}
        <div className="grading-criteria">{submission.grading.criteria.map((criterion, index) => {
            const rubric = rubricById.get(criterion.criterionId);
            return <fieldset key={criterion.criterionId}><legend>{rubric?.name ?? criterion.criterionId}</legend>
                <label>점수 <span className="optional">/{rubric?.maxPoints ?? 0}점</span><input aria-label={`${rubric?.name} 점수`} type="number" min="0" max={rubric?.maxPoints ?? 100} value={criterion.score} onChange={event => updateCriterion(index, { score: Number(event.target.value) })}/></label>
                <label>제출물 직접 근거<textarea rows="3" value={criterion.evidence} onChange={event => updateCriterion(index, { evidence: event.target.value })}/></label>
                <label>피드백<textarea rows="3" value={criterion.feedback} onChange={event => updateCriterion(index, { feedback: event.target.value })}/></label>
            </fieldset>;
        })}</div>
        <label>종합 의견<textarea rows="3" value={submission.grading.summary} onChange={event => applyGrading({ ...submission.grading, summary: event.target.value })}/></label>
        <label>다음 학습 제안<textarea rows="3" value={submission.grading.nextSteps} onChange={event => applyGrading({ ...submission.grading, nextSteps: event.target.value })}/></label>
    </section>;
}
