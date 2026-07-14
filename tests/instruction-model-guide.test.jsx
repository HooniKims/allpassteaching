import { useState } from 'react';
import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstructionModelStep } from '@/components/lesson-plan/InstructionModelStep.jsx';
import { instructionModels } from '@/data/instruction-models';

test('모든 수업 모형에 쉬운 설명을 제공한다', () => {
    expect(instructionModels.every(model => model.plainGuide && model.stages.length > 0)).toBe(true);
});

test('선택한 수업 모형을 쉬운 말과 수업 흐름으로 설명한다', async () => {
    const user = userEvent.setup();
    function Harness() {
        const [selected, setSelected] = useState(null);
        return <InstructionModelStep lessonIntent="빛의 성질을 관찰한다" selected={selected} onChange={setSelected} onBack={() => {}} onNext={() => {}}/>;
    }

    render(<Harness/>);
    await user.click(screen.getByRole('radio', { name: '탐구·발견 학습 선택' }));

    expect(screen.getByRole('status')).toHaveTextContent('쉽게 말하면, 학생이 질문을 세우고 직접 관찰한 증거로 답을 찾는 수업이에요.');
    expect(screen.getByRole('status')).toHaveTextContent('문제 인식 → 가설 설정 → 탐구 수행 → 결론');
});

test('수업 흐름과 융합·에듀테크 설계를 구분해 보여준다', () => {
    render(<InstructionModelStep lessonIntent="디지털 도구로 여러 교과를 융합한다" selected={null} onChange={() => {}} onBack={() => {}} onNext={() => {}}/>);

    expect(screen.getByRole('heading', { name: '수업 흐름 중심' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '융합 수업 설계' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '에듀테크 설계' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'TPACK 수업 설계 선택' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'SAMR 에듀테크 설계 선택' })).toBeInTheDocument();
});

test('TPACK 설명과 설계 단계의 의미 단위를 함께 줄바꿈한다', async () => {
    const user = userEvent.setup();
    function Harness() {
        const [selected, setSelected] = useState(null);
        return <InstructionModelStep lessonIntent="디지털 기술 활용" selected={selected} onChange={setSelected} onBack={() => {}} onNext={() => {}}/>;
    }

    render(<Harness/>);
    await user.click(screen.getByRole('radio', { name: 'TPACK 수업 설계 선택' }));

    expect(screen.getByText('어떻게 가르칠지,')).toHaveClass('keep-together');
    expect(screen.getByText('· 기술 적합성 검토')).toHaveClass('flow-sequence__step');
    expect(screen.getByRole('status')).toHaveTextContent('설계 점검 기준');
    expect(screen.getByRole('status')).not.toHaveTextContent('설계 점검 흐름');
});

test('융합수업과 SAMR 카드의 핵심 의미 단위를 함께 줄바꿈한다', () => {
    render(<InstructionModelStep lessonIntent="융합 에듀테크" selected={null} onChange={() => {}} onBack={() => {}} onNext={() => {}}/>);

    expect(screen.getByText('복합 문제를 다룰 때')).toHaveClass('keep-together');
    expect(screen.getByText('새롭게 바꾸는지 점검할 때')).toHaveClass('keep-together');
});

test('SAMR 쉬운 설명의 목적어와 서술어 의미 단위를 함께 줄바꿈한다', () => {
    const samr = instructionModels.find(model => model.id === 'samr');
    render(<InstructionModelStep lessonIntent="에듀테크" selected={samr} onChange={() => {}} onBack={() => {}} onNext={() => {}}/>);

    expect(screen.getByText('학습 목표에 맞게')).toHaveClass('keep-together');
    expect(screen.getByText('과제를 바꾸는 틀이에요.')).toHaveClass('keep-together');
});
