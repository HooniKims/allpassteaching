import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonBasicsStep } from '@/components/lesson-plan/LessonBasicsStep.jsx';
import { LessonPlanWorkspace } from '@/components/lesson-plan/LessonPlanWorkspace.jsx';
import { generationDraft, makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
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

test('defaults a new lesson draft to middle school', () => {
    render(<LessonPlanWorkspace />);

    expect(screen.getByLabelText('학교급')).toHaveValue('middle');
});

test('saves edited lesson basics to local storage', async () => {
    const user = userEvent.setup();
    render(<LessonPlanWorkspace />);

    await user.type(screen.getByLabelText('수업할 개념 및 내용'), '로컬 저장 확인 수업');

    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('allpass.lesson-plan')).data.basics.intent).toBe('로컬 저장 확인 수업'));
});

test('does not advance without required lesson information', async () => {
    const user = userEvent.setup();
    render(<LessonPlanWorkspace />);
    await user.click(screen.getByRole('button', { name: '성취기준 찾기' }));
    expect(screen.getByRole('alert')).toHaveTextContent('필수 정보를 확인해주세요');
});

test('renders optional document metadata with empty defaults for a legacy draft', () => {
    render(<BasicsHarness/>);

    expect(screen.getByLabelText('수업 날짜')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('수업 날짜')).toHaveValue('');
    expect(screen.getByLabelText('교시')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('교시')).toHaveValue(null);
    expect(screen.queryByLabelText('수업 일시')).not.toBeInTheDocument();
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

test('selecting the final direct-input subject reveals the mapping field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ mappings: [
        { subject: '과학', score: 95, reason: '환경 탐구와 연결됩니다.' },
        { subject: '사회', score: 88, reason: '지역 환경과 연결됩니다.' },
    ] })));
    render(<BasicsHarness initialValue={{
        ...generationDraft.basics,
        subjectMode: 'official',
        displaySubject: '과학',
        mappedSubjects: ['과학'],
    }} onChange={onChange}/>);

    await user.selectOptions(screen.getByLabelText('과목'), '__custom__');
    expect(screen.queryByRole('group', { name: '과목 입력 방식' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('직접 입력 과목')).toBeVisible();
    await user.type(screen.getByLabelText('직접 입력 과목'), '환경');
    await user.click(screen.getByRole('button', { name: '관련 공식 과목 찾기' }));

    const mappingPanel = screen.getByRole('region', { name: '관련 공식 과목 확인' });
    expect(await within(mappingPanel).findByText('과학')).toBeInTheDocument();
    expect(within(mappingPanel).getByText('사회')).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
        subject: '환경',
        displaySubject: '환경',
        mappedSubjects: ['과학', '사회'],
    }));
});

test('school grade changes the available elementary subjects', async () => {
    const user = userEvent.setup();
    render(<BasicsHarness/>);

    await user.selectOptions(screen.getByLabelText('학교급'), 'elementary');
    await user.selectOptions(screen.getByLabelText('학년'), '2');
    expect(screen.getByRole('option', { name: '바른 생활' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '실과' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('학년'), '6');
    expect(screen.getByRole('option', { name: '실과' })).toBeInTheDocument();
});

test('keeps date and period metadata in the generation request', async () => {
    const user = userEvent.setup();
    const basics = { ...generationDraft.basics, metadata: { date: '2026-07-11', period: '3', place: '과학실', className: '5학년 1반', teacherName: '김교사' } };
    window.sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, basics, step: 4 } }));
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
    window.sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, basics, step: 4 } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ plan: makeGeneratedPlan() })));
    render(<LessonPlanWorkspace/>);

    await user.click(await screen.findByRole('button', { name: '지도안 생성하기' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(requestBody.basics.metadata).toEqual({ date: '', period: '', place: '', className: '', teacherName: '' });
});

test('생성 성공 시 원본을 별도로 저장하고 이후 편집은 현재 지도안만 바꾼다', async () => {
    const user = userEvent.setup();
    const generatedPlan = makeGeneratedPlan({ title: 'AI 생성 원본' });
    generatedPlan.sessions[0].stages[0].teacherQuestions[0] = 'AI 생성 원본 발문';
    window.sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, step: 4 } }));
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
    window.sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, step: 4 } }));
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
    window.sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, step: 4 } }));
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
    window.sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, step: 4 } }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    render(<LessonPlanWorkspace/>);

    await user.click(await screen.findByRole('button', { name: '지도안 생성하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('다시 시도');
    expect(screen.getByRole('button', { name: '지도안 생성하기' })).toBeEnabled();
});

test('shows a retryable error when the generation response is not JSON', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: { ...generationDraft, step: 4 } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>', { status: 500 })));
    render(<LessonPlanWorkspace/>);

    await user.click(await screen.findByRole('button', { name: '지도안 생성하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('다시 시도');
    expect(screen.getByRole('button', { name: '지도안 생성하기' })).toBeEnabled();
});

test('keeps the edited generated plan when regeneration fails', async () => {
    const user = userEvent.setup();
    const plan = makeGeneratedPlan({ title: '보존할 편집 지도안' });
    window.sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: {
        ...generationDraft,
        basics: { ...generationDraft.basics, intent: '수정한 수업 의도' },
        step: 4,
        maxReached: 4,
        plan,
        originalPlan: makeGeneratedPlan({ title: '생성 원본' }),
        generatedFrom: { ...generationDraft, basics: { ...generationDraft.basics } },
    } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: '재생성 실패' }, { status: 503 })));
    render(<LessonPlanWorkspace/>);

    await user.click(await screen.findByRole('button', { name: '수정 내용으로 다시 생성' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('재생성 실패');
    expect(screen.getByLabelText('1차시 수업 제목')).toHaveValue('보존할 편집 지도안');
});
