import { useState } from 'react';
import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GradingEditor } from '@/components/workflow/GradingEditor.jsx';
import { makeAssessment } from './fixtures/workflow.mjs';

const initial = {
    id: 's1', studentName: '김학생', approved: true, originalReviewedAt: '2026-07-12T12:00:00.000Z',
    grading: { criteria: [
        { criterionId: 'criterion-1', score: 35, evidence: '뿌리에 가는 털', feedback: '구체적입니다.', sourceRefs: [{ elementId: 'element-1', page: 1, text: '뿌리에 가는 털', coordinates: [{ x: .1, y: .2 }, { x: .8, y: .3 }] }] },
        { criterionId: 'criterion-2', score: 50, evidence: '물을 흡수한다', feedback: '관계가 드러납니다.' },
    ], totalScore: 85, summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명해보세요.' },
};

test('teacher score edits recalculate the total and revoke prior approval', async () => {
    const user = userEvent.setup();
    function Harness() { const [value, setValue] = useState(initial); return <><GradingEditor assessment={makeAssessment()} submission={value} onChange={setValue}/><output data-testid="grading-state">{JSON.stringify(value)}</output></>; }
    render(<Harness/>);

    const score = screen.getByLabelText('관찰 근거 점수');
    await user.clear(score); await user.type(score, '30');

    expect(screen.getByText('총점 80점')).toBeInTheDocument();
    expect(screen.getByText('수정되어 교사 승인이 해제되었습니다.')).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('grading-state').textContent)).toMatchObject({ approved: false, originalReviewedAt: null });
});

test('teacher source-reference edits revoke original review and approval', async () => {
    const user = userEvent.setup();
    function Harness() { const [value, setValue] = useState(initial); return <><GradingEditor assessment={makeAssessment()} submission={value} onChange={setValue}/><output data-testid="grading-state">{JSON.stringify(value)}</output></>; }
    render(<Harness/>);

    await user.click(screen.getByRole('button', { name: '뿌리에 가는 털 원본 연결 삭제' }));

    const state = JSON.parse(screen.getByTestId('grading-state').textContent);
    expect(state.grading.criteria[0].sourceRefs).toEqual([]);
    expect(state).toMatchObject({ approved: false, originalReviewedAt: null, approvalRevoked: true });
});
