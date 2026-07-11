export const CUSTOM_SUBJECT_VALUE = '__custom__';

const option = (label, catalogSubjects = [label]) => ({ value: label, label, catalogSubjects });
const directInput = { value: CUSTOM_SUBJECT_VALUE, label: '직접 입력', catalogSubjects: [] };

const elementaryCore = [option('국어'), option('수학')];
const elementaryThreeToSix = [
    option('국어'), option('수학'), option('사회'), option('과학'), option('도덕'),
    option('체육'), option('음악'), option('미술'), option('영어'),
];

const highSchoolGroups = [
    { label: '국어', options: ['공통국어1', '공통국어2', '화법과 언어', '독서와 작문', '문학'].map(label => option(label, ['국어'])) },
    { label: '수학', options: ['공통수학1', '공통수학2', '기본수학1', '기본수학2', '대수', '미적분Ⅰ', '확률과 통계', '미적분Ⅱ', '기하'].map(label => option(label, ['수학'])) },
    { label: '영어', options: ['공통영어1', '공통영어2', '기본영어1', '기본영어2', '영어Ⅰ', '영어Ⅱ', '영어 독해와 작문'].map(label => option(label, ['영어'])) },
    { label: '사회·역사', options: ['한국사1', '한국사2', '통합사회1', '통합사회2', '세계시민과 지리', '세계사', '사회와 문화', '정치', '법과 사회', '경제'].map(label => option(label, ['사회'])) },
    { label: '과학', options: ['통합과학1', '통합과학2', '과학탐구실험1', '과학탐구실험2', '물리학', '화학', '생명과학', '지구과학'].map(label => option(label, ['과학'])) },
    { label: '체육·예술', options: [
        option('체육1', ['체육']), option('체육2', ['체육']), option('운동과 건강', ['체육']),
        option('음악', ['음악']), option('음악 연주와 창작', ['음악']),
        option('미술', ['미술']), option('미술 창작', ['미술']),
    ] },
    { label: '기술·가정·정보·한문', options: [
        option('기술·가정', ['실과·기술가정·정보']), option('정보', ['실과·기술가정·정보']),
        option('인공지능 기초', ['실과·기술가정·정보']), option('데이터 과학', ['실과·기술가정·정보']),
        option('한문', ['한문']), option('한문 고전 읽기', ['한문']),
    ] },
    { label: '교양', options: ['진로와 직업', '생태와 환경', '인간과 철학', '논리와 사고', '인간과 심리', '교육의 이해', '삶과 종교', '보건', '인간과 경제활동', '논술'].map(label => option(label, ['고등학교 교양 교'])) },
    { label: '기타', options: [directInput] },
];

export function subjectGroupsFor(schoolLevel, grade) {
    if (schoolLevel === 'elementary') {
        const numericGrade = Number(grade);
        let options = elementaryCore;
        if (numericGrade <= 2) options = [...elementaryCore,
            option('바른 생활', ['통합교과']), option('슬기로운 생활', ['통합교과']), option('즐거운 생활', ['통합교과'])];
        if (numericGrade >= 3) options = [...elementaryThreeToSix];
        if (numericGrade >= 5) options.push(option('실과', ['실과·기술가정·정보']));
        return [{ label: '교과', options }, { label: '기타', options: [directInput] }];
    }
    if (schoolLevel === 'middle') return [
        { label: '공통 교과', options: [
            option('국어'), option('수학'), option('사회'), option('역사', ['사회']), option('과학'), option('도덕'),
            option('기술·가정', ['실과·기술가정·정보']), option('정보', ['실과·기술가정·정보']),
            option('체육'), option('음악'), option('미술'), option('영어'),
        ] },
        { label: '선택과목', options: [
            option('한문'), option('환경', ['중학교 선택 교']), option('보건', ['중학교 선택 교']), option('진로와 직업', ['중학교 선택 교']),
        ] },
        { label: '기타', options: [directInput] },
    ];
    if (schoolLevel === 'high') return highSchoolGroups;
    return [];
}

export function catalogSubjectsFor(schoolLevel, grade, value) {
    return subjectGroupsFor(schoolLevel, grade)
        .flatMap(group => group.options)
        .find(item => item.value === value)?.catalogSubjects ?? [];
}
