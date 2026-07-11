import { test, expect } from 'vitest';
import { extractStandards } from '@/lib/curriculum/extract';

test('joins wrapped achievement-standard text and classifies elementary math', () => {
    const source = '### Page 17\n[2수01-01] 수의 필요성을 인식하면서 0과 100까지의 수 개념을 이해하고, 수를 세고 읽고 쓸 수\n있다.\n• [2수01-01] 해설 문장';
    expect(extractStandards(source, { subject: '수학', sourceFile: 'book_08.md' })).toEqual([
        expect.objectContaining({
            code: '2수01-01',
            schoolLevel: 'elementary',
            gradeBand: '1-2',
            subject: '수학',
            text: expect.stringContaining('쓸 수 있다.'),
            sourcePage: 17,
        }),
    ]);
});

test('classifies middle and high school code families', () => {
    const source = '[9수01-01] 중학교 기준이다.\n[10공수1-01-01] 고등학교 기준이다.';
    expect(extractStandards(source, { subject: '수학', sourceFile: 'math.md' }).map(({ schoolLevel, gradeBand }) => ({ schoolLevel, gradeBand }))).toEqual([
        { schoolLevel: 'middle', gradeBand: '7-9' },
        { schoolLevel: 'high', gradeBand: '10-12' },
    ]);
});
