import { afterEach, expect, test, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssessmentStage } from '@/components/workflow/AssessmentStage.jsx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment } from './fixtures/workflow.mjs';
import { sourceHash } from '@/lib/source-hash';

afterEach(() => vi.restoreAllMocks());

test('generates a performance assessment from the lesson source', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ assessment: makeAssessment() })));
    render(<AssessmentStage lessonPlan={makeGeneratedPlan()} value={null} onChange={onChange}/>);

    await user.click(screen.getByRole('button', { name: '수행평가 생성하기' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ totalPoints: 100, sourceHash: expect.stringMatching(/^src-/) })));
});

test('warns when teacher-edited rubric points no longer total 100', async () => {
    const user = userEvent.setup();
    function Harness() {
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: 'old' });
        return <AssessmentStage lessonPlan={makeGeneratedPlan()} value={value} onChange={setValue}/>;
    }
    render(<Harness/>);

    const points = screen.getByLabelText('관찰 근거 배점');
    await user.clear(points); await user.type(points, '20');

    expect(screen.getByRole('alert')).toHaveTextContent('현재 80점');
    expect(screen.getByRole('button', { name: 'PDF 저장' })).toBeDisabled();
});

test('requires explicit teacher confirmation and revokes it after editing', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        return <AssessmentStage lessonPlan={lessonPlan} value={value} onChange={setValue}/>;
    }
    render(<Harness/>);

    await user.click(screen.getByRole('button', { name: '수행평가·루브릭 확인 완료' }));
    expect(screen.getByRole('button', { name: '확인 완료 취소' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('과제명'), ' 수정');
    expect(screen.getByRole('button', { name: '수행평가·루브릭 확인 완료' })).toBeInTheDocument();
});

test('does not approve a rubric with an empty required description', async () => {
    const lessonPlan = makeGeneratedPlan();
    const invalid = makeAssessment();
    invalid.rubric.criteria[0].description = '';
    render(<AssessmentStage lessonPlan={lessonPlan} value={{ ...invalid, sourceHash: sourceHash(lessonPlan), approved: false }} onChange={() => {}}/>);
    expect(screen.getByRole('button', { name: '수행평가·루브릭 확인 완료' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('평가 요소');
});
