import { test, expect } from 'vitest';
import { searchStandards } from '@/lib/curriculum/search';
import catalog from '@/data/curriculum.json';

test('never returns another school level, grade band, or subject', () => {
    const results = searchStandards(catalog, { schoolLevel: 'elementary', gradeBand: '5-6', subject: '과학', query: '식물 성장 조건' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(item => item.schoolLevel === 'elementary' && item.gradeBand === '5-6' && item.subject === '과학')).toBe(true);
});

test('searches the union of confirmed official subjects without leaving their scope', () => {
    const results = searchStandards(catalog, { schoolLevel: 'elementary', gradeBand: '5-6', subjects: ['과학', '사회'], query: '환경' });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every(item => item.schoolLevel === 'elementary' && item.gradeBand === '5-6' && ['과학', '사회'].includes(item.subject))).toBe(true);
});

test('성취기준 코드로 검색하면 해당 기준을 가장 먼저 보여준다', () => {
    const results = searchStandards(catalog, { schoolLevel: 'elementary', gradeBand: '5-6', subject: '수학', query: '6수04-02' });

    expect(results[0].code).toBe('6수04-02');
});
