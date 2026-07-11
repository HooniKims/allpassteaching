import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test, expect, vi } from 'vitest';
import { LessonPlanEditor } from '@/components/lesson-plan/LessonPlanEditor.jsx';
import { makeGeneratedPlan, makeTwoSessionPlan } from './fixtures/lesson-plan.mjs';

test('renders every session as two formal document pages with semantic tables', () => {
    // Given
    const plan = makeTwoSessionPlan();

    // When
    const { container } = render(<LessonPlanEditor plan={plan} onChange={() => {}} />);

    // Then
    expect(screen.getAllByRole('heading', { level: 1, name: '교수·학습 과정안' })).toHaveLength(1);
    expect(container.querySelectorAll('.lesson-document-page')).toHaveLength(4);
    expect(screen.getByRole('table', { name: '1차시 수업 개요' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '1차시 교수·학습 과정' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '1차시 과정중심평가' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '2차시 수업 개요' })).toBeInTheDocument();
});

test('keeps blank optional metadata blank and publishes an immutable metadata edit', () => {
    // Given
    const plan = makeGeneratedPlan();
    const onChange = vi.fn();
    render(<LessonPlanEditor plan={plan} onChange={onChange} />);
    const dateInput = screen.getByLabelText('1차시 수업 일자');

    // When
    fireEvent.change(dateInput, { target: { value: '2026-07-11' } });

    // Then
    expect(dateInput).toHaveValue('2026-07-11');
    expect(dateInput).not.toHaveAttribute('placeholder');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
        metadata: { ...plan.metadata, date: '2026-07-11' },
    }));
    expect(plan.metadata.date).toBe('');
});

test('renders derived overview values and standards as read-only fields', () => {
    // Given / When
    render(<LessonPlanEditor plan={makeGeneratedPlan()} onChange={() => {}} />);

    // Then
    expect(screen.getByLabelText('1차시 학교급')).toHaveValue('초등학교');
    expect(screen.getByLabelText('1차시 학교급')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('1차시 성취기준')).toHaveValue('[6과11-02] 식물의 각 기관의 구조를 관찰하고 기능을 알아보는 실험을 수행한다.');
    expect(screen.getByLabelText('1차시 성취기준')).toHaveAttribute('readonly');
});

test.each([
    ['1차시 평가 1 평가 방법', 'method', '관찰 기록과 구두 설명'],
    ['1차시 평가 1 공통 피드백', 'feedback', '근거를 한 가지 더 찾도록 안내한다.'],
    ['1차시 평가 1 도움이 필요한 학생 피드백', 'needsSupport', '문장 틀을 제공한다.'],
    ['1차시 평가 1 기대 수준 학생 피드백', 'meets', '근거를 연결해 설명한다.'],
    ['1차시 평가 1 심화 수준 학생 피드백', 'exceeds', '새 사례에 적용한다.'],
])('%s 편집 내용을 평가 계획에 반영한다', (label, key, editedValue) => {
    // Given
    const plan = makeGeneratedPlan();
    const onChange = vi.fn();
    render(<LessonPlanEditor plan={plan} onChange={onChange} />);

    // When
    fireEvent.change(screen.getByLabelText(label), { target: { value: editedValue } });

    // Then
    const changed = onChange.mock.lastCall[0].assessment[0];
    const actual = key in changed.levelFeedback ? changed.levelFeedback[key] : changed[key];
    expect(actual).toBe(editedValue);
    expect(plan.assessment[0].method).toBe('관찰 및 산출물 확인');
});

test('keeps focus while typing a complete assessment element edit', async () => {
    // Given
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LessonPlanEditor plan={makeGeneratedPlan()} onChange={onChange} />);
    const element = screen.getByLabelText('1차시 평가 1 평가 요소');

    // When
    await user.clear(element);
    await user.type(element, '탐구 결과 설명');

    // Then
    expect(screen.getByLabelText('1차시 평가 1 평가 요소')).toHaveValue('탐구 결과 설명');
    expect(onChange.mock.lastCall[0].assessment[0].element).toBe('탐구 결과 설명');
});

test('keeps a trailing newline while adding a second learning goal', async () => {
    // Given
    const user = userEvent.setup();
    const plan = makeGeneratedPlan();
    const onChange = vi.fn();
    render(<LessonPlanEditor plan={plan} onChange={onChange} />);
    const goals = screen.getByLabelText('1차시 학습 목표');

    // When
    await user.click(goals);
    await user.keyboard('{End}{Enter}둘째 목표');

    // Then
    expect(goals).toHaveValue(`${plan.learningGoals[0]}\n둘째 목표`);
    expect(onChange.mock.lastCall[0].learningGoals).toEqual([plan.learningGoals[0], '둘째 목표']);
});

test('removes blank-only learning goal lines on blur', () => {
    // Given
    const onChange = vi.fn();
    render(<LessonPlanEditor plan={makeGeneratedPlan()} onChange={onChange} />);
    const goals = screen.getByLabelText('1차시 학습 목표');

    // When
    fireEvent.change(goals, { target: { value: '첫째 목표\n\n둘째 목표\n' } });
    fireEvent.blur(goals);

    // Then
    expect(onChange.mock.lastCall[0].learningGoals).toEqual(['첫째 목표', '둘째 목표']);
});

test.each([
    ['1차시 개별화·지원 전략', plan => plan.supportStrategies[0], '관찰 도구 선택지를 제공한다.'],
    ['1차시 수업 후 성찰', plan => plan.reflectionPrompt, '모든 학생이 근거를 말했는가?'],
    ['1차시 후속 학습 및 정리', plan => plan.sessions[0].nextSessionConnection, '관찰 결과를 정리한다.'],
])('%s 편집 내용을 지도안에 반영한다', (label, selectValue, editedValue) => {
    // Given
    const plan = makeGeneratedPlan();
    const onChange = vi.fn();
    render(<LessonPlanEditor plan={plan} onChange={onChange} />);

    // When
    fireEvent.change(screen.getByLabelText(label), { target: { value: editedValue } });

    // Then
    expect(selectValue(onChange.mock.lastCall[0])).toBe(editedValue);
});

test('edits a learning goal and restores the generated original', async () => {
    // Given
    const user = userEvent.setup();
    const plan = makeGeneratedPlan();
    render(<LessonPlanEditor plan={plan} onChange={() => {}} />);
    const goal = screen.getByLabelText('1차시 학습 목표');

    // When
    await user.clear(goal);
    await user.type(goal, '수정한 목표');

    // Then
    expect(goal).toHaveValue('수정한 목표');

    // When
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '생성 원본으로 되돌리기' }));

    // Then
    expect(goal).toHaveValue(plan.learningGoals[0]);
});

test('keeps all export, copy, and restore controls available', () => {
    // Given / When
    render(<LessonPlanEditor plan={makeGeneratedPlan()} onChange={() => {}} />);

    // Then
    expect(screen.getByRole('combobox', { name: '내보내기 형식' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '파일로 저장' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '텍스트 복사' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '생성 원본으로 되돌리기' })).toBeInTheDocument();
});
