import { sourceHash } from './source-hash.js';
import { hasGenerationInputChanged } from './lesson-input.js';

export function gradingSourceHash(assessment, extractedText) {
    return sourceHash({ assessment, extractedText });
}

export function gradingContentIsValid(assessment, grading, extractedText = '') {
    const expected = assessment?.rubric?.criteria ?? [];
    const actual = grading?.criteria ?? [];
    if (!expected.length || actual.length !== expected.length) return false;
    let total = 0;
    for (let index = 0; index < expected.length; index += 1) {
        const criterion = expected[index];
        const result = actual[index];
        if (result?.criterionId !== criterion.id || !Number.isInteger(result.score) || result.score < 0 || result.score > criterion.maxPoints) return false;
        if (!result.evidence?.trim() || !result.feedback?.trim()) return false;
        if (extractedText && !extractedText.includes(result.evidence)) return false;
        total += result.score;
    }
    return total === grading.totalScore && total <= assessment.totalPoints && Boolean(grading.summary?.trim() && grading.nextSteps?.trim());
}

export function gradingIsCurrent(assessment, submission) {
    return gradingContentIsValid(assessment, submission?.grading, submission?.extractedText)
        && submission.sourceHash === gradingSourceHash(assessment, submission.extractedText);
}

export function submissionIsApprovedFor(assessment, submission) {
    return Boolean(submission?.approved && gradingIsCurrent(assessment, submission));
}

export function recordSourceHash(assessment, submission) {
    return sourceHash({ assessment, grading: submission.grading });
}

export function recordIsCurrent(assessment, submission, record) {
    return Boolean(record?.approved && record.status === 'done' && record.text?.trim() && record.sourceHash === recordSourceHash(assessment, submission));
}

export function workflowProcessStatuses(project) {
    const lessonReady = Boolean(project.lessonSnapshot?.plan);
    const lessonInputsChanged = lessonReady && hasGenerationInputChanged(project.lessonSnapshot, project.lessonSnapshot.generatedFrom);
    const lessonHash = lessonReady ? sourceHash(project.lessonSnapshot.plan) : '';
    const assessmentReady = Boolean(!lessonInputsChanged && project.assessment?.approved && project.assessment.sourceHash === lessonHash);
    const currentApproved = assessmentReady ? project.submissions.filter(item => submissionIsApprovedFor(project.assessment, item)) : [];
    return {
        lesson: lessonReady && !lessonInputsChanged ? 'complete' : 'review',
        worksheet: !lessonReady ? 'prerequisite' : !lessonInputsChanged && project.worksheet?.sourceHash === lessonHash ? 'complete' : 'review',
        assessment: !lessonReady ? 'prerequisite' : assessmentReady ? 'complete' : 'review',
        grading: !assessmentReady ? 'prerequisite' : project.submissions.length > 0 && currentApproved.length === project.submissions.length ? 'complete' : 'review',
        records: !currentApproved.length ? 'prerequisite' : currentApproved.every(submission => recordIsCurrent(project.assessment, submission, project.records.find(record => record.submissionId === submission.id))) ? 'complete' : 'review',
    };
}
