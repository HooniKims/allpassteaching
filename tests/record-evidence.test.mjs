import { expect, test } from 'vitest';
import { makeAssessment } from './fixtures/workflow.mjs';
import { recordEvidenceBundle } from '@/lib/record-evidence.js';

const gradingCriterion = (criterionId, evidence, reason, feedback) => ({
    status: 'scored', criterionId, evidence, reason, feedback, teacherConfirmed: true,
});
const revisionEvidence = {
    checkpointId: 'checkpoint-2', beforeEvidence: '수정 전 설명', beforeSourceRef: { elementId: 'before' },
    afterEvidence: '수정 후 설명', afterSourceRef: { elementId: 'after' }, changeReason: '피드백을 반영한 이유', teacherConfirmed: true,
};

test('Given approved grading When building record evidence Then it exposes standards task reasons and only actual process evidence', () => {
    const assessment = makeAssessment();
    const submission = { grading: { criteria: [
        gradingCriterion('criterion-1', '뿌리의 가는 털을 관찰함', '관찰 사실을 구체적으로 기록함', '다른 기관도 비교해보세요.'),
        { ...gradingCriterion('criterion-3', '피드백 뒤 수정한 문장을 표시함', '수정 전후와 수정 이유가 확인됨', '근거 선택 이유를 더 분명히 쓰세요.'), revisionEvidence },
    ] } };

    const evidence = recordEvidenceBundle(assessment, submission);

    expect(evidence.standards).toEqual(assessment.task.standards);
    expect(evidence.performanceTask.title).toBe(assessment.task.title);
    expect(evidence.criteria[0]).toMatchObject({ name: '관찰 근거', reason: '관찰 사실을 구체적으로 기록함' });
    expect(evidence.growthEvidence).toEqual([{
        criterionId: 'criterion-3', name: '피드백 반영과 수정', evidence: '피드백 뒤 수정한 문장을 표시함', reason: '수정 전후와 수정 이유가 확인됨', feedback: '근거 선택 이유를 더 분명히 쓰세요.', revisionEvidence,
    }]);
});

test('Given only a desired growth process When building record evidence Then it does not present the teacher intention as student growth', () => {
    const assessment = makeAssessment();
    const submission = { grading: { criteria: [gradingCriterion('criterion-1', '관찰함', '관찰이 확인됨', '비교해보세요.')] } };

    expect(recordEvidenceBundle(assessment, submission).growthEvidence).toEqual([]);
});

test('Given a process criterion without revision evidence When building record evidence Then it does not infer growth from participation alone', () => {
    const assessment = makeAssessment();
    assessment.rubric.criteria[2] = {
        ...assessment.rubric.criteria[2], name: '수행 계획 제출', description: '수행 계획서를 제출한다.', evidence: '수행 계획서',
    };
    const submission = { grading: { criteria: [
        gradingCriterion('criterion-3', '수행 계획서를 제출함', '정해진 양식에 계획을 작성함', '계획을 실행해보세요.'),
    ] } };

    expect(recordEvidenceBundle(assessment, submission).growthEvidence).toEqual([]);
});

test('Given only a proposed revision When building evidence Then it is not treated as a completed student revision', () => {
    const assessment = makeAssessment();
    const submission = { grading: { criteria: [
        gradingCriterion('criterion-3', '설명의 수정 방안을 제안함', '고칠 내용을 계획함', '제안대로 수정해보세요.'),
    ] } };

    expect(recordEvidenceBundle(assessment, submission).growthEvidence).toEqual([]);
});

test('Given a subject-matter growth observation When building record evidence Then it does not confuse plant growth with student revision', () => {
    const assessment = makeAssessment();
    assessment.rubric.criteria[2] = {
        ...assessment.rubric.criteria[2], name: '식물 성장 변화 관찰', description: '식물의 성장 변화를 관찰한다.', evidence: '식물 성장 변화 관찰 일지',
    };
    const submission = { grading: { criteria: [
        gradingCriterion('criterion-3', '식물 성장 변화를 날짜별로 기록함', '식물의 변화가 관찰됨', '관찰 기간을 늘려보세요.'),
    ] } };

    expect(recordEvidenceBundle(assessment, submission).growthEvidence).toEqual([]);
});

test('Given unconfirmed or teacher-review criteria When building evidence Then they are never exposed to record generation', () => {
    const assessment = makeAssessment();
    const unconfirmed = { ...gradingCriterion('criterion-1', '미확인 관찰', '확인 전 판단', '확인 필요'), teacherConfirmed: false };
    const teacherReview = { ...gradingCriterion('criterion-3', '수정본', '수정 전후', '확인 필요'), status: 'teacher_review' };

    const evidence = recordEvidenceBundle(assessment, { grading: { criteria: [unconfirmed, teacherReview] } });

    expect(evidence.criteria).toEqual([]);
    expect(evidence.growthEvidence).toEqual([]);
});
