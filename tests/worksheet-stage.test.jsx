import { afterEach, expect, test, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorksheetStage } from '@/components/workflow/WorksheetStage.jsx';
import { OperationProvider } from '@/components/workflow/OperationProvider.jsx';
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

test('explains the selected worksheet format and makes the recommendation rule visible', async () => {
    const user = userEvent.setup();
    render(<WorksheetStage lessonPlan={makeGeneratedPlan()} value={null} onChange={vi.fn()}/>);

    expect(screen.getByText('선택한 형식은 이렇게 써요')).toBeInTheDocument();
    expect(screen.getByText('학생이 스스로 질문하고 관찰·실험한 내용을 순서대로 기록하게 할 때 좋아요.')).toBeInTheDocument();
    expect(screen.getByText('현재 추천')).toBeInTheDocument();
    expect(screen.getByText(/선택한 수업 모형과 연결해 둔 기본 형식입니다/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('학습지 형식'), 'discussion-evidence');

    expect(screen.getByText('자기 주장과 이유, 다른 의견에 대한 생각을 차례로 정리하게 할 때 좋아요.')).toBeInTheDocument();
    expect(screen.getByLabelText('선택한 학습지 형식 안내')).toHaveTextContent('탐구·실험 기록지');
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

test('sends teacher requirements and selected question types when generating', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ worksheet: makeWorksheet() })));
    render(<WorksheetStage lessonPlan={makeGeneratedPlan()} value={null} onChange={vi.fn()}/>);

    await user.type(screen.getByLabelText('학습지 추가 요구사항'), '그래프를 해석한 뒤 근거를 쓰게 해주세요.');
    await user.click(screen.getByLabelText('5지 선다형'));
    await user.click(screen.getByLabelText('표·그래프 작성'));
    await user.click(screen.getByRole('button', { name: '학습지 생성하기' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.generationRequest).toEqual({
        additionalRequirements: '그래프를 해석한 뒤 근거를 쓰게 해주세요.',
        questionTypes: expect.arrayContaining(['multiple-choice-5', 'table-chart']),
    });
});

test('adds, duplicates, reorders, and removes sections without losing teacher answers', async () => {
    const user = userEvent.setup();
    let latest = { ...makeWorksheet(), sourceHash: 'old' };
    function Harness() {
        const [value, setValue] = useState(latest);
        return <WorksheetStage lessonPlan={makeGeneratedPlan()} value={value} onChange={next => { latest = next; setValue(next); }}/>;
    }
    render(<Harness/>);

    await user.click(screen.getByRole('button', { name: '첫 번째 섹션 복제' }));
    expect(latest.document.sections).toHaveLength(3);
    const duplicatedIds = latest.document.sections[1].questions.map(question => question.id);
    expect(duplicatedIds.every(id => latest.teacherKey.answers.some(answer => answer.questionId === id))).toBe(true);

    await user.click(screen.getByRole('button', { name: '두 번째 섹션 아래로 이동' }));
    expect(latest.document.sections[2].questions.map(question => question.id)).toEqual(duplicatedIds);

    await user.click(screen.getByRole('button', { name: '세 번째 섹션 삭제' }));
    expect(latest.document.sections).toHaveLength(2);
    expect(latest.teacherKey.answers.some(answer => duplicatedIds.includes(answer.questionId))).toBe(false);

    await user.click(screen.getByRole('button', { name: '섹션 추가' }));
    expect(latest.document.sections).toHaveLength(3);
    const addedQuestion = latest.document.sections[2].questions[0];
    expect(latest.teacherKey.answers.filter(answer => answer.questionId === addedQuestion.id)).toHaveLength(1);
});

test('duplicates and reorders questions while keeping exactly one answer per stable question id', async () => {
    const user = userEvent.setup();
    let latest = { ...makeWorksheet(), sourceHash: 'old' };
    function Harness() {
        const [value, setValue] = useState(latest);
        return <WorksheetStage lessonPlan={makeGeneratedPlan()} value={value} onChange={next => { latest = next; setValue(next); }}/>;
    }
    render(<Harness/>);

    await user.click(screen.getByRole('button', { name: '문항 1 복제' }));
    const duplicatedQuestion = latest.document.sections[0].questions[1];
    expect(latest.teacherKey.answers.filter(answer => answer.questionId === duplicatedQuestion.id)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '문항 2 위로 이동' }));
    expect(latest.document.sections[0].questions[0].id).toBe(duplicatedQuestion.id);

    await user.click(screen.getByRole('button', { name: '문항 1 삭제' }));
    expect(latest.teacherKey.answers.some(answer => answer.questionId === duplicatedQuestion.id)).toBe(false);
});

test('upgrades a persisted legacy worksheet for editing without discarding its text', () => {
    const legacy = makeWorksheet();
    delete legacy.standards;
    delete legacy.generationRequest;
    legacy.document.sections.forEach(section => section.questions.forEach(question => {
        delete question.type;
        delete question.standardCodes;
    }));

    render(<WorksheetStage lessonPlan={makeGeneratedPlan()} value={legacy} onChange={vi.fn()}/>);

    expect(screen.getByDisplayValue('식물의 각 기관은 어떤 일을 할까요?')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/문항 \d+ \[6과11-02\] 연결/)).toHaveLength(2);
});

test('disables worksheet exports while one export is running', async () => {
    const user = userEvent.setup();
    let resolveDownload;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { resolveDownload = resolve; })));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:worksheet'), revokeObjectURL: vi.fn() });
    render(<OperationProvider><WorksheetStage lessonPlan={makeGeneratedPlan()} value={makeWorksheet()} onChange={vi.fn()}/></OperationProvider>);

    const button = screen.getByRole('button', { name: '학생용 HWPX' });
    await user.click(button);

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(button).toBeDisabled();
    await user.click(button);
    expect(fetch).toHaveBeenCalledOnce();

    resolveDownload(new Response(new Blob(['worksheet'])));
    await waitFor(() => expect(button).toBeEnabled());
});

test('disables add and duplicate actions before worksheet schema limits are exceeded', () => {
    const worksheet = makeWorksheet();
    const makeQuestion = index => ({ id: `limit-q-${index}`, type: 'descriptive', prompt: `제한 문항 ${index}`, responseLines: 2, standardCodes: ['6과11-02'] });
    const questions = Array.from({ length: 20 }, (_, index) => makeQuestion(index + 1));
    worksheet.document.sections = [{ id: 'limit-section', title: '제한 섹션', purpose: '상한 확인', questions }];
    worksheet.teacherKey.answers = questions.map(question => ({ questionId: question.id, answer: '예시 답안' }));

    const { unmount } = render(<WorksheetStage lessonPlan={makeGeneratedPlan()} value={worksheet} onChange={vi.fn()}/>);

    expect(screen.getByRole('button', { name: '문항 추가' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /문항 \d+ 복제/ }).every(button => button.disabled)).toBe(true);
    unmount();

    const maxSections = makeWorksheet();
    maxSections.document.sections = Array.from({ length: 12 }, (_, index) => {
        const question = makeQuestion(index + 1);
        return { id: `section-${index + 1}`, title: `섹션 ${index + 1}`, purpose: '학습 목적', questions: [question] };
    });
    maxSections.teacherKey.answers = maxSections.document.sections.map(section => ({ questionId: section.questions[0].id, answer: '예시 답안' }));
    render(<WorksheetStage lessonPlan={makeGeneratedPlan()} value={maxSections} onChange={vi.fn()}/>);

    expect(screen.getByRole('button', { name: '섹션 추가' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /번째 섹션 복제/ }).every(button => button.disabled)).toBe(true);
});
