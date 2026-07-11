import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonPlanWorkspace } from '@/components/lesson-plan/LessonPlanWorkspace.jsx';
import { createGenerationSnapshot } from '@/lib/lesson-input';
import { generationDraft, makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

test('shows the approved four-step navigation', () => {
    render(<LessonPlanWorkspace />);
    for (const name of ['수업 정보', '성취기준', '수업 모형', '지도안 완성']) expect(screen.getByText(name)).toBeInTheDocument();
});

test('moves from a generated plan to completed earlier steps and back without deleting the plan', async () => {
    const user = userEvent.setup();
    const plan = makeGeneratedPlan();
    window.localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: {
        ...generationDraft,
        step: 4,
        maxReached: 4,
        plan,
        originalPlan: structuredClone(plan),
        generatedFrom: createGenerationSnapshot(generationDraft),
    } }));
    render(<LessonPlanWorkspace />);

    await user.click(await screen.findByRole('button', { name: '수업 정보 단계로 이동' }));
    expect(screen.getByRole('heading', { name: '어떤 수업을 준비하시나요?' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('수업할 개념 및 내용'));
    await user.type(screen.getByLabelText('수업할 개념 및 내용'), '수정한 식물 탐구 수업');
    await user.click(screen.getByRole('button', { name: '지도안 완성 단계로 이동' }));

    expect(screen.getByText('현재 지도안은 변경 전 입력으로 생성되었습니다.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '1차시 수업 개요' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정 내용으로 다시 생성' })).toBeEnabled();
});
