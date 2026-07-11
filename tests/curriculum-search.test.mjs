import { test, expect } from 'vitest';
import { searchStandards } from '@/lib/curriculum/search';
import catalog from '@/data/curriculum.json';

test('never returns another school level, grade band, or subject', () => {
    const results = searchStandards(catalog, { schoolLevel: 'elementary', gradeBand: '5-6', subject: '과학', query: '식물 성장 조건' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(item => item.schoolLevel === 'elementary' && item.gradeBand === '5-6' && item.subject === '과학')).toBe(true);
});
