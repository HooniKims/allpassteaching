import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

test('copies every editable lesson-plan field and announces success', async () => {
    // Given
    const user = userEvent.setup();
    const sentinels = {
        metadata: { date: '복사-일시', place: '복사-장소', className: '복사-학급', teacherName: '복사-수업자' },
        title: '복사-제목', unitTitle: '복사-단원', essentialQuestion: '복사-핵심질문',
        learningGoals: ['복사-학습목표'], materials: ['복사-준비물'],
        assessment: [{ element: '복사-평가요소', method: '복사-평가방법', evidence: '복사-관찰증거', feedback: '복사-공통피드백', levelFeedback: { needsSupport: '복사-도움필요', meets: '복사-기대수준', exceeds: '복사-심화수준' } }],
        supportStrategies: ['복사-지원전략'], reflectionPrompt: '복사-성찰',
    };
    const plan = makeGeneratedPlan(sentinels);
    plan.sessions[0] = {
        ...plan.sessions[0],
        nextSessionConnection: '복사-후속연결',
        stages: [{
            ...plan.sessions[0].stages[0],
            learningElement: '복사-학습요소', teacherActivities: ['복사-교사활동'], teacherQuestions: ['복사-주요발문'],
            studentActivities: ['복사-학생활동'], expectedStudentResponses: ['복사-예상반응'], materialsAndNotes: ['복사-자료유의'], supportNotes: ['복사-지원사항'],
        }, ...plan.sessions[0].stages.slice(1)],
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<LessonPlanEditor plan={plan} onChange={() => {}} />);

    // When
    await user.click(screen.getByRole('button', { name: '텍스트 복사' }));

    // Then
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = writeText.mock.calls[0][0];
    for (const sentinel of [
        ...Object.values(sentinels.metadata), sentinels.title, sentinels.unitTitle, sentinels.essentialQuestion,
        ...sentinels.learningGoals, ...sentinels.materials, '복사-학습요소', '복사-교사활동', '복사-주요발문',
        '복사-학생활동', '복사-예상반응', '복사-자료유의', '복사-지원사항',
        ...Object.values(sentinels.assessment[0]).filter(value => typeof value === 'string'),
        ...Object.values(sentinels.assessment[0].levelFeedback), ...sentinels.supportStrategies,
        sentinels.reflectionPrompt, '복사-후속연결',
    ]) expect(copied).toContain(sentinel);
    expect(screen.getByRole('status')).toHaveTextContent('지도안 전체 내용을 복사했습니다.');
});

test('announces a clipboard failure without an unhandled rejection', async () => {
    // Given
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<LessonPlanEditor plan={makeGeneratedPlan()} onChange={() => {}} />);

    // When
    await user.click(screen.getByRole('button', { name: '텍스트 복사' }));

    // Then
    expect(await screen.findByRole('status')).toHaveTextContent('클립보드에 복사하지 못했습니다.');
});

test('distinguishes an emitted prop echo from a later parent undo using the same object', async () => {
    // Given
    const user = userEvent.setup();
    const firstPlan = makeGeneratedPlan({ title: '첫 번째 지도안' });
    const replacement = makeGeneratedPlan({ title: '외부 교체 지도안', learningGoals: ['외부 교체 목표'] });
    const onChange = vi.fn();
    const { rerender } = render(<LessonPlanEditor plan={firstPlan} onChange={onChange} />);

    // When
    fireEvent.change(screen.getByLabelText('1차시 지도안 제목'), { target: { value: '자체 편집 지도안' } });
    const emittedPlan = onChange.mock.lastCall[0];
    rerender(<LessonPlanEditor plan={emittedPlan} onChange={onChange} />);

    // Then
    expect(screen.getByLabelText('1차시 지도안 제목')).toHaveValue('자체 편집 지도안');

    // When
    rerender(<LessonPlanEditor plan={replacement} onChange={() => {}} />);

    // Then
    expect(screen.getByLabelText('1차시 지도안 제목')).toHaveValue('외부 교체 지도안');
    expect(screen.getByLabelText('1차시 학습 목표')).toHaveValue('외부 교체 목표');

    // When
    rerender(<LessonPlanEditor plan={emittedPlan} onChange={onChange} />);

    // Then
    expect(screen.getByLabelText('1차시 지도안 제목')).toHaveValue('자체 편집 지도안');

    // When
    fireEvent.change(screen.getByLabelText('1차시 지도안 제목'), { target: { value: 'undo 후 수정' } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: '생성 원본으로 되돌리기' }));

    // Then
    expect(screen.getByLabelText('1차시 지도안 제목')).toHaveValue('자체 편집 지도안');
});

test('describes repeated shared fields and warns that long print content may add pages', () => {
    // Given / When
    render(<LessonPlanEditor plan={makeTwoSessionPlan()} onChange={() => {}} />);

    // Then
    const note = screen.getByText('학습 목표·준비물·평가·지원 전략·성찰은 전체 차시에 공통 적용되며 어느 차시에서 수정해도 함께 바뀝니다.');
    expect(note).toHaveAttribute('id', 'shared-plan-fields-note');
    expect(screen.getByText(/내용이 매우 길면 인쇄 페이지가 늘어날 수 있습니다/)).toBeVisible();
    for (const control of [
        ...screen.getAllByLabelText(/차시 학습 목표$/),
        ...screen.getAllByLabelText(/차시 준비물$/),
        ...screen.getAllByRole('table', { name: /차시 과정중심평가$/ }),
        ...screen.getAllByLabelText(/차시 개별화·지원 전략$/),
        ...screen.getAllByLabelText(/차시 수업 후 성찰$/),
    ]) expect(control).toHaveAttribute('aria-describedby', 'shared-plan-fields-note');
});

test('connects overview values and process totals to their semantic headers', () => {
    // Given / When
    render(<LessonPlanEditor plan={makeGeneratedPlan()} onChange={() => {}} />);

    // Then
    const dateCell = screen.getByLabelText('1차시 수업 일자').closest('td');
    expect(dateCell).toHaveAttribute('headers', 'session-1-overview-date');
    expect(document.getElementById('session-1-overview-date')).toHaveTextContent('일시');
    const footerCells = screen.getByRole('table', { name: '1차시 교수·학습 과정' }).querySelectorAll('tfoot td');
    expect(footerCells[0]).toHaveAttribute('headers', expect.stringContaining('session-1-process-minutes'));
    expect(footerCells[1]).toHaveAttribute('headers', expect.stringContaining('session-1-process-minutes'));
});
