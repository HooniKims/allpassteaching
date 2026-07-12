import { useState } from 'react';
import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GradingEditor } from '@/components/workflow/GradingEditor.jsx';
import { makeAssessment } from './fixtures/workflow.mjs';

const sourceRef = { elementId: 'element-1', page: 1, text: '뿌리에 가는 털', coordinates: [{ x: .1, y: .2 }, { x: .8, y: .3 }] };
const initial = {
    id: 's1', studentName: '김학생', approved: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', reviewedOriginalRevision: 1, originalRevision: 1,
    elements: [sourceRef],
    grading: { criteria: [
        { status: 'scored', criterionId: 'criterion-1', selectedLevelId: 'proficient', score: 35, evidence: '뿌리에 가는 털', reason: '대부분의 기관을 구체적으로 기록했습니다.', feedback: '다른 기관도 관찰하세요.', confidence: .9, sourceRefs: [sourceRef], teacherConfirmed: true },
        { status: 'teacher_review', criterionId: 'criterion-2', selectedLevelId: null, score: null, evidence: 'x² = 4', reviewReason: '수식 기호를 원본에서 확인해야 합니다.', confidence: .61, sourceRefs: [{ ...sourceRef, elementId: 'element-2', text: 'x² = 4' }], teacherConfirmed: false },
    ], provisionalTotal: 35, totalScore: null, sourceHash: 'src-current', summary: '근거를 활용했습니다.', nextSteps: '수식을 확인해보세요.' },
};

function Harness() {
    const [value, setValue] = useState(initial);
    return <><GradingEditor assessment={makeAssessment()} submission={value} onChange={setValue}/><output data-testid="grading-state">{JSON.stringify(value)}</output></>;
}

test('Given a scoreless criterion When the editor renders Then the reason, evidence, feedback and exact rubric level controls are visible', () => {
    render(<Harness/>);

    expect(screen.getByRole('combobox', { name: '구조와 기능 설명 성취 수준' })).toHaveValue('');
    expect(screen.getByText('교사 확인 필요')).toBeInTheDocument();
    expect(screen.getByText('수식 기호를 원본에서 확인해야 합니다.')).toBeInTheDocument();
    expect(screen.getByText(/확정 총점은 모든 평가영역/)).toHaveTextContent('확정 총점은 모든 평가영역 확인 뒤 계산됩니다.');
    expect(screen.queryByRole('spinbutton', { name: '구조와 기능 설명 점수' })).not.toBeInTheDocument();
});

test('Given teacher review When a rubric level is selected Then its exact score is used and prior approval is revoked', async () => {
    const user = userEvent.setup();
    render(<Harness/>);

    await user.selectOptions(screen.getByRole('combobox', { name: '구조와 기능 설명 성취 수준' }), 'developing');

    const state = JSON.parse(screen.getByTestId('grading-state').textContent);
    expect(state.grading.criteria[1]).toMatchObject({ status: 'scored', decisionSource: 'teacher', selectedLevelId: 'developing', score: 30, teacherConfirmed: false });
    expect(screen.getByText('교사 선택')).toBeInTheDocument();
    expect(state.grading.provisionalTotal).toBe(65);
    expect(state.grading.totalScore).toBeNull();
    expect(state).toMatchObject({ approved: false, originalReviewedAt: null, reviewedOriginalRevision: null, approvalRevoked: true });
});

test('Given a resolved criterion When required explanation is complete Then teacher can confirm that criterion', async () => {
    const user = userEvent.setup();
    render(<Harness/>);
    await user.selectOptions(screen.getByRole('combobox', { name: '구조와 기능 설명 성취 수준' }), 'proficient');
    await user.type(screen.getByLabelText('구조와 기능 설명 평가 이유'), '원본 수식과 풀이를 확인했습니다.');
    await user.type(screen.getByLabelText('구조와 기능 설명 다음 성장 피드백'), '계산 과정을 문장으로 설명해보세요.');
    await user.click(screen.getByLabelText('구조와 기능 설명 근거와 수준 확인 완료'));

    expect(JSON.parse(screen.getByTestId('grading-state').textContent).grading.criteria[1].teacherConfirmed).toBe(true);
});

test('Given a source link When it is deleted Then original review and approval are revoked', async () => {
    const user = userEvent.setup();
    render(<Harness/>);

    await user.click(screen.getByRole('button', { name: '뿌리에 가는 털 원본 연결 삭제' }));

    const state = JSON.parse(screen.getByTestId('grading-state').textContent);
    expect(state.grading.criteria[0].sourceRefs).toEqual([]);
    expect(state).toMatchObject({ approved: false, originalReviewedAt: null, approvalRevoked: true });
});
