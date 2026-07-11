import { describe, expect, test } from 'vitest';
import { CUSTOM_SUBJECT_VALUE, catalogSubjectsFor, subjectGroupsFor } from '@/lib/subject-options';

function labelsFor(schoolLevel, grade) {
    return subjectGroupsFor(schoolLevel, grade).flatMap(group => group.options.map(option => option.label));
}

describe('학교급·학년별 과목 선택', () => {
    test('초등 1–2학년에는 통합교과의 실제 과목명을 제공한다', () => {
        const labels = labelsFor('elementary', '2');

        expect(labels).toEqual(['국어', '수학', '바른 생활', '슬기로운 생활', '즐거운 생활', '직접 입력']);
        expect(catalogSubjectsFor('elementary', '2', '바른 생활')).toEqual(['통합교과']);
    });

    test('초등 실과는 5–6학년에서만 제공한다', () => {
        expect(labelsFor('elementary', '4')).not.toContain('실과');
        expect(labelsFor('elementary', '5')).toContain('실과');
        expect(catalogSubjectsFor('elementary', '5', '실과')).toEqual(['실과·기술가정·정보']);
    });

    test('중학교는 실과 없이 기술·가정과 정보를 분리하고 실제 선택과목을 제공한다', () => {
        const groups = subjectGroupsFor('middle', '1');
        const labels = labelsFor('middle', '1');

        expect(labels).not.toContain('실과');
        expect(labels).not.toContain('중학교 선택');
        expect(labels).toEqual(expect.arrayContaining(['기술·가정', '정보', '한문', '환경', '보건', '진로와 직업']));
        expect(groups.find(group => group.label === '선택과목').options.map(option => option.label)).toEqual(['한문', '환경', '보건', '진로와 직업']);
        expect(catalogSubjectsFor('middle', '1', '정보')).toEqual(['실과·기술가정·정보']);
        expect(catalogSubjectsFor('middle', '1', '환경')).toEqual(['중학교 선택 교']);
    });

    test('일반고는 교과 영역별 optgroup과 구체적인 과목을 제공한다', () => {
        const groups = subjectGroupsFor('high', '1');

        expect(groups.map(group => group.label)).toEqual([
            '국어', '수학', '영어', '사회·역사', '과학', '체육·예술', '기술·가정·정보·한문', '교양', '기타',
        ]);
        expect(labelsFor('high', '1')).toEqual(expect.arrayContaining(['공통국어1', '미적분Ⅱ', '과학탐구실험2', '인공지능 기초', '생태와 환경']));
        expect(catalogSubjectsFor('high', '1', '공통국어1')).toEqual(['국어']);
        expect(catalogSubjectsFor('high', '1', '생태와 환경')).toEqual(['고등학교 교양 교']);
    });

    test('직접 입력은 모든 목록의 마지막 단일 선택지다', () => {
        for (const [schoolLevel, grade] of [['elementary', '6'], ['middle', '3'], ['high', '2']]) {
            const groups = subjectGroupsFor(schoolLevel, grade);
            const finalOption = groups.at(-1).options.at(-1);

            expect(finalOption).toEqual({ value: CUSTOM_SUBJECT_VALUE, label: '직접 입력', catalogSubjects: [] });
            expect(labelsFor(schoolLevel, grade).filter(label => label === '직접 입력')).toHaveLength(1);
        }
    });
});
