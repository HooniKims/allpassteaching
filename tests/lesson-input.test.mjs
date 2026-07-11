import { test, expect } from 'vitest';
import { createGenerationSnapshot, formatLessonTiming, hasGenerationInputChanged, normalizeLessonMetadata } from '@/lib/lesson-input';
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
