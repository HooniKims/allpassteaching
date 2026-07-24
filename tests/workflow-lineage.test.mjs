import { expect, test } from 'vitest';
import { makeAssessment } from './fixtures/workflow.mjs';
import { generationDraft, makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { createGenerationSnapshot } from '@/lib/lesson-input';
import { gradingCanBeFinalized, gradingContentIsValid, gradingIsCurrent, gradingSourceHash, recordSourceHash, submissionIsApprovedFor, workflowProcessStatuses } from '@/lib/workflow-lineage';
import { sourceHash } from '@/lib/source-hash';
import { canonicalGradingOrigin, canonicalGradingSourceRef } from '@/lib/grading-evidence';

const baseElements = [
    { id: 'e1', page: 1, category: 'text', text: '뿌리에 가는 털', confidence: .92, coordinates: [{ x: .1, y: .1 }, { x: .7, y: .2 }] },
    { id: 'e2', page: 1, category: 'text', text: '물을 흡수한다', confidence: .9, coordinates: [{ x: .1, y: .3 }, { x: .7, y: .4 }] },
    { id: 'e3', page: 1, category: 'text', text: '관찰 결과', confidence: .88, coordinates: [{ x: .1, y: .5 }, { x: .7, y: .6 }] },
];
const grading = { criteria: [
    { status: 'scored', decisionSource: 'ai', reviewRequired: false, criterionId: 'criterion-1', selectedLevelId: 'proficient', score: 35, evidence: '뿌리에 가는 털', reason: '관찰 특징이 수준 설명에 부합합니다.', feedback: '관찰 근거가 구체적입니다.', confidence: .92, sourceRefs: [canonicalGradingSourceRef(baseElements[0])], teacherConfirmed: true },
    { status: 'scored', decisionSource: 'ai', reviewRequired: false, criterionId: 'criterion-2', selectedLevelId: 'proficient', score: 35, evidence: '물을 흡수한다', reason: '구조와 기능을 근거로 연결했습니다.', feedback: '다른 기관도 연결해보세요.', confidence: .9, sourceRefs: [canonicalGradingSourceRef(baseElements[1])], teacherConfirmed: true },
    { status: 'scored', decisionSource: 'ai', reviewRequired: false, criterionId: 'criterion-3', selectedLevelId: 'proficient', score: 15, evidence: '관찰 결과', reason: '수정 과정의 근거가 드러납니다.', feedback: '수정 이유를 더 설명해보세요.', confidence: .88, sourceRefs: [canonicalGradingSourceRef(baseElements[2])], teacherConfirmed: true },
], provisionalTotal: 85, totalScore: 85, sourceHash: '', summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명해보세요.', reviewOrigins: [{ criterionId: 'criterion-1', reviewRequired: false }, { criterionId: 'criterion-2', reviewRequired: false }, { criterionId: 'criterion-3', reviewRequired: false }], originToken: 'a'.repeat(64), approvalToken: 'b'.repeat(64) };
grading.reviewOrigins = grading.criteria.map(canonicalGradingOrigin);

function projectFixture() {
    const plan = makeGeneratedPlan();
    const assessment = { ...makeAssessment(), sourceHash: sourceHash(plan), approved: true };
    const extractedText = '관찰 결과 뿌리에 가는 털이 있고 물을 흡수한다.';
    const submission = { id: 's1', studentName: '김학생', extractedText, elements: baseElements, grading: { ...grading }, approved: true };
    submission.grading.sourceHash = gradingSourceHash(assessment, extractedText, baseElements, submission.grading.criteria, submission);
    submission.sourceHash = submission.grading.sourceHash;
    const record = { submissionId: submission.id, sourceHash: recordSourceHash(assessment, submission), status: 'done', text: '현재 근거로 작성한 세특', approved: true };
    return { activeProcess: 'records', lessonSnapshot: { ...generationDraft, generatedFrom: createGenerationSnapshot(generationDraft), plan }, worksheet: null, assessment, submissions: [submission], records: [record] };
}

test('accepts only bounded criterion scores with complete evidence and feedback', () => {
    const assessment = makeAssessment();
    const current = { ...grading, sourceHash: gradingSourceHash(assessment, '', baseElements, grading.criteria) };
    expect(gradingContentIsValid(assessment, current, '', baseElements)).toBe(true);
    expect(gradingContentIsValid(assessment, { ...current, criteria: current.criteria.map((item, index) => index ? item : { ...item, score: 34 }) }, '', baseElements)).toBe(false);
    expect(gradingContentIsValid(assessment, { ...current, criteria: current.criteria.map((item, index) => index ? item : { ...item, evidence: '' }) }, '', baseElements)).toBe(false);
});

test('rejects a grading where two scored criteria share the same evidence element', () => {
    const assessment = makeAssessment();
    const current = { ...grading, sourceHash: gradingSourceHash(assessment, '', baseElements, grading.criteria) };
    const duplicated = { ...current, criteria: current.criteria.map((item, index) => index === 2
        ? { ...item, evidence: current.criteria[0].evidence, sourceRefs: current.criteria[0].sourceRefs }
        : item) };
    expect(gradingContentIsValid(assessment, duplicated, '', baseElements)).toBe(false);
});

test('matches evidence quoted without the OCR line breaks', () => {
    const assessment = makeAssessment();
    const wrappedElements = baseElements.map((element, index) => index === 0 ? { ...element, text: '뿌리에\n가는 털' } : element);
    const criteria = grading.criteria.map((item, index) => index === 0 ? { ...item, sourceRefs: [canonicalGradingSourceRef(wrappedElements[0])] } : item);
    const current = { ...grading, criteria, sourceHash: gradingSourceHash(assessment, '', wrappedElements, criteria) };
    expect(gradingContentIsValid(assessment, current, '', wrappedElements)).toBe(true);
});

test('keeps existing numeric grading consumers compatible with dynamic rubric level arrays', () => {
    const assessment = makeAssessment();

    expect(Array.isArray(assessment.rubric.criteria[0].levels)).toBe(true);
    expect(gradingContentIsValid(assessment, { ...grading, sourceHash: gradingSourceHash(assessment, '', baseElements, grading.criteria) }, '', baseElements)).toBe(true);
});

test('Given a scoreless teacher-review criterion When checking finalization Then no low score is invented and approval stays blocked', () => {
    const assessment = makeAssessment();
    const review = {
        ...grading,
        criteria: grading.criteria.map((item, index) => index ? item : { status: 'teacher_review', reviewRequired: true, criterionId: item.criterionId, selectedLevelId: null, score: null, evidence: item.evidence, reviewReason: '수식 기호 확인 필요', confidence: .6, sourceRefs: item.sourceRefs, teacherConfirmed: false }),
        provisionalTotal: 50,
        totalScore: null,
        sourceHash: gradingSourceHash(assessment, '', baseElements, grading.criteria),
    };

    expect(gradingContentIsValid(assessment, review, '', baseElements)).toBe(true);
    expect(gradingCanBeFinalized(assessment, review, '', baseElements)).toBe(false);
});

test('Given aggregate OCR text is unchanged When a normalized element category or coordinates change Then grading lineage is stale', () => {
    const assessment = makeAssessment();
    const elements = baseElements;
    const extractedText = '관찰 결과 뿌리에 가는 털이 있고 물을 흡수한다.';
    const criteria = grading.criteria.map((criterion, index) => ({ ...criterion, decisionSource: 'ai', reviewRequired: false, sourceRefs: [canonicalGradingSourceRef(elements[index])] }));
    const current = { ...grading, criteria, sourceHash: gradingSourceHash(assessment, extractedText, elements, criteria) };
    const submission = { extractedText, elements, grading: current, sourceHash: current.sourceHash };
    const changed = { ...submission, elements: elements.map(element => element.id === 'e1' ? { ...element, category: 'figure', coordinates: [{ x: .2, y: .2 }, { x: .8, y: .4 }] } : element) };

    expect(gradingIsCurrent(assessment, submission)).toBe(true);
    expect(gradingIsCurrent(assessment, changed)).toBe(false);
});

test('marks grading and records incomplete when the approved rubric changes', () => {
    const project = projectFixture();
    expect(workflowProcessStatuses(project)).toMatchObject({ grading: 'complete', records: 'complete' });
    project.assessment = { ...project.assessment, task: { ...project.assessment.task, title: '바뀐 수행평가' } };
    expect(workflowProcessStatuses(project)).toMatchObject({ grading: 'review', records: 'prerequisite' });
});

test('does not treat a client-only approved flag as final without a server approval token', () => {
    const project = projectFixture();
    delete project.submissions[0].grading.approvalToken;

    expect(submissionIsApprovedFor(project.assessment, project.submissions[0])).toBe(false);
    expect(workflowProcessStatuses(project)).toMatchObject({ grading: 'review', records: 'prerequisite' });
});

test('Given a migrated fixed rubric When calculating process status Then assessment and downstream approvals stay blocked until regeneration', () => {
    const project = projectFixture();
    project.assessment = { ...project.assessment, requiresAssessmentRegeneration: true };

    expect(workflowProcessStatuses(project)).toMatchObject({ assessment: 'review', grading: 'prerequisite', records: 'prerequisite' });
});

test('does not count failed or empty record rows as completed', () => {
    const project = projectFixture();
    project.records[0] = { ...project.records[0], status: 'error', text: '' };
    expect(workflowProcessStatuses(project).records).toBe('review');
});

test('marks the lesson and all downstream stages stale when generation inputs change', () => {
    const project = projectFixture();
    project.lessonSnapshot = { ...project.lessonSnapshot, basics: { ...project.lessonSnapshot.basics, intent: '바뀐 수업 내용' } };
    expect(workflowProcessStatuses(project)).toMatchObject({ lesson: 'review', worksheet: 'review', assessment: 'review', grading: 'prerequisite', records: 'prerequisite' });
});

test('Given a record source When approval lineage reason or process evidence changes Then the record hash changes', () => {
    const project = projectFixture();
    const submission = project.submissions[0];
    const original = recordSourceHash(project.assessment, submission);
    const changedApproval = { ...submission, grading: { ...submission.grading, approvalToken: 'c'.repeat(64) } };
    const changedReason = { ...submission, grading: { ...submission.grading, approvalToken: 'd'.repeat(64), criteria: submission.grading.criteria.map((criterion, index) => index === 0 ? { ...criterion, reason: `${criterion.reason} 수정` } : criterion) } };
    const changedGrowthEvidence = { ...submission, grading: { ...submission.grading, approvalToken: 'e'.repeat(64), criteria: submission.grading.criteria.map(criterion => criterion.criterionId === 'criterion-3' ? { ...criterion, evidence: `${criterion.evidence} 수정` } : criterion) } };

    expect(recordSourceHash(project.assessment, changedApproval)).not.toBe(original);
    expect(recordSourceHash(project.assessment, changedReason)).not.toBe(original);
    expect(recordSourceHash(project.assessment, changedGrowthEvidence)).not.toBe(original);
});
