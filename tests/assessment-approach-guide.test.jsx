import { useState } from 'react';
import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackwardDesignForm } from '@/components/workflow/BackwardDesignForm.jsx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { createDefaultAssessmentRequest } from '@/lib/assessment-request';
import { ASSESSMENT_APPROACHES } from '@/lib/assessment-approaches';

test('모든 평가 설계 방식에 쉬운 설명과 평가 흐름을 제공한다', () => {
    expect(ASSESSMENT_APPROACHES.every(approach => approach.plainGuide && approach.flow.length > 0)).toBe(true);
});

test('실제적 수행과제는 배운 내용의 실제 상황 적용을 안내한다', () => {
    const approach = ASSESSMENT_APPROACHES.find(item => item.id === 'authentic-performance');
    expect(approach.plainGuide).toBe('학생이 실제와 비슷한 역할과 상황에서 배운 내용을 실제 상황에 적용해 보게 하는 평가예요.');
});

test('선택한 평가 설계 방식을 쉬운 말과 평가 흐름으로 설명한다', async () => {
    const user = userEvent.setup();
    function Harness() {
        const [request, setRequest] = useState(createDefaultAssessmentRequest());
        return <BackwardDesignForm lessonPlan={makeGeneratedPlan()} value={request} onChange={setRequest}/>;
    }

    render(<Harness/>);
    await user.click(screen.getByRole('radio', { name: /포트폴리오 성장 평가/ }));

    expect(screen.getByRole('status')).toHaveTextContent('쉽게 말하면, 한 번의 결과만 보지 않고 초안부터 수정본까지 학생이 어떻게 달라졌는지 함께 보는 평가예요.');
    expect(screen.getByRole('status')).toHaveTextContent('초기 산출물 → 피드백 → 수정본 → 성찰');
});
