function approvedCriterion(assessmentCriterion, gradingCriterion) {
    return {
        criterionId: assessmentCriterion.id,
        name: assessmentCriterion.name,
        standardCodes: assessmentCriterion.standardCodes,
        kind: assessmentCriterion.kind,
        evidence: gradingCriterion.evidence,
        reason: gradingCriterion.reason,
        feedback: gradingCriterion.feedback,
        sourceRefs: (gradingCriterion.sourceRefs ?? []).map(({ elementId, page, text }) => ({ elementId, page, text })),
    };
}

function isActualRevisionEvidence(assessment, assessmentCriterion, gradingCriterion) {
    const revision = gradingCriterion.revisionEvidence;
    return assessmentCriterion.kind === 'process'
        && revision?.teacherConfirmed === true
        && Boolean(revision.beforeEvidence?.trim() && revision.afterEvidence?.trim() && revision.changeReason?.trim())
        && revision.beforeSourceRef?.elementId !== revision.afterSourceRef?.elementId
        && (assessment?.backwardDesign?.checkpoints ?? []).some(checkpoint => checkpoint.phase === 'revision' && checkpoint.id === revision.checkpointId);
}

export function recordEvidenceBundle(assessment, submission) {
    const gradingById = new Map((submission?.grading?.criteria ?? [])
        .filter(item => item.status === 'scored' && item.teacherConfirmed === true)
        .map(item => [item.criterionId, item]));
    const hasRevisionCheckpoint = (assessment?.backwardDesign?.checkpoints ?? [])
        .some(checkpoint => checkpoint?.phase === 'revision');
    const revisionCriterionIds = new Set((assessment?.rubric?.criteria ?? [])
        .filter(item => hasRevisionCheckpoint && gradingById.has(item.id) && isActualRevisionEvidence(assessment, item, gradingById.get(item.id)))
        .map(item => item.id));
    const criteria = (assessment?.rubric?.criteria ?? [])
        .filter(item => gradingById.has(item.id))
        .map(item => approvedCriterion(item, gradingById.get(item.id)));
    const processEvidence = criteria
        .filter(item => item.kind === 'process' && !revisionCriterionIds.has(item.criterionId))
        .map(({ criterionId, name, evidence, reason, feedback }) => ({ criterionId, name, evidence, reason, feedback }));
    return {
        standards: assessment?.task?.standards ?? [],
        performanceTask: {
            title: assessment?.task?.title ?? '',
            product: assessment?.task?.product ?? '',
            procedure: assessment?.task?.procedure ?? [],
        },
        criteria,
        growthEvidence: criteria
            .filter(item => revisionCriterionIds.has(item.criterionId))
            .map(({ criterionId, name, evidence, reason, feedback }) => {
                const revisionEvidence = gradingById.get(criterionId).revisionEvidence;
                return { criterionId, name, evidence, reason, feedback, revisionEvidence };
            }),
        processEvidence,
    };
}
