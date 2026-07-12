import { expect, test } from 'vitest';
import { hasUnsupportedGrowthInference, recordOutputSchema } from '@/lib/record-schema';

const text = '관찰한 식물 기관의 특징을 구체적인 문장으로 기록하고, 뿌리의 가는 털과 물 흡수 기능을 연결하여 설명함. 관찰 사실을 근거로 결론을 도출하는 과정이 드러났으며, 다른 기관도 같은 방식으로 비교하려는 학습 방향을 확인함.';

test('accepts an evidence-grounded school-record draft within the requested range', () => {
    expect(recordOutputSchema.safeParse({ text }).success).toBe(true);
});

test('rejects score-list language and text longer than 1000 characters', () => {
    expect(recordOutputSchema.safeParse({ text: `${text} 총점 85점.` }).success).toBe(false);
    expect(recordOutputSchema.safeParse({ text: '가'.repeat(1001) }).success).toBe(false);
});

test('rejects grades score fractions and comparisons with other students', () => {
    expect(recordOutputSchema.safeParse({ text: `${text} 수행 결과는 A등급임.` }).success).toBe(false);
    expect(recordOutputSchema.safeParse({ text: `${text} 평가 결과는 85/100임.` }).success).toBe(false);
    expect(recordOutputSchema.safeParse({ text: `${text} 또래보다 뛰어나며 학급 상위권임.` }).success).toBe(false);
});

test('rejects personality inference words outside approved performance evidence', () => {
    for (const inference of ['친절함', '배려심이 깊음', '리더십이 있음', '끈기가 있음', '협동심이 강함', '자발적으로 행동함', '차분한 태도임', '소극적인 성격임']) {
        expect(recordOutputSchema.safeParse({ text: `${text} ${inference}.` }).success).toBe(false);
    }
});

test('detects unsupported student growth claims without rejecting ordinary subject wording', () => {
    for (const claim of ['이전보다 설명이 정교해짐.', '설명 능력이 높아짐.', '피드백 없이도 표현이 향상하였음.', '근거를 보완하여 설명함.']) {
        expect(hasUnsupportedGrowthInference(claim, false)).toBe(true);
    }
    expect(hasUnsupportedGrowthInference('꾸준히 관찰한 식물의 성장 조건을 설명함.', false)).toBe(false);
    expect(hasUnsupportedGrowthInference('이전보다 설명이 정교해짐.', true)).toBe(false);
});

test('blocks normalized Korean rank score superlative comparison and personality claims', () => {
    const blocked = [
        '반에서 1등임', '반 에서 １ 등임', '학급에서 가장 높은 점수를 받음', '다른 친구들에 비해 뛰어남',
        '친구들 중 가장 우수함', '매우 부지런함', '90퍼센트를 달성함', '백 점 만점에 팔십오 점을 받음', '모범적 태도를 보임',
        '매우 성/실한 태도임', '또래/보다 뛰어남', '책​임감이 있음', '학급에서 1/등임',
        '관찰 태도가 모범적임', '반에서 일 등을 차지함', '전체 학생 가운데 최고임', '교우보다 우월한 결과를 보임',
        '평가에서 구십 프로를 달성함', '수행 결과는 팔십오 점임', '품행이 단정함',
    ];
    for (const phrase of blocked) expect(recordOutputSchema.safeParse({ text: `${text} ${phrase}.` }).success).toBe(false);
    expect(recordOutputSchema.safeParse({ text: `${text} 꾸준히 관찰한 식물의 성장 조건을 설명함.` }).success).toBe(true);
});
