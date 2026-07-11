import { test, expect } from 'vitest';
import catalog from '@/data/curriculum.json';
import { filterSubjectMappings, officialSubjects } from '@/lib/subject-mapping';

test('derives a unique official subject allow-list for one school level', () => {
    const subjects = officialSubjects(catalog, 'elementary');

    expect(subjects).toContain('과학');
    expect(new Set(subjects).size).toBe(subjects.length);
    expect(subjects).not.toContain('교양');
});

test('removes AI subject mappings outside the requested school level allow-list', () => {
    const mappings = filterSubjectMappings(catalog, 'elementary', [
        { subject: '과학', score: 94, reason: '환경 탐구와 연결됩니다.' },
        { subject: '교양', score: 99, reason: '초등학교 범위 밖입니다.' },
    ]);

    expect(mappings).toEqual([{ subject: '과학', score: 94, reason: '환경 탐구와 연결됩니다.' }]);
});
