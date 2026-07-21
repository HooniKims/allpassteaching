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

test('중학교 사회와 역사를 같은 원천 교과 안에서 영역으로 분리한다', () => {
    // Given
    const middleSocial = [
        { code: '9사(지리)01-01', subject: '사회', subjectArea: '지리', schoolLevel: 'middle', gradeBand: '7-9', text: '위치를 표현한다.' },
        { code: '9사(일사)08-01', subject: '사회', subjectArea: '일반사회', schoolLevel: 'middle', gradeBand: '7-9', text: '인권을 탐구한다.' },
        { code: '9역01-01', subject: '사회', subjectArea: '역사', schoolLevel: 'middle', gradeBand: '7-9', text: '역사 자료를 탐구한다.' },
    ];

    // When
    const social = searchStandards(middleSocial, { schoolLevel: 'middle', gradeBand: '7-9', subjects: ['사회'], subjectAreas: ['지리', '일반사회'], query: '' }, 100);
    const history = searchStandards(middleSocial, { schoolLevel: 'middle', gradeBand: '7-9', subjects: ['사회'], subjectAreas: ['역사'], query: '' }, 100);

    // Then
    expect(social.map(item => item.code)).toEqual(['9사(일사)08-01', '9사(지리)01-01']);
    expect(history.map(item => item.code)).toEqual(['9역01-01']);
});
