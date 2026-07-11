import { afterEach, expect, test, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorksheetStage } from '@/components/workflow/WorksheetStage.jsx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeWorksheet } from './fixtures/workflow.mjs';

afterEach(() => vi.restoreAllMocks());

test('preselects the format matching the lesson model and saves generated content with its source', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ worksheet: makeWorksheet() })));
    render(<WorksheetStage lessonPlan={makeGeneratedPlan()} value={null} onChange={onChange}/>);

    expect(screen.getByLabelText('학습지 형식')).toHaveValue('inquiry-experiment');
    await user.click(screen.getByRole('button', { name: '학습지 생성하기' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ formatId: 'inquiry-experiment', sourceHash: expect.stringMatching(/^src-/) })));
});

test('lets the teacher edit worksheet questions and answer keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Harness() {
        const [value, setValue] = useState({ ...makeWorksheet(), sourceHash: 'old' });
        return <WorksheetStage lessonPlan={makeGeneratedPlan()} value={value} onChange={next => { setValue(next); onChange(next); }}/>;
    }
    render(<Harness/>);

    const prompt = screen.getByLabelText('문항 1');
    await user.clear(prompt); await user.type(prompt, '새 탐구 질문');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ document: expect.objectContaining({ sections: expect.arrayContaining([expect.objectContaining({ questions: expect.arrayContaining([expect.objectContaining({ prompt: '새 탐구 질문' })]) })]) }) }));
    expect(screen.getByText('이전 지도안으로 생성됨')).toBeInTheDocument();
});
