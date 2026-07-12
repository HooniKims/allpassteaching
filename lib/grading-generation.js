export function gradingRevisionOf(submission) {
    return Number.isInteger(submission?.gradingRevision) && submission.gradingRevision >= 0 ? submission.gradingRevision : 0;
}

export function nextGradingRevision(submission) {
    return gradingRevisionOf(submission) + 1;
}

export function reviseSubmission(submission, patch = {}) {
    const revised = { ...submission, ...patch, gradingRevision: nextGradingRevision(submission), approved: false };
    if (revised.grading?.approvalToken) {
        const { approvalToken: _approvalToken, ...grading } = revised.grading;
        revised.grading = grading;
    }
    return revised;
}
