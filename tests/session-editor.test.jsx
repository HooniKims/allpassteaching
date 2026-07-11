import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test, expect, vi } from 'vitest';
import { SessionEditor } from '@/components/lesson-plan/SessionEditor.jsx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

function SessionHarness({ initial, onChange }) {
    const [session, setSession] = useState(initial);
    const update = next => {
        setSession(next);
        onChange(next);
    };
    return <SessionEditor session={session} onChange={update} />;
}

test.each([
    ['1차시 도입 주요 발문', 'teacherQuestions', '기관의 생김새를 먼저 살펴볼까요?'],
    ['1차시 도입 예상 학생 반응', 'expectedStudentResponses', '잎의 모양이 서로 다릅니다.'],
])('%s 편집 내용을 불변 차시 사본으로 전달한다', (label, key, editedValue) => {
    // Given
    const session = makeGeneratedPlan().sessions[0];
    const onChange = vi.fn();
    render(<SessionEditor session={session} onChange={onChange} />);

    // When
    fireEvent.change(screen.getByLabelText(label), { target: { value: editedValue } });

    // Then
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
        stages: expect.arrayContaining([expect.objectContaining({ [key]: [editedValue] })]),
    }));
    expect(session.stages[0][key]).not.toEqual([editedValue]);
});

test('shows a live alert when stage minutes differ from the session duration', () => {
    // Given
    const session = structuredClone(makeGeneratedPlan().sessions[0]);
    session.stages[0].minutes = 10;

    // When
    render(<SessionEditor session={session} onChange={() => {}} />);

    // Then
    expect(screen.getByRole('alert')).toHaveTextContent('단계 시간 합계 45분이 차시 시간 40분과 다릅니다.');
});

test('shows the complete nested field label inside the process table', () => {
    // Given / When
    render(<SessionEditor session={makeGeneratedPlan().sessions[0]} onChange={() => {}} />);

    // Then
    expect(screen.getByLabelText('1차시 도입 자료 및 유의점').closest('label')).toHaveTextContent('자료 및 유의점');
});

test('keeps a trailing newline while adding a second teacher question', async () => {
    // Given
    const user = userEvent.setup();
    const session = makeGeneratedPlan().sessions[0];
    const onChange = vi.fn();
    render(<SessionHarness initial={session} onChange={onChange} />);
    const questions = screen.getByLabelText('1차시 도입 주요 발문');

    // When
    await user.click(questions);
    await user.keyboard('{End}{Enter}둘째 발문');

    // Then
    expect(questions).toHaveValue(`${session.stages[0].teacherQuestions[0]}\n둘째 발문`);
    expect(onChange.mock.lastCall[0].stages[0].teacherQuestions).toEqual([
        session.stages[0].teacherQuestions[0],
        '둘째 발문',
    ]);
});
