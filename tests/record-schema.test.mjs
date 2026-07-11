import { expect, test } from 'vitest';
import { recordOutputSchema } from '@/lib/record-schema';

const text = '관찰한 식물 기관의 특징을 구체적인 문장으로 기록하고, 뿌리의 가는 털과 물 흡수 기능을 연결하여 설명함. 관찰 사실을 근거로 결론을 도출하는 과정이 드러났으며, 다른 기관도 같은 방식으로 비교하려는 학습 방향을 확인함.';

test('accepts an evidence-grounded school-record draft within the requested range', () => {
    expect(recordOutputSchema.safeParse({ text }).success).toBe(true);
});

test('rejects score-list language and text longer than 1000 characters', () => {
    expect(recordOutputSchema.safeParse({ text: `${text} 총점 85점.` }).success).toBe(false);
    expect(recordOutputSchema.safeParse({ text: '가'.repeat(1001) }).success).toBe(false);
});
