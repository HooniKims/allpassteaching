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
    expect(approach.plainGuide).toBe('학생이 실제와 비슷한 역할과 상황에서 배운 지식과 기능을 적용하는 평가예요.');
});

test('GRASPS를 실제적 수행과제의 여섯 요소로 안내한다', () => {
    const approach = ASSESSMENT_APPROACHES.find(item => item.id === 'authentic-performance');

    expect(approach.name).toBe('GRASPS 실제적 수행과제');
    expect(approach.flow).toEqual(['목표(G)', '역할(R)', '청중(A)', '상황(S)', '산출물(P)', '성공 기준(S)']);
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

test('GRASPS 설명과 각 평가 요소의 의미 단위를 함께 줄바꿈한다', async () => {
    const user = userEvent.setup();
    function Harness() {
        const [request, setRequest] = useState(createDefaultAssessmentRequest());
        return <BackwardDesignForm lessonPlan={makeGeneratedPlan()} value={request} onChange={setRequest}/>;
    }

    render(<Harness/>);
    await user.click(screen.getByRole('radio', { name: /GRASPS 실제적 수행과제/ }));

    expect(screen.getByText('적용하는 평가예요.')).toHaveClass('keep-together');
    expect(screen.getByRole('status')).toHaveTextContent('GRASPS 요소: 목표(G) · 역할(R) · 청중(A) · 상황(S) · 산출물(P) · 성공 기준(S)');
    expect(screen.getByText('· 산출물(P)')).toHaveClass('flow-sequence__step');
});

test('평가 카드와 근본 질문의 핵심 의미 단위를 함께 줄바꿈한다', () => {
    function Harness() {
        const [request, setRequest] = useState(createDefaultAssessmentRequest());
        return <BackwardDesignForm lessonPlan={makeGeneratedPlan()} value={request} onChange={setRequest}/>;
    }

    render(<Harness/>);

    expect(screen.getByText('해결안 검증의 사고 과정을 봅니다.')).toHaveClass('keep-together');
    expect(screen.getByText('사회 현안 분석처럼')).toHaveClass('keep-together');
    expect(screen.getByText('발표 자료를 관찰 가능한 증거로 평가합니다.')).toHaveClass('keep-together');
    expect(screen.getByText('동료 피드백 뒤 수정한 증거를 봅니다.')).toHaveClass('keep-together');
    expect(screen.getByText('스스로 해낼 수 있길')).toHaveClass('question-phrase');
});
