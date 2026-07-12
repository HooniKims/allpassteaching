import { expect, test } from 'vitest';
import { makeAssessment } from './fixtures/workflow.mjs';
import { generationDraft, makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { createGenerationSnapshot } from '@/lib/lesson-input';
import { gradingCanBeFinalized, gradingContentIsValid, gradingSourceHash, recordSourceHash, workflowProcessStatuses } from '@/lib/workflow-lineage';
import { sourceHash } from '@/lib/source-hash';

const grading = { criteria: [
    { status: 'scored', criterionId: 'criterion-1', selectedLevelId: 'proficient', score: 35, evidence: '뿌리에 가는 털', reason: '관찰 특징이 수준 설명에 부합합니다.', feedback: '관찰 근거가 구체적입니다.', confidence: .92, sourceRefs: [{ elementId: 'e1', page: 1 }], teacherConfirmed: true },
    { status: 'scored', criterionId: 'criterion-2', selectedLevelId: 'proficient', score: 35, evidence: '물을 흡수한다', reason: '구조와 기능을 근거로 연결했습니다.', feedback: '다른 기관도 연결해보세요.', confidence: .9, sourceRefs: [{ elementId: 'e2', page: 1 }], teacherConfirmed: true },
    { status: 'scored', criterionId: 'criterion-3', selectedLevelId: 'proficient', score: 15, evidence: '관찰 결과', reason: '수정 과정의 근거가 드러납니다.', feedback: '수정 이유를 더 설명해보세요.', confidence: .88, sourceRefs: [{ elementId: 'e3', page: 1 }], teacherConfirmed: true },
], provisionalTotal: 85, totalScore: 85, sourceHash: '', summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명해보세요.' };

function projectFixture() {
    const plan = makeGeneratedPlan();
    const assessment = { ...makeAssessment(), sourceHash: sourceHash(plan), approved: true };
    const extractedText = '관찰 결과 뿌리에 가는 털이 있고 물을 흡수한다.';
    const currentGrading = { ...grading, sourceHash: gradingSourceHash(assessment, extractedText) };
    const submission = { id: 's1', studentName: '김학생', extractedText, grading: currentGrading, approved: true };
    submission.sourceHash = gradingSourceHash(assessment, submission.extractedText);
    const record = { submissionId: submission.id, sourceHash: recordSourceHash(assessment, submission), status: 'done', text: '현재 근거로 작성한 세특', approved: true };
    return { activeProcess: 'records', lessonSnapshot: { ...generationDraft, generatedFrom: createGenerationSnapshot(generationDraft), plan }, worksheet: null, assessment, submissions: [submission], records: [record] };
}

test('accepts only bounded criterion scores with complete evidence and feedback', () => {
    const assessment = makeAssessment();
    const current = { ...grading, sourceHash: gradingSourceHash(assessment, '') };
    expect(gradingContentIsValid(assessment, current)).toBe(true);
    expect(gradingContentIsValid(assessment, { ...current, criteria: current.criteria.map((item, index) => index ? item : { ...item, score: 34 }) })).toBe(false);
    expect(gradingContentIsValid(assessment, { ...current, criteria: current.criteria.map((item, index) => index ? item : { ...item, evidence: '' }) })).toBe(false);
});

test('keeps existing numeric grading consumers compatible with dynamic rubric level arrays', () => {
    const assessment = makeAssessment();

    expect(Array.isArray(assessment.rubric.criteria[0].levels)).toBe(true);
    expect(gradingContentIsValid(assessment, { ...grading, sourceHash: gradingSourceHash(assessment, '') })).toBe(true);
});

test('Given a scoreless teacher-review criterion When checking finalization Then no low score is invented and approval stays blocked', () => {
    const assessment = makeAssessment();
    const review = {
        ...grading,
        criteria: grading.criteria.map((item, index) => index ? item : { status: 'teacher_review', criterionId: item.criterionId, selectedLevelId: null, score: null, evidence: item.evidence, reviewReason: '수식 기호 확인 필요', confidence: .6, sourceRefs: item.sourceRefs, teacherConfirmed: false }),
        provisionalTotal: 50,
        totalScore: null,
        sourceHash: gradingSourceHash(assessment, ''),
    };

    expect(gradingContentIsValid(assessment, review)).toBe(true);
    expect(gradingCanBeFinalized(assessment, review)).toBe(false);
});

test('marks grading and records incomplete when the approved rubric changes', () => {
    const project = projectFixture();
    expect(workflowProcessStatuses(project)).toMatchObject({ grading: 'complete', records: 'complete' });
    project.assessment = { ...project.assessment, task: { ...project.assessment.task, title: '바뀐 수행평가' } };
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
