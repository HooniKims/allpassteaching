import { expect, test } from 'vitest';
import { assessmentRequestSchema, createDefaultAssessmentRequest } from '@/lib/assessment-request';

const validRequest = () => ({ ...createDefaultAssessmentRequest(), assessmentName: '탐구 보고서', teacherIntent: { desiredResult: '관찰 근거로 설명한다.', evidenceOfSuccess: '', growthProcess: '' } });

test('rejects a total score that cannot create two distinct level-score ladders', () => {
    const result = assessmentRequestSchema.safeParse({ ...validRequest(), totalPoints: 5, levelCount: 4 });

    expect(result.success).toBe(false);
    expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['totalPoints'] })]));
});

test('rejects a process ratio that leaves too few points for an outcome or process ladder', () => {
    const result = assessmentRequestSchema.safeParse({ ...validRequest(), totalPoints: 10, levelCount: 4, includeProcessInScore: true, processWeightPercent: 80 });

    expect(result.success).toBe(false);
    expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['processWeightPercent'] })]));
});

test('accepts a six-point total for two four-level outcome criteria', () => {
    const result = assessmentRequestSchema.safeParse({ ...validRequest(), totalPoints: 6, levelCount: 4, includeProcessInScore: false, processWeightPercent: 0 });

    expect(result.success).toBe(true);
});

test('accepts the default score and process setting for a four-level rubric', () => {
    expect(assessmentRequestSchema.safeParse(validRequest()).success).toBe(true);
});
