import { expect, test } from 'vitest';
import {
    ASSESSMENT_COLUMNS,
    PROCESS_COLUMNS,
    buildDocumentModel,
} from '@/lib/export/document-model';
import { makeGeneratedPlan, makeTwoSessionPlan } from './fixtures/lesson-plan.mjs';

const overviewLabels = [
    '일시',
    '장소',
    '대상 학급',
    '수업자',
    '학교급·학년',
    '과목',
    '단원/주제',
    '차시',
    '수업 모형',
    '성취기준',
    '학습 목표',
    '핵심 질문',
    '준비물',
];

test('두 차시 계획을 차시별 독립 문서와 페이지 나눔으로 만든다', () => {
    // Given
    const plan = makeTwoSessionPlan();

    // When
    const document = buildDocumentModel(plan);

    // Then
    expect(document.title).toBe('교수·학습 과정안');
    expect(document.sessions).toHaveLength(2);
    expect(document.sessions[0]).toMatchObject({
        pageBreakBefore: false,
        metadata: plan.metadata,
        order: 1,
        title: '식물 기관 관찰',
        sessionMinutes: 40,
    });
    expect(document.sessions[1]).toMatchObject({
        pageBreakBefore: true,
        order: 2,
        title: '식물 기관의 기능 설명',
        sessionMinutes: 40,
    });
});

test('개요 표의 항목 순서와 성취기준 코드·원문을 보존한다', () => {
    // Given
    const plan = makeGeneratedPlan();

    // When
    const [session] = buildDocumentModel(plan).sessions;

    // Then
    expect(session.overview.rows.map(row => row.label)).toEqual(overviewLabels);
    expect(session.overview.rows.find(row => row.key === 'standards').value).toEqual([
        {
            code: '6과11-02',
            text: '식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.',
        },
    ]);
    expect(session.overview.rows.find(row => row.key === 'session').value).toBe('1/1');
});

test('과정 표의 열 계약과 발문·예상 반응·지원 내용을 구조적으로 보존한다', () => {
    // Given
    const plan = makeGeneratedPlan();

    // When
    const process = buildDocumentModel(plan).sessions[0].process;

    // Then
    expect(PROCESS_COLUMNS.map(column => column.key)).toEqual([
        'phase',
        'learningElement',
        'teacherActivity',
        'studentActivity',
        'minutes',
        'notes',
    ]);
    expect(PROCESS_COLUMNS.map(column => column.label)).toEqual([
        '단계',
        '학습 요소',
        '교사 활동',
        '학생 활동',
        '시간',
        '자료·유의점',
    ]);
    expect(process.columns).toEqual(PROCESS_COLUMNS);
    expect(process.rows[1]).toMatchObject({
        phase: '전개',
        learningElement: '식물 기관 관찰',
        teacherActivity: [
            { label: '교사 활동', items: ['관찰을 안내한다.'] },
            { label: '주요 발문', items: ['관찰한 구조에서 어떤 특징을 찾았나요?'] },
        ],
        studentActivity: [
            { label: '학생 활동', items: ['관찰하고 기록한다.'] },
            { label: '예상 학생 반응', items: ['뿌리에는 가는 털이 있습니다.'] },
        ],
        notes: [
            { label: '자료·유의점', items: ['안전하게 다룬다.'] },
            { label: '지원', items: ['관찰 문장 틀을 제공한다.'] },
        ],
        minutes: 30,
    });
});

test('평가 표의 네 열과 세 수준별 피드백을 보존한다', () => {
    // Given
    const plan = makeGeneratedPlan();

    // When
    const assessment = buildDocumentModel(plan).sessions[0].assessment;

    // Then
    expect(ASSESSMENT_COLUMNS).toEqual([
        { key: 'element', label: '평가 요소' },
        { key: 'method', label: '평가 방법' },
        { key: 'evidence', label: '관찰 증거' },
        { key: 'levelFeedback', label: '수준별 피드백' },
    ]);
    expect(assessment.columns).toEqual(ASSESSMENT_COLUMNS);
    expect(assessment.rows[0]).toEqual({
        element: '관찰 결과 설명',
        method: '관찰 및 산출물 확인',
        evidence: '관찰 기록지',
        levelFeedback: [
            { key: 'needsSupport', label: '도움 필요', text: '관찰 문장 틀로 구조를 설명하도록 돕는다.' },
            { key: 'meets', label: '기준 도달', text: '구조와 기능을 연결해 설명하도록 한다.' },
            { key: 'exceeds', label: '기준 초과', text: '여러 기관을 비교해 설명하도록 한다.' },
        ],
    });
});

test('차시별 과정·평가 열 정의는 서로와 내보낸 상수의 참조를 공유하지 않는다', () => {
    // Given
    const document = buildDocumentModel(makeTwoSessionPlan());
    const [firstSession, secondSession] = document.sessions;

    // When
    firstSession.process.columns[0].label = '변경된 단계';
    firstSession.assessment.columns[0].label = '변경된 평가 요소';

    // Then
    expect(firstSession.process.columns).not.toBe(secondSession.process.columns);
    expect(firstSession.process.columns[0]).not.toBe(secondSession.process.columns[0]);
    expect(secondSession.process.columns[0].label).toBe('단계');
    expect(PROCESS_COLUMNS[0].label).toBe('단계');
    expect(firstSession.assessment.columns).not.toBe(secondSession.assessment.columns);
    expect(firstSession.assessment.columns[0]).not.toBe(secondSession.assessment.columns[0]);
    expect(secondSession.assessment.columns[0].label).toBe('평가 요소');
    expect(ASSESSMENT_COLUMNS[0].label).toBe('평가 요소');
});

test('선택 행정 정보가 비어 있어도 개요 표에 빈 값으로 남긴다', () => {
    // Given
    const plan = makeGeneratedPlan();

    // When
    const rows = buildDocumentModel(plan).sessions[0].overview.rows;

    // Then
    expect(rows.slice(0, 4).map(row => row.value)).toEqual(['', '', '', '']);
});

test('입력을 변경하지 않고 결과의 중첩 참조를 입력과 분리한다', () => {
    // Given
    const plan = makeGeneratedPlan();
    const original = structuredClone(plan);

    // When
    const document = buildDocumentModel(plan);
    const standards = document.sessions[0].overview.rows.find(row => row.key === 'standards').value;
    standards[0].text = '문서 모델에서 변경';
    document.sessions[0].metadata.place = '문서 모델 장소';
    document.sessions[0].process.rows[0].teacherActivity[0].items.push('문서 모델 활동');
    document.sessions[0].assessment.rows[0].levelFeedback[0].text = '문서 모델 피드백';
    document.sessions[0].supportStrategies.push('문서 모델 지원');

    // Then
    expect(plan).toEqual(original);
    expect(document.sessions[0].metadata).not.toBe(plan.metadata);
});
