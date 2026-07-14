import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi, test, expect } from 'vitest';
import { InstructionModelStep } from '@/components/lesson-plan/InstructionModelStep.jsx';

test('shows three recommendations but allows another catalog model', async () => {
    const user = userEvent.setup(); const onChange = vi.fn();
    render(<InstructionModelStep lessonIntent="식물 성장 조건 실험 관찰" selected="" onChange={onChange} onBack={() => {}} onNext={() => {}} />);
    expect(screen.getAllByText('추천')).toHaveLength(3);
    await user.click(screen.getByRole('radio', { name: /협동 학습/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'cooperative' }));
});

function IntegratedSelectionHarness() {
    const [selected, setSelected] = useState(null);
    const basics = { schoolLevel: 'elementary', grade: '5', subject: '과학', displaySubject: '과학', mappedSubjects: ['과학'], intent: '식물 구조를 수학적 자료와 연결해 탐구한다' };
    return <InstructionModelStep basics={basics} primaryStandards={[{ code: '6과11-02', text: '식물 기관을 관찰한다.', subject: '과학' }]} lessonIntent={basics.intent} selected={selected} onChange={setSelected} onBack={() => {}} onNext={() => {}}/>;
}

test('융합수업은 두 번째 교과와 그 교과 성취기준을 별도로 선택해야 다음 단계로 갈 수 있다', async () => {
    const user = userEvent.setup();
    render(<IntegratedSelectionHarness/>);

    await user.click(screen.getByRole('radio', { name: '융합수업 선택' }));
    expect(screen.getByRole('heading', { name: '두 번째 교과와 성취기준을 선택해주세요' })).toBeVisible();
    expect(screen.getByText((_content, element) => element.tagName === 'P' && element.textContent.includes('과학 성취기준 1개는 이미 선택'))).toBeVisible();
    expect(screen.getByRole('button', { name: '지도안 생성 →' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('융합 연계 교과'), '수학');
    await user.click(await screen.findByRole('checkbox', { name: /수학 6수01-01/ }));

    expect(screen.getByRole('status', { name: '선택한 연계 교과 성취기준' })).toHaveTextContent('1개 선택 · 두 교과 합계 2/10개');
    expect(screen.getByRole('button', { name: '지도안 생성 →' })).toBeEnabled();
});

function HighSchoolIntegratedHarness() {
    const [selected, setSelected] = useState({
        id: 'integrated', name: '융합수업', stages: ['공통 맥락·문제', '교과 관점 탐구', '관점 통합', '적용·성찰'],
        integrationSubject: '', integrationStandards: [],
    });
    const basics = { schoolLevel: 'high', grade: '1', subject: '통합과학1', displaySubject: '통합과학1', mappedSubjects: ['과학'], intent: '과학 현상을 수학식으로 설명한다' };
    return <InstructionModelStep basics={basics} primaryStandards={[{ code: '10통과1-01-01', text: '과학의 기초를 탐구한다.', subject: '과학' }]} lessonIntent={basics.intent} selected={selected} onChange={setSelected} onBack={() => {}} onNext={() => {}}/>;
}

test('표시 과목과 교육과정 원본 과목명이 다른 연계 기준도 체크박스로 다시 해제할 수 있다', async () => {
    const user = userEvent.setup();
    render(<HighSchoolIntegratedHarness/>);

    await user.selectOptions(screen.getByLabelText('융합 연계 교과'), '공통수학1');
    await user.clear(screen.getByLabelText('연계 교과 성취기준 검색'));
    await user.type(screen.getByLabelText('연계 교과 성취기준 검색'), '10공수1-01-01');
    const standardCheckbox = await screen.findByRole('checkbox', { name: /공통수학1 10공수1-01-01/ });
    await user.click(standardCheckbox);
    expect(standardCheckbox).toBeChecked();

    await user.click(standardCheckbox);
    expect(standardCheckbox).not.toBeChecked();
    expect(screen.getByRole('button', { name: '지도안 생성 →' })).toBeDisabled();
});

test('융합 성취기준은 두 교과 합계 10개를 넘겨 선택할 수 없다', async () => {
    const user = userEvent.setup();
    const primaryStandards = Array.from({ length: 10 }, (_, index) => ({ code: `10통과1-01-${index + 1}`, text: `과학 성취기준 ${index + 1}`, subject: '과학' }));
    const selected = { id: 'integrated', name: '융합수업', stages: [], integrationSubject: '공통수학1', integrationStandards: [] };
    const basics = { schoolLevel: 'high', grade: '1', subject: '통합과학1', displaySubject: '통합과학1', mappedSubjects: ['과학'], intent: '수학과 과학을 연결한다' };
    render(<InstructionModelStep basics={basics} primaryStandards={primaryStandards} lessonIntent={basics.intent} selected={selected} onChange={() => {}} onBack={() => {}} onNext={() => {}}/>);

    await user.clear(screen.getByLabelText('연계 교과 성취기준 검색'));
    await user.type(screen.getByLabelText('연계 교과 성취기준 검색'), '10공수1-01-01');
    expect(await screen.findByRole('checkbox', { name: /공통수학1 10공수1-01-01/ })).toBeDisabled();
    expect(screen.getByText(/주교과 성취기준을 9개 이하로 줄여야/)).toBeVisible();
    expect(screen.getByRole('button', { name: '지도안 생성 →' })).toBeDisabled();
});
