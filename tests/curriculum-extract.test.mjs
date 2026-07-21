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

test('괄호가 있는 중학교 사회 코드를 교과 내 영역과 함께 추출한다', () => {
    // Given
    const source = '### Page 23\n[9사(지리)01-01] 다양한 지도와 지리 정보 기술을 활용하여 위치를 표현한다.\n[9사(일사)08-01] 인권의 의미와 기본권의 내용을 탐구한다.';

    // When
    const records = extractStandards(source, { subject: '사회', sourceFile: 'social.md' });

    // Then
    expect(records.map(({ code, subjectArea }) => ({ code, subjectArea }))).toEqual([
        { code: '9사(지리)01-01', subjectArea: '지리' },
        { code: '9사(일사)08-01', subjectArea: '일반사회' },
    ]);
});
