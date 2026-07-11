import { useState } from 'react';
import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GradingEditor } from '@/components/workflow/GradingEditor.jsx';
import { makeAssessment } from './fixtures/workflow.mjs';

const initial = {
    id: 's1', studentName: '김학생', approved: true,
    grading: { criteria: [
        { criterionId: 'criterion-1', score: 35, evidence: '뿌리에 가는 털', feedback: '구체적입니다.' },
        { criterionId: 'criterion-2', score: 50, evidence: '물을 흡수한다', feedback: '관계가 드러납니다.' },
    ], totalScore: 85, summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명해보세요.' },
};

test('teacher score edits recalculate the total and revoke prior approval', async () => {
    const user = userEvent.setup();
    function Harness() { const [value, setValue] = useState(initial); return <GradingEditor assessment={makeAssessment()} submission={value} onChange={setValue}/>; }
    render(<Harness/>);

    const score = screen.getByLabelText('관찰 근거 점수');
    await user.clear(score); await user.type(score, '30');

    expect(screen.getByText('총점 80점')).toBeInTheDocument();
    expect(screen.getByText('수정되어 교사 승인이 해제되었습니다.')).toBeInTheDocument();
});
