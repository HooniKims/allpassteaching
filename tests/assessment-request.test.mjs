import { expect, test } from 'vitest';
import { assessmentRequestForLesson, assessmentRequestSchema, createDefaultAssessmentRequest } from '@/lib/assessment-request';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

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

test('지도안에서 빈 평가 이름과 교사 질문을 자동 완성한다', () => {
    const result = assessmentRequestForLesson(makeGeneratedPlan(), createDefaultAssessmentRequest());

    expect(result.assessmentName).toContain('수행평가');
    expect(result.teacherIntent.desiredResult).not.toBe('');
    expect(result.teacherIntent.evidenceOfSuccess).not.toBe('');
    expect(assessmentRequestSchema.safeParse(result).success).toBe(true);
});
