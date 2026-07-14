import { test, expect } from 'vitest';
import { buildLessonPlanGenerationRequest, createGenerationSnapshot, formatLessonTiming, hasGenerationInputChanged, normalizeLessonMetadata } from '@/lib/lesson-input';
import { generationDraft } from './fixtures/lesson-plan.mjs';

test('normalizes a legacy datetime without inventing a lesson period', () => {
    expect(normalizeLessonMetadata({ date: '2026-07-11T09:00' })).toEqual({
        date: '2026-07-11',
        period: '',
        place: '',
        className: '',
        teacherName: '',
    });
});

test('formats a date and period without an ISO separator or clock time', () => {
    const value = formatLessonTiming({ date: '2026-07-11', period: '3' });

    expect(value).toBe('2026. 7. 11. / 3교시');
    expect(value).not.toContain('T');
    expect(value).not.toMatch(/\d{2}:\d{2}/);
});

test('formats an already suffixed lesson period only once', () => {
    expect(normalizeLessonMetadata({ period: '3교시' }).period).toBe('3');
    expect(formatLessonTiming({ date: '2026-07-11', period: '3교시' })).toBe('2026. 7. 11. / 3교시');
});

test('keeps blank timing fields blank', () => {
    expect(formatLessonTiming({ date: '', period: '' })).toBe('');
});

test('ignores transient UI errors but detects generation input changes', () => {
    const snapshot = createGenerationSnapshot(generationDraft);
    const errorOnly = { ...generationDraft, basics: { ...generationDraft.basics, error: '필수 정보를 확인해주세요' } };
    const changedIntent = { ...generationDraft, basics: { ...generationDraft.basics, intent: '수정한 수업 의도' } };

    expect(hasGenerationInputChanged(errorOnly, snapshot)).toBe(false);
    expect(hasGenerationInputChanged(changedIntent, snapshot)).toBe(true);
});

test('treats reordered subject mappings and standards as the same generation input', () => {
    const draft = {
        ...generationDraft,
        basics: { ...generationDraft.basics, mappedSubjects: ['과학', '사회'] },
        standards: [...generationDraft.standards, { code: '6사02-01', text: '기후변화의 영향을 이해한다.' }],
    };
    const reordered = {
        ...draft,
        basics: { ...draft.basics, mappedSubjects: ['사회', '과학'] },
        standards: [...draft.standards].reverse(),
    };

    expect(hasGenerationInputChanged(reordered, createGenerationSnapshot(draft))).toBe(false);
});

test('융합 생성 요청은 표시 과목명과 교육과정 원본 과목명이 달라도 교과별 기준을 일관되게 정규화한다', () => {
    const request = buildLessonPlanGenerationRequest({
        basics: { ...generationDraft.basics, schoolLevel: 'high', grade: '1', subject: '통합과학1', displaySubject: '통합과학1', mappedSubjects: ['과학'] },
        standards: [{ code: '10통과1-01-01', text: '과학의 기초를 탐구한다.', subject: '과학' }],
        instructionModel: {
            id: 'integrated', name: '융합수업', stages: ['공통 맥락·문제', '교과 관점 탐구', '관점 통합', '적용·성찰'],
            integrationSubject: '공통수학1',
            integrationStandards: [{ code: '10공수1-01-01', text: '다항식의 사칙연산을 할 수 있다.', subject: '수학' }],
        },
    });

    expect(request.integration.primaryStandards[0].subject).toBe('통합과학1');
    expect(request.integration.secondaryStandards[0].subject).toBe('공통수학1');
    expect(request.standards.map(item => item.subject)).toEqual(['통합과학1', '공통수학1']);
});
