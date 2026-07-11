import { expect, test } from 'vitest';
import { makeAssessment } from './fixtures/workflow.mjs';
import { generationDraft, makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { createGenerationSnapshot } from '@/lib/lesson-input';
import { gradingContentIsValid, gradingSourceHash, recordSourceHash, workflowProcessStatuses } from '@/lib/workflow-lineage';
import { sourceHash } from '@/lib/source-hash';

const grading = { criteria: [
    { criterionId: 'criterion-1', score: 35, evidence: '뿌리에 가는 털', feedback: '관찰 근거가 구체적입니다.' },
    { criterionId: 'criterion-2', score: 50, evidence: '물을 흡수한다', feedback: '구조와 기능을 연결했습니다.' },
], totalScore: 85, summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명해보세요.' };

function projectFixture() {
    const plan = makeGeneratedPlan();
    const assessment = { ...makeAssessment(), sourceHash: sourceHash(plan), approved: true };
    const submission = { id: 's1', studentName: '김학생', extractedText: '뿌리에 가는 털이 있고 물을 흡수한다.', grading, approved: true };
    submission.sourceHash = gradingSourceHash(assessment, submission.extractedText);
    const record = { submissionId: submission.id, sourceHash: recordSourceHash(assessment, submission), status: 'done', text: '현재 근거로 작성한 세특', approved: true };
    return { activeProcess: 'records', lessonSnapshot: { ...generationDraft, generatedFrom: createGenerationSnapshot(generationDraft), plan }, worksheet: null, assessment, submissions: [submission], records: [record] };
}

test('accepts only bounded criterion scores with complete evidence and feedback', () => {
    const assessment = makeAssessment();
    expect(gradingContentIsValid(assessment, grading)).toBe(true);
    expect(gradingContentIsValid(assessment, { ...grading, criteria: grading.criteria.map((item, index) => index ? item : { ...item, score: 99 }) })).toBe(false);
    expect(gradingContentIsValid(assessment, { ...grading, criteria: grading.criteria.map((item, index) => index ? item : { ...item, evidence: '' }) })).toBe(false);
});

test('marks grading and records incomplete when the approved rubric changes', () => {
    const project = projectFixture();
    expect(workflowProcessStatuses(project)).toMatchObject({ grading: 'complete', records: 'complete' });
    project.assessment = { ...project.assessment, task: { ...project.assessment.task, title: '바뀐 수행평가' } };
    expect(workflowProcessStatuses(project)).toMatchObject({ grading: 'review', records: 'prerequisite' });
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
