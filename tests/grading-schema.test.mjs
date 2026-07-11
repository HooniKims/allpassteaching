import { expect, test } from 'vitest';
import { gradingOutputSchema } from '@/lib/grading-schema';

const output = { criteria: [
    { criterionId: 'criterion-1', score: 35, evidence: '뿌리에 가는 털이 있다', feedback: '관찰 근거가 구체적입니다.' },
    { criterionId: 'criterion-2', score: 50, evidence: '뿌리는 물을 흡수한다', feedback: '구조와 기능을 연결했습니다.' },
], summary: '관찰 사실을 기능 설명에 활용했습니다.', nextSteps: '다른 기관도 같은 방식으로 설명해보세요.' };

test('accepts criterion-level scores with evidence and feedback', () => {
    expect(gradingOutputSchema.safeParse(output).success).toBe(true);
});

test('rejects empty evidence', () => {
    const invalid = structuredClone(output); invalid.criteria[0].evidence = '';
    expect(gradingOutputSchema.safeParse(invalid).success).toBe(false);
});
