import { afterEach, expect, test, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssessmentStage } from '@/components/workflow/AssessmentStage.jsx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment } from './fixtures/workflow.mjs';
import { sourceHash } from '@/lib/source-hash';

afterEach(() => vi.restoreAllMocks());

const request = {
    assessmentName: '식물 기관 탐구 수행평가',
    teacherIntent: { desiredResult: '식물 기관의 구조와 기능을 관찰 근거로 설명한다.', evidenceOfSuccess: '', growthProcess: '' },
    totalPoints: 100,
    levelCount: 4,
    includeProcessInScore: true,
    processWeightPercent: 20,
    outputTypes: ['탐구 보고서'],
    answerTypes: ['서술형'],
    stages: { draft: true, checkpoint: true, revision: true, final: true },
    visualAnalysisRequired: false,
    includeStudentCover: true,
    additionalRequirements: '',
};

test('백워드 설계의 세 질문을 정확히 보여주고 첫 질문 전에는 제안과 생성을 막는다', () => {
    render(<AssessmentStage lessonPlan={makeGeneratedPlan()} value={null} request={{ ...request, teacherIntent: { desiredResult: '', evidenceOfSuccess: '', growthProcess: '' } }} onRequestChange={() => {}} onChange={() => {}}/>);

    expect(screen.getByRole('heading', { name: '평가의 도착점을 먼저 정해볼까요?' })).toBeInTheDocument();
    expect(screen.getByLabelText('이 평가를 마친 학생이 무엇을 이해하고, 스스로 해낼 수 있길 바라나요?')).toBeRequired();
    expect(screen.getByLabelText('학생이 무엇을 보여주면 목표를 이뤘다고 판단할 수 있나요?')).toBeInTheDocument();
    expect(screen.getByLabelText('학생이 시도하고, 피드백을 받아 고쳐나가는 과정에서 무엇을 확인하고 싶나요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '백워드 설계 AI 초안 제안' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '수행평가 생성하기' })).toBeDisabled();
});

test('generates a performance assessment from the lesson source and teacher request', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ assessment: makeAssessment() })));
    render(<AssessmentStage lessonPlan={makeGeneratedPlan()} value={null} request={request} onRequestChange={() => {}} onChange={onChange}/>);

    await user.click(screen.getByRole('button', { name: '수행평가 생성하기' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ totalPoints: 100, sourceHash: expect.stringMatching(/^src-/) })));
    expect(fetch).toHaveBeenCalledWith('/api/generate-assessment', expect.objectContaining({ body: expect.stringContaining('assessmentRequest') }));
});

test('warns when teacher-edited rubric points no longer total 100', async () => {
    const user = userEvent.setup();
    function Harness() {
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: 'old' });
        return <AssessmentStage lessonPlan={makeGeneratedPlan()} value={value} request={request} onRequestChange={() => {}} onChange={setValue}/>;
    }
    render(<Harness/>);

    const points = screen.getByLabelText('관찰 근거 영역 총점');
    await user.clear(points); await user.type(points, '20');

    expect(screen.getByRole('alert')).toHaveTextContent('현재 80점');
    expect(screen.getByRole('button', { name: '수행평가 전체 PDF 저장' })).toBeDisabled();
});

test('requires explicit teacher confirmation and revokes it after editing', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        return <AssessmentStage lessonPlan={lessonPlan} value={value} request={request} onRequestChange={() => {}} onChange={setValue}/>;
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
    render(<AssessmentStage lessonPlan={lessonPlan} value={{ ...invalid, sourceHash: sourceHash(lessonPlan), approved: false }} request={request} onRequestChange={() => {}} onChange={() => {}}/>);
    expect(screen.getByRole('button', { name: '수행평가·루브릭 확인 완료' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('평가 요소');
});

test('교사가 급간을 다시 계산하고 표지 섹션을 편집·재정렬하면 미리보기가 즉시 갱신된다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        return <AssessmentStage lessonPlan={lessonPlan} value={value} request={request} onRequestChange={() => {}} onChange={setValue}/>;
    }
    render(<Harness/>);

    const total = screen.getByLabelText('전체 총점');
    await user.clear(total); await user.type(total, '60');
    const criterionTotal = screen.getByLabelText('관찰 근거 영역 총점');
    await user.clear(criterionTotal); await user.type(criterionTotal, '30');
    const interval = screen.getByLabelText('관찰 근거 급간 점수');
    await user.clear(interval); await user.type(interval, '5');
    await user.click(screen.getByRole('button', { name: '관찰 근거 급간으로 다시 계산' }));
    expect(screen.getByLabelText('관찰 근거 탁월 점수')).toHaveValue(30);
    expect(screen.getByLabelText('관찰 근거 충실 점수')).toHaveValue(25);

    const checklist = screen.getByLabelText('제출 전 확인 내용');
    await user.type(checklist, '\n수정 이유를 설명했는가?');
    expect(within(screen.getByRole('region', { name: '학생용 안내 표지 미리보기' })).getByText('수정 이유를 설명했는가?')).toBeInTheDocument();
});

test('전체 재생성 결과는 후보로 보관하고 교사가 적용하거나 현재안을 유지할 수 있다', async () => {
    const user = userEvent.setup();
    const current = makeAssessment();
    const candidate = makeAssessment();
    candidate.task.title = 'AI가 다시 만든 후보 과제';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ assessment: candidate })));
    function Harness() {
        const [value, setValue] = useState({ ...current, sourceHash: sourceHash(makeGeneratedPlan()), approved: false });
        return <AssessmentStage lessonPlan={makeGeneratedPlan()} value={value} request={request} onRequestChange={() => {}} onChange={setValue}/>;
    }
    render(<Harness/>);

    await user.click(screen.getByRole('button', { name: '수행평가 다시 생성' }));
    expect(await screen.findByText('AI가 다시 만든 후보 과제')).toBeInTheDocument();
    expect(screen.getByLabelText('과제명')).toHaveValue(current.task.title);
    await user.click(screen.getByRole('button', { name: '현재안 유지' }));
    expect(screen.queryByText('AI가 다시 만든 후보 과제')).not.toBeInTheDocument();
});

test('성취수준을 추가·복제·재정렬·삭제해도 모든 평가영역의 수준 id와 점수가 함께 움직인다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        return <AssessmentStage lessonPlan={lessonPlan} value={value} request={request} onRequestChange={() => {}} onChange={setValue}/>;
    }
    render(<Harness/>);

    await user.click(screen.getByRole('button', { name: '성취수준 추가' }));
    expect(screen.getByLabelText('5수준 이름')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '5수준 복제' }));
    expect(screen.getByLabelText('6수준 이름')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '6수준 왼쪽으로' }));
    await user.click(screen.getByRole('button', { name: '5수준 삭제' }));

    expect(screen.queryByLabelText('6수준 이름')).not.toBeInTheDocument();
    expect(screen.getAllByText('5수준').length).toBeGreaterThan(0);
});

test('평가영역마다 지도안의 성취기준 연결을 직접 편집하고 누락 시 승인을 막는다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        return <AssessmentStage lessonPlan={lessonPlan} value={value} request={request} onRequestChange={() => {}} onChange={setValue}/>;
    }
    render(<Harness/>);

    const links = screen.getAllByLabelText('[6과11-02] 연결');
    await user.click(links[0]);

    expect(screen.getByRole('button', { name: '수행평가·루브릭 확인 완료' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('성취기준');
});

test('평가영역을 추가·복제·삭제하면 양방향 성취기준 연결표도 같은 id로 갱신된다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        return <AssessmentStage lessonPlan={lessonPlan} value={value} request={request} onRequestChange={() => {}} onChange={setValue}/>;
    }
    render(<Harness/>);

    await user.click(within(screen.getByRole('group', { name: '1. 관찰 근거' })).getByRole('button', { name: '복제' }));

    const map = screen.getByRole('heading', { name: '성취기준 ↔ 과제 ↔ 평가영역 연결표' }).closest('section');
    expect(within(map).getByText(/관찰 근거 복사본/)).toBeInTheDocument();
});

test('표지 미리보기는 복사 문구가 아니라 현재 과제·성취기준·체크포인트를 실시간으로 읽는다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        return <AssessmentStage lessonPlan={lessonPlan} value={value} request={request} onRequestChange={() => {}} onChange={setValue}/>;
    }
    render(<Harness/>);
    const preview = screen.getByRole('region', { name: '학생용 안내 표지 미리보기' });

    expect(within(preview).getByText(/식물의 각 기관의 구조를 관찰하고/)).toBeInTheDocument();
    expect(within(preview).getAllByText(/관찰 기록 초안/).length).toBeGreaterThan(0);
    const product = screen.getByLabelText('산출물');
    await user.clear(product); await user.type(product, '피드백을 반영한 최종 탐구 포스터');

    expect(within(preview).getByText((_, node) => node?.tagName === 'P' && node.textContent.includes('피드백을 반영한 최종 탐구 포스터'))).toBeInTheDocument();
});

test('선택 영역 AI 후보 생성 뒤 원본을 수정하면 낡은 후보 적용을 차단하고 상세 비교를 유지한다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    const candidate = structuredClone(makeAssessment().rubric.criteria[0]);
    candidate.name = 'AI 새 관찰 영역';
    candidate.description = 'AI가 제안한 새 평가 설명';
    let resolve;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(done => { resolve = done; })));
    function Harness() {
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        return <AssessmentStage lessonPlan={lessonPlan} value={value} request={request} onRequestChange={() => {}} onChange={setValue}/>;
    }
    render(<Harness/>);
    const group = screen.getByRole('group', { name: '1. 관찰 근거' });
    await user.click(within(group).getByRole('button', { name: '이 영역만 AI 다시 생성' }));
    const name = within(group).getByLabelText('영역명');
    await user.clear(name); await user.type(name, '교사가 수정한 관찰 영역');
    resolve(Response.json({ criterion: candidate }));

    expect(await screen.findByText('AI가 제안한 새 평가 설명')).toBeInTheDocument();
    expect(screen.getByText('현재 설명')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '이 제안 적용' }));
    expect(screen.getByRole('alert')).toHaveTextContent('후보 생성 뒤');
    expect(screen.getAllByLabelText('영역명')[0]).toHaveValue('교사가 수정한 관찰 영역');
});

test('학생용 표지 미리보기는 모바일 카드에서도 모든 성취수준과 점수를 보여준다', () => {
    const lessonPlan = makeGeneratedPlan();
    render(<AssessmentStage lessonPlan={lessonPlan} value={{ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false }} request={request} onRequestChange={() => {}} onChange={() => {}}/>);

    const cards = screen.getByRole('region', { name: '모바일 평가 기준' });
    const firstCriterion = within(cards).getAllByRole('article')[0];
    expect(within(firstCriterion).getByText('관찰 근거 · 40점')).toBeInTheDocument();
    for (const label of ['탁월 · 40점', '충실 · 35점', '기초 · 30점', '보완 필요 · 25점']) {
        expect(within(firstCriterion).getByText(label)).toBeInTheDocument();
    }
});
