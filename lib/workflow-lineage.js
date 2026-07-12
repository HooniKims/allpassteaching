import { sourceHash } from './source-hash.js';
import { hasGenerationInputChanged } from './lesson-input.js';
import { storedGradingSchema } from './grading-schema.js';
import { gradingEvidenceLineage, gradingEvidenceMatchesElements, gradingEvidenceRiskIds, gradingSourceRefMatchesElement } from './grading-evidence.js';

export function gradingSourceHash(assessment, extractedText, elements = [], criteria = [], provenance = {}) {
    return sourceHash({ assessment, extractedText, ...gradingEvidenceLineage(elements, criteria, provenance) });
}

export function gradingContentIsValid(assessment, grading, extractedText = '', elements = [], provenance = {}) {
    const parsed = storedGradingSchema.safeParse(grading);
    if (!parsed.success) return false;
    if (!elements.length || new Set(elements.map(element => element.id)).size !== elements.length) return false;
    const expected = assessment?.rubric?.criteria ?? [];
    const actual = parsed.data.criteria;
    if (!expected.length || actual.length !== expected.length) return false;
    const elementById = new Map(elements.map(element => [element.id, element]));
    let total = 0;
    let unresolved = false;
    for (let index = 0; index < expected.length; index += 1) {
        const criterion = expected[index];
        const result = actual[index];
        if (result.criterionId !== criterion.id) return false;
        if (result.sourceRefs.some(ref => !gradingSourceRefMatchesElement(ref, elementById.get(ref.elementId)))) return false;
        if (!gradingEvidenceMatchesElements(result.evidence, result.sourceRefs.map(ref => elementById.get(ref.elementId)))) return false;
        if (result.status === 'teacher_review') {
            unresolved = true;
            continue;
        }
        const level = criterion.levels.find(item => item.levelId === result.selectedLevelId);
        if (!level || level.score !== result.score || !result.sourceRefs.length) return false;
        const linkedElements = result.sourceRefs.map(ref => elementById.get(ref.elementId)).filter(Boolean);
        const derivedReviewRequired = gradingEvidenceRiskIds(provenance, linkedElements).length > 0 || result.confidence < 0.85;
        if ((result.reviewRequired === true || derivedReviewRequired) && result.decisionSource !== 'teacher') return false;
        total += result.score;
    }
    if (total !== parsed.data.provisionalTotal || total > assessment.totalPoints) return false;
    if (unresolved) return parsed.data.totalScore == null;
    if (parsed.data.totalScore == null) return true;
    return actual.every(result => result.status === 'scored' && result.teacherConfirmed) && parsed.data.totalScore === total;
}

export function gradingCanBeFinalized(assessment, grading, extractedText = '', elements = [], provenance = {}) {
    return gradingContentIsValid(assessment, grading, extractedText, elements, provenance)
        && grading.criteria.every(result => result.status === 'scored' && result.teacherConfirmed)
        && grading.totalScore == null;
}

export function gradingIsCurrent(assessment, submission) {
    const currentHash = gradingSourceHash(assessment, submission?.extractedText ?? '', submission?.elements ?? [], submission?.grading?.criteria ?? [], submission);
    return gradingContentIsValid(assessment, submission?.grading, submission?.extractedText, submission?.elements, submission)
        && submission.sourceHash === currentHash
        && submission.grading.sourceHash === currentHash;
}

export function submissionIsApprovedFor(assessment, submission) {
    return Boolean(submission?.approved
        && submission?.grading?.totalScore != null
        && /^[a-f0-9]{64}$/.test(submission?.grading?.approvalToken ?? '')
        && gradingIsCurrent(assessment, submission));
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
    const assessmentReady = Boolean(!lessonInputsChanged && !project.assessment?.requiresAssessmentRegeneration && project.assessment?.approved && project.assessment.sourceHash === lessonHash);
    const currentApproved = assessmentReady ? project.submissions.filter(item => submissionIsApprovedFor(project.assessment, item)) : [];
    return {
        lesson: lessonReady && !lessonInputsChanged ? 'complete' : 'review',
        worksheet: !lessonReady ? 'prerequisite' : !lessonInputsChanged && project.worksheet?.sourceHash === lessonHash ? 'complete' : 'review',
        assessment: !lessonReady ? 'prerequisite' : assessmentReady ? 'complete' : 'review',
        grading: !assessmentReady ? 'prerequisite' : project.submissions.length > 0 && currentApproved.length === project.submissions.length ? 'complete' : 'review',
        records: !currentApproved.length ? 'prerequisite' : currentApproved.every(submission => recordIsCurrent(project.assessment, submission, project.records.find(record => record.submissionId === submission.id))) ? 'complete' : 'review',
    };
}
