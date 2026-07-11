import { expect, test } from 'vitest';
import { formatLessonPlanIssue } from '@/lib/lesson-plan-issues.js';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

test('formats the third stage question in the tenth session with its exact control label', () => {
    // Given
    const plan = makeGeneratedPlan();
    plan.sessions = Array.from({ length: 10 }, (_, index) => {
        const session = structuredClone(plan.sessions[0]);
        session.id = `session-${index + 1}`;
        session.order = index + 1;
        return session;
    });
    const issue = {
        code: 'too_small',
        origin: 'array',
        minimum: 1,
        path: ['sessions', 9, 'stages', 2, 'teacherQuestions'],
        message: 'Too small: expected array to have >=1 items',
    };

    // When
    const formatted = formatLessonPlanIssue(issue, plan);

    // Then
    expect(formatted).toEqual({
        label: '10차시 정리 주요 발문',
        message: '10차시 정리 주요 발문: 내용을 입력해주세요.',
    });
});

test('formats assessment level feedback with its exact control label', () => {
    // Given
    const plan = makeGeneratedPlan();
    plan.assessment.push(structuredClone(plan.assessment[0]));
    const issue = {
        code: 'too_small',
        origin: 'string',
        minimum: 1,
        path: ['assessment', 1, 'levelFeedback', 'meets'],
        message: 'Too small: expected string to have >=1 characters',
    };

    // When
    const formatted = formatLessonPlanIssue(issue, plan);

    // Then
    expect(formatted).toEqual({
        label: '1차시 평가 2 기대 수준 학생 피드백',
        message: '1차시 평가 2 기대 수준 학생 피드백: 내용을 입력해주세요.',
    });
});

test('falls back to a human-readable top-level label and the original issue message', () => {
    // Given
    const issue = {
        code: 'invalid_type',
        path: ['instructionModel', 'unexpectedField'],
        message: '문자열 형식이어야 합니다.',
    };

    // When
    const formatted = formatLessonPlanIssue(issue, makeGeneratedPlan());

    // Then
    expect(formatted).toEqual({
        label: '수업 모형',
        message: '수업 모형: 문자열 형식이어야 합니다.',
    });
});

test.each([
    [['metadata', 'date'], '1차시 수업 일자'],
    [['metadata', 'place'], '1차시 수업 장소'],
    [['metadata', 'className'], '1차시 대상 학급'],
    [['metadata', 'teacherName'], '1차시 수업자'],
    [['title'], '1차시 수업 제목'],
    [['unitTitle'], '1차시 단원명'],
    [['essentialQuestion'], '1차시 핵심 질문'],
    [['learningGoals'], '1차시 학습 목표'],
    [['materials'], '1차시 준비물'],
    [['supportStrategies'], '1차시 개별화·지원 전략'],
    [['reflectionPrompt'], '1차시 수업 후 성찰'],
    [['sessions', 0, 'title'], '1차시 제목'],
    [['sessions', 0, 'nextSessionConnection'], '1차시 후속 학습 및 정리'],
])('maps the editable path %j to the exact control label', (path, expectedLabel) => {
    // Given
    const issue = { code: 'custom', path, message: '확인해주세요.' };

    // When
    const formatted = formatLessonPlanIssue(issue, makeGeneratedPlan());

    // Then
    expect(formatted).toEqual({
        label: expectedLabel,
        message: `${expectedLabel}: 확인해주세요.`,
    });
});

test.each([
    ['learningElement', '학습 요소'],
    ['teacherActivities', '교사 활동'],
    ['studentActivities', '학생 활동'],
    ['expectedStudentResponses', '예상 학생 반응'],
    ['minutes', '시간'],
    ['materialsAndNotes', '자료 및 유의점'],
    ['supportNotes', '지원 사항'],
])('maps the stage %s path to its exact control label', (field, fieldLabel) => {
    // Given
    const issue = {
        code: 'custom',
        path: ['sessions', 0, 'stages', 1, field],
        message: '확인해주세요.',
    };

    // When
    const formatted = formatLessonPlanIssue(issue, makeGeneratedPlan());

    // Then
    expect(formatted.label).toBe(`1차시 전개 ${fieldLabel}`);
});

test.each([
    ['element', '평가 요소'],
    ['method', '평가 방법'],
    ['evidence', '관찰 증거'],
    ['feedback', '공통 피드백'],
])('maps the assessment %s path to its exact control label', (field, fieldLabel) => {
    // Given
    const issue = {
        code: 'custom',
        path: ['assessment', 0, field],
        message: '확인해주세요.',
    };

    // When
    const formatted = formatLessonPlanIssue(issue, makeGeneratedPlan());

    // Then
    expect(formatted.label).toBe(`1차시 평가 1 ${fieldLabel}`);
});
