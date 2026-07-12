import { sourceHash } from './source-hash.js';
import { hasGenerationInputChanged } from './lesson-input.js';
import { storedGradingSchema } from './grading-schema.js';

export function gradingSourceHash(assessment, extractedText) {
    return sourceHash({ assessment, extractedText });
}

export function gradingContentIsValid(assessment, grading, extractedText = '', elements = []) {
    const parsed = storedGradingSchema.safeParse(grading);
    if (!parsed.success) return false;
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
        if (result.sourceRefs.some(ref => elements.length > 0 && (elementById.get(ref.elementId)?.page !== ref.page))) return false;
        if (extractedText && !extractedText.includes(result.evidence)
            && !result.sourceRefs.some(ref => {
                const text = elementById.get(ref.elementId)?.text ?? '';
                return text.includes(result.evidence) || result.evidence.includes(text);
            })) return false;
        if (result.status === 'teacher_review') {
            unresolved = true;
            continue;
        }
        const level = criterion.levels.find(item => item.levelId === result.selectedLevelId);
        if (!level || level.score !== result.score || !result.sourceRefs.length) return false;
        total += result.score;
    }
    if (total !== parsed.data.provisionalTotal || total > assessment.totalPoints) return false;
    if (unresolved) return parsed.data.totalScore == null;
    if (parsed.data.totalScore == null) return true;
    return actual.every(result => result.status === 'scored' && result.teacherConfirmed) && parsed.data.totalScore === total;
}

export function gradingCanBeFinalized(assessment, grading, extractedText = '', elements = []) {
    return gradingContentIsValid(assessment, grading, extractedText, elements)
        && grading.criteria.every(result => result.status === 'scored' && result.teacherConfirmed)
        && grading.totalScore == null;
}

export function gradingIsCurrent(assessment, submission) {
    const currentHash = gradingSourceHash(assessment, submission?.extractedText ?? '');
    return gradingContentIsValid(assessment, submission?.grading, submission?.extractedText, submission?.elements)
        && submission.sourceHash === currentHash
        && submission.grading.sourceHash === currentHash;
}

export function submissionIsApprovedFor(assessment, submission) {
    return Boolean(submission?.approved && submission?.grading?.totalScore != null && gradingIsCurrent(assessment, submission));
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
