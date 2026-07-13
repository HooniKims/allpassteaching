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
