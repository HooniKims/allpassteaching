import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonBasicsStep } from '@/components/lesson-plan/LessonBasicsStep.jsx';
import { LessonPlanWorkspace } from '@/components/lesson-plan/LessonPlanWorkspace.jsx';
import { generationDraft, makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
});

const legacyBasics = { schoolLevel: '', grade: '', subject: '', mode: 'single', sessions: 1, intent: '', studentNeeds: '', error: '' };

function BasicsHarness({ initialValue = legacyBasics, onChange = () => {} }) {
    const [value, setValue] = useState(initialValue);
    return <LessonBasicsStep value={value} onChange={next => { setValue(next); onChange(next); }} onNext={() => {}}/>;
}

function deferred() {
    let resolve;
    const promise = new Promise(next => { resolve = next; });
    return { promise, resolve };
}

test('switches to a three-session lesson', async () => {
    const user = userEvent.setup();
    render(<LessonPlanWorkspace />);
    await user.click(screen.getByRole('radio', { name: '연속 차시 수업' }));
    const sessions = screen.getByLabelText('차시 수');
    await user.clear(sessions); await user.type(sessions, '3');
    expect(sessions).toHaveValue(3);
});

test('does not advance without required lesson information', async () => {
    const user = userEvent.setup();
    render(<LessonPlanWorkspace />);
    await user.click(screen.getByRole('button', { name: '성취기준 찾기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('필수 정보를 확인해주세요');
});

test('renders optional document metadata with empty defaults for a legacy draft', () => {
    render(<BasicsHarness/>);

    expect(screen.getByLabelText('수업 일시')).toHaveValue('');
    expect(screen.getByLabelText('수업 장소')).toHaveValue('');
    expect(screen.getByLabelText('대상 학급')).toHaveValue('');
    expect(screen.getByLabelText('수업자')).toHaveValue('');
});

test('updates the lesson place under basics metadata', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BasicsHarness onChange={onChange}/>);

    await user.type(screen.getByLabelText('수업 장소'), '과학실');

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ place: '과학실' }) }));
});

test('keeps metadata in the generation request', async () => {
    const user = userEvent.setup();
    const basics = { ...generationDraft.basics, metadata: { date: '2026-07-11T09:00', place: '과학실', className: '5학년 1반', teacherName: '김교사' } };
    window.localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, basics, step: 4 } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ plan: makeGeneratedPlan({ metadata: basics.metadata }) })));
    render(<LessonPlanWorkspace/>);

    await user.click(await screen.findByRole('button', { name: '지도안 생성하기' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.basics.metadata).toEqual(basics.metadata);
});

test('adds empty metadata keys to a generation request loaded from a legacy draft', async () => {
    const user = userEvent.setup();
    const basics = structuredClone(generationDraft.basics);
    delete basics.metadata;
    window.localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, basics, step: 4 } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ plan: makeGeneratedPlan() })));
    render(<LessonPlanWorkspace/>);

    await user.click(await screen.findByRole('button', { name: '지도안 생성하기' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.basics.metadata).toEqual({ date: '', place: '', className: '', teacherName: '' });
});

test('생성 성공 시 원본을 별도로 저장하고 이후 편집은 현재 지도안만 바꾼다', async () => {
    const user = userEvent.setup();
    const generatedPlan = makeGeneratedPlan({ title: 'AI 생성 원본' });
    generatedPlan.sessions[0].stages[0].teacherQuestions[0] = 'AI 생성 원본 발문';
    window.localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, step: 4 } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ plan: generatedPlan })));
    render(<LessonPlanWorkspace/>);

    await user.click(await screen.findByRole('button', { name: '지도안 생성하기' }));
    const title = await screen.findByLabelText('1차시 수업 제목');
    await user.clear(title);
    await user.type(title, '교사 편집 제목');

    await waitFor(() => {
        const saved = JSON.parse(window.localStorage.getItem('allpass.lesson-plan')).data;
        expect(saved.plan.title).toBe('교사 편집 제목');
        expect(saved.originalPlan.title).toBe('AI 생성 원본');
        expect(saved.originalPlan.sessions[0].stages[0].teacherQuestions[0]).toBe('AI 생성 원본 발문');
    });
});

test('ignores a late generation response after navigating back', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    window.localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, step: 4 } }));
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
    render(<LessonPlanWorkspace/>);

    await user.click(await screen.findByRole('button', { name: '지도안 생성하기' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByRole('heading', { name: '수업의 흐름을 선택해주세요' })).toBeInTheDocument();

    await act(async () => { pending.resolve(Response.json({ plan: makeGeneratedPlan() })); await pending.promise; });

    expect(screen.getByRole('heading', { name: '수업의 흐름을 선택해주세요' })).toBeInTheDocument();
});

test('aborts an active generation request when the workspace unmounts', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    window.localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, step: 4 } }));
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
    const { unmount } = render(<LessonPlanWorkspace/>);

    await user.click(await screen.findByRole('button', { name: '지도안 생성하기' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = fetch.mock.calls[0][1].signal;
    unmount();

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(true);
    pending.resolve(Response.json({ plan: makeGeneratedPlan() }));
});

test('shows a retryable error when the generation request is rejected', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, step: 4 } }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    render(<LessonPlanWorkspace/>);

    await user.click(await screen.findByRole('button', { name: '지도안 생성하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('다시 시도');
    expect(screen.getByRole('button', { name: '지도안 생성하기' })).toBeEnabled();
});

test('shows a retryable error when the generation response is not JSON', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, step: 4 } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>', { status: 500 })));
    render(<LessonPlanWorkspace/>);

    await user.click(await screen.findByRole('button', { name: '지도안 생성하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('다시 시도');
    expect(screen.getByRole('button', { name: '지도안 생성하기' })).toBeEnabled();
});
