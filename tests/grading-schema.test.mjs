import { expect, test } from 'vitest';
import { gradingOutputSchema, storedGradingSchema } from '@/lib/grading-schema';

const sourceRef = { elementId: 'element-1', page: 2, text: '뿌리에 가는 털이 있다', coordinates: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.3 }] };
const scored = {
    status: 'scored', criterionId: 'criterion-1', selectedLevelId: 'proficient', score: 35,
    evidence: '뿌리에 가는 털이 있다', reason: '관찰 사실을 제시했으나 다른 기관과의 비교 증거는 없다.',
    feedback: '다른 기관과 비교해 설명해보세요.', confidence: 0.82, sourceRefs: [sourceRef], teacherConfirmed: false,
};
const teacherReview = {
    status: 'teacher_review', criterionId: 'criterion-2', selectedLevelId: null, score: null,
    evidence: 'x² = 4', reviewReason: '수식의 핵심 기호를 원본에서 확인해야 합니다.', confidence: 0.61,
    sourceRefs: [{ ...sourceRef, elementId: 'element-2', text: 'x² = 4' }], teacherConfirmed: false,
};
const output = { criteria: [scored, teacherReview], summary: '관찰 근거를 활용했습니다.', nextSteps: '수식 기호를 원본과 대조해보세요.' };

test('Given verified and uncertain evidence When grading output is parsed Then the scored-or-teacher-review union is accepted', () => {
    expect(gradingOutputSchema.safeParse(output).success).toBe(true);
});

test('Given teacher review evidence When a numeric score is supplied Then the impossible uncertainty score is rejected', () => {
    const invalid = structuredClone(output);
    invalid.criteria[1].score = 0;

    expect(gradingOutputSchema.safeParse(invalid).success).toBe(false);
});

test('Given a scored criterion When its reason is missing Then the result is rejected', () => {
    const invalid = structuredClone(output);
    delete invalid.criteria[0].reason;

    expect(gradingOutputSchema.safeParse(invalid).success).toBe(false);
});

test('Given unresolved grading When stored Then provisional total is allowed but final total remains null', () => {
    const stored = { ...output, provisionalTotal: 35, totalScore: null, sourceHash: 'src-current' };

    expect(storedGradingSchema.safeParse(stored).success).toBe(true);
});
