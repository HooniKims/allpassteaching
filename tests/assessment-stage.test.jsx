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

test('평가 방식과 세 질문을 보여주고 첫 질문 전에는 제안과 생성을 막는다', () => {
    render(<AssessmentStage lessonPlan={makeGeneratedPlan()} value={null} request={{ ...request, teacherIntent: { desiredResult: '', evidenceOfSuccess: '', growthProcess: '' } }} onRequestChange={() => {}} onChange={() => {}}/>);

    expect(screen.getByRole('heading', { name: '어떤 방식으로 학생의 배움을 확인할까요?' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '평가 설계 방식' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /백워드 설계/ })).toBeChecked();
    expect(screen.getByLabelText('이 평가를 마친 학생이 무엇을 이해하고, 스스로 해낼 수 있길 바라나요?')).toBeRequired();
    expect(screen.getByLabelText('학생이 무엇을 보여주면 목표를 이뤘다고 판단할 수 있나요?')).toBeInTheDocument();
    expect(screen.getByLabelText('학생이 시도하고, 피드백을 받아 고쳐나가는 과정에서 무엇을 확인하고 싶나요?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '평가 설계 AI 초안 제안' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '수행평가 생성하기' })).toBeDisabled();
});

test('교사가 평가 설계 방식을 바꾸면 다음 생성 요청에 보존한다', async () => {
    const user = userEvent.setup();
    function Harness() {
        const [currentRequest, setCurrentRequest] = useState(request);
        return <><output data-testid="approach">{currentRequest.assessmentApproachId ?? 'backward-design'}</output><AssessmentStage lessonPlan={makeGeneratedPlan()} value={null} request={currentRequest} onRequestChange={setCurrentRequest} onChange={() => {}}/></>;
    }

    render(<Harness/>);
    await user.click(screen.getByRole('radio', { name: /포트폴리오 성장 평가/ }));

    expect(screen.getByTestId('approach')).toHaveTextContent('portfolio-growth');
    const guide = screen.getAllByRole('status').at(-1);
    expect(guide).toHaveTextContent('쉽게 말하면, 한 번의 결과만 보지 않고 초안부터 수정본까지 학생이 어떻게 달라졌는지 함께 보는 평가예요.');
    expect(guide).toHaveTextContent('초기 산출물 → 피드백 → 수정본 → 성찰');
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

test('keeps the last valid rubric while an unapplied point draft is being edited', async () => {
    const user = userEvent.setup();
    function Harness() {
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: 'old' });
        return <AssessmentStage lessonPlan={makeGeneratedPlan()} value={value} request={request} onRequestChange={() => {}} onChange={setValue}/>;
    }
    render(<Harness/>);

    const points = screen.getByLabelText('관찰 근거 영역 총점');
    await user.clear(points); await user.type(points, '20');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '안내문과 수행평가지 전체 PDF 저장' })).toBeEnabled();
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
    await user.click(screen.getByRole('button', { name: '관찰 근거 영역 배점 적용' }));
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
    expect(within(map).getAllByText(/관찰 근거 복사본/).length).toBeGreaterThan(0);
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

    expect(within(preview).getByText((_, node) => node?.tagName === 'DD' && node.textContent.includes('피드백을 반영한 최종 탐구 포스터'))).toBeInTheDocument();
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

test('전체 재생성 후보를 받은 뒤 현재 평가를 수정하면 후보 적용을 차단하고 편집본을 보존한다', async () => {
    const user = userEvent.setup();
    const candidate = makeAssessment(); candidate.task.title = 'AI 후보 과제';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ assessment: candidate })));
    function Harness() {
        const lessonPlan = makeGeneratedPlan();
        const [value, setValue] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        return <AssessmentStage lessonPlan={lessonPlan} value={value} request={request} onRequestChange={() => {}} onChange={setValue}/>;
    }
    render(<Harness/>);

    await user.click(screen.getByRole('button', { name: '수행평가 다시 생성' }));
    expect(await screen.findByText('AI 후보 과제')).toBeInTheDocument();
    const taskName = screen.getByLabelText('과제명');
    await user.clear(taskName); await user.type(taskName, '교사가 수정한 현재 과제');
    await user.click(screen.getByRole('button', { name: '새 후보 적용' }));

    expect(screen.getByRole('alert')).toHaveTextContent('현재 평가가 바뀌었습니다');
    expect(taskName).toHaveValue('교사가 수정한 현재 과제');
});

test('안내문과 제출용 수행평가지를 구분해 저장하고 안내문을 끄면 안내문 내보내기를 숨긴다', () => {
    const lessonPlan = makeGeneratedPlan();
    render(<AssessmentStage lessonPlan={lessonPlan} value={{ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false }} request={request} onRequestChange={() => {}} onChange={() => {}}/>);

    expect(screen.getByRole('button', { name: '학생 안내문 PDF 저장' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '학생 안내문 HWPX 저장' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '제출용 수행평가지 PDF 저장' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '제출용 수행평가지 HWPX 저장' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '안내문과 수행평가지 전체 PDF 저장' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '실제 수행평가지 편집' })).toBeInTheDocument();
    expect(screen.getByLabelText('문항 1 유형')).toHaveValue('table-chart');
    expect(screen.getByDisplayValue('뿌리, 줄기, 잎에서 관찰한 특징을 표에 기록하세요.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '학생이 작성할 수행평가지 미리보기' })).toHaveTextContent('뿌리, 줄기, 잎에서 관찰한 특징을 표에 기록하세요.');

    document.body.innerHTML = '';
    const value = { ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false, includeStudentCover: false };
    render(<AssessmentStage lessonPlan={lessonPlan} value={value} request={{ ...request, includeStudentCover: false }} onRequestChange={() => {}} onChange={() => {}}/>);

    expect(screen.queryByRole('heading', { name: '학생용 수행평가 안내 표지' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '학생 안내문 PDF 저장' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '제출용 수행평가지 PDF 저장' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '안내문과 수행평가지 전체 PDF 저장' })).not.toBeInTheDocument();
    expect(screen.getByText('학생당 안내 표지를 사용하지 않습니다.')).toBeInTheDocument();
});

test('표지 미리보기는 과목·전이 목표·GRASPS·제출 조건·준비물·유의점을 현재 평가에서 읽는다', () => {
    const lessonPlan = makeGeneratedPlan();
    render(<AssessmentStage lessonPlan={lessonPlan} value={{ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false }} request={request} onRequestChange={() => {}} onChange={() => {}}/>);
    const preview = screen.getByRole('region', { name: '학생용 안내 표지 미리보기' });

    for (const content of ['과학', '새로운 식물을 관찰할 때도', '관찰 근거를 사용해 식물 기관의 구조와 기능', '학교 화단 식물의 건강 상태', '식물 탐구자', '학급 친구', '관찰 근거가 담긴 한 쪽 탐구 보고서', '관찰 사실과 해석을 구분하고', '수업 시간 40분', '식물 표본', '식물을 훼손하지 않는다']) {
        expect(within(preview).getByText(new RegExp(content))).toBeInTheDocument();
    }
});

test('알려진 정합성 경고는 교사가 실행할 수 있는 수정 방법과 함께 보여준다', () => {
    const lessonPlan = makeGeneratedPlan();
    const assessment = makeAssessment();
    assessment.backwardDesign.alignmentIssues = [{ id: 'warn-1', severity: 'warning', code: 'task-authenticity', message: '과제 맥락을 더 실제적으로 확인하세요.', repairAction: '상황과 공유 대상을 현재 학급 맥락에 맞게 수정하세요.', resolved: false }];
    render(<AssessmentStage lessonPlan={lessonPlan} value={{ ...assessment, sourceHash: sourceHash(lessonPlan), approved: false }} request={request} onRequestChange={() => {}} onChange={() => {}}/>);

    expect(screen.getByText(/과제 맥락을 더 실제적으로/)).toBeInTheDocument();
    expect(screen.getByText(/상황과 공유 대상을 현재 학급 맥락에 맞게/)).toBeInTheDocument();
});

test('교사가 전체 총점과 수준 수를 적용하면 평가와 authoritative request가 함께 갱신되어 내보낼 수 있다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [assessment, setAssessment] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        const [assessmentRequest, setAssessmentRequest] = useState(request);
        return <><output data-testid="request-total">{assessmentRequest.totalPoints}</output><output data-testid="request-levels">{assessmentRequest.levelCount}</output><AssessmentStage lessonPlan={lessonPlan} value={assessment} request={assessmentRequest} onRequestChange={setAssessmentRequest} onChange={setAssessment}/></>;
    }
    render(<Harness/>);

    const total = screen.getByLabelText('전체 총점');
    await user.clear(total); await user.type(total, '60');
    await user.click(screen.getByRole('button', { name: '전체 총점과 배점 적용' }));
    expect(screen.getByTestId('request-total')).toHaveTextContent('60');
    expect(screen.getByRole('button', { name: '안내문과 수행평가지 전체 PDF 저장' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '성취수준 추가' }));
    expect(screen.getByTestId('request-levels')).toHaveTextContent('5');
    expect(screen.getByRole('button', { name: '안내문과 수행평가지 전체 PDF 저장' })).toBeEnabled();
});

test('적용할 수 없는 전체 총점은 기존 평가와 request를 그대로 보존한다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [assessment, setAssessment] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        const [assessmentRequest, setAssessmentRequest] = useState(request);
        return <><output data-testid="request-total">{assessmentRequest.totalPoints}</output><AssessmentStage lessonPlan={lessonPlan} value={assessment} request={assessmentRequest} onRequestChange={setAssessmentRequest} onChange={setAssessment}/></>;
    }
    render(<Harness/>);
    const total = screen.getByLabelText('전체 총점');
    await user.clear(total); await user.type(total, '1');
    await user.click(screen.getByRole('button', { name: '전체 총점과 배점 적용' }));

    expect(screen.getByRole('alert')).toHaveTextContent('적용할 수 없습니다');
    expect(screen.getByTestId('request-total')).toHaveTextContent('100');
});

test('영역 총점 적용도 전체 총점·과정 비중·수준별 점수를 하나의 유효 계약으로 갱신한다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [assessment, setAssessment] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        const [assessmentRequest, setAssessmentRequest] = useState(request);
        return <><output data-testid="request-total">{assessmentRequest.totalPoints}</output><output data-testid="request-process">{assessmentRequest.processWeightPercent}</output><AssessmentStage lessonPlan={lessonPlan} value={assessment} request={assessmentRequest} onRequestChange={setAssessmentRequest} onChange={setAssessment}/></>;
    }
    render(<Harness/>);
    const points = screen.getByLabelText('관찰 근거 영역 총점');
    await user.clear(points); await user.type(points, '45');
    await user.click(screen.getByRole('button', { name: '관찰 근거 영역 배점 적용' }));

    expect(screen.getByTestId('request-total')).toHaveTextContent('105');
    expect(screen.getByTestId('request-process')).toHaveTextContent('19');
    expect(screen.getByLabelText('관찰 근거 탁월 점수')).toHaveValue(45);
    expect(screen.getByRole('button', { name: '안내문과 수행평가지 전체 PDF 저장' })).toBeEnabled();
});

test('수준 점수가 0이어도 입력을 비운 뒤 새 점수로 편하게 덮어쓸 수 있다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const initial = makeAssessment();
        initial.rubric.criteria[0].levels[3].score = 0;
        const [assessment, setAssessment] = useState({ ...initial, sourceHash: sourceHash(lessonPlan), approved: false });
        return <><output data-testid="edited-level-score">{assessment.rubric.criteria[0].levels[3].score}</output><AssessmentStage lessonPlan={lessonPlan} value={assessment} request={request} onRequestChange={() => {}} onChange={setAssessment}/></>;
    }
    render(<Harness/>);
    const score = screen.getByLabelText('관찰 근거 보완 필요 점수');

    await user.clear(score);
    expect(score).toHaveValue(null);
    await user.type(score, '7');
    await user.tab();

    expect(score).toHaveValue(7);
    expect(screen.getByTestId('edited-level-score')).toHaveTextContent('7');
});

test('적용할 수 없는 영역 총점은 기존 평가와 request를 그대로 보존한다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [assessment, setAssessment] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        const [assessmentRequest, setAssessmentRequest] = useState(request);
        return <><output data-testid="request-total">{assessmentRequest.totalPoints}</output><output data-testid="criterion-max">{assessment.rubric.criteria[0].maxPoints}</output><AssessmentStage lessonPlan={lessonPlan} value={assessment} request={assessmentRequest} onRequestChange={setAssessmentRequest} onChange={setAssessment}/></>;
    }
    render(<Harness/>);
    const points = screen.getByLabelText('관찰 근거 영역 총점');
    await user.clear(points); await user.type(points, '1');
    await user.click(screen.getByRole('button', { name: '관찰 근거 영역 배점 적용' }));

    expect(screen.getByRole('alert')).toHaveTextContent('최소 3점');
    expect(screen.getByTestId('request-total')).toHaveTextContent('100');
    expect(screen.getByTestId('criterion-max')).toHaveTextContent('40');
});

test('직접 입력 표지 항목은 이미 존재하는 필수 singleton 유형으로 바꿀 수 없다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    function Harness() {
        const [assessment, setAssessment] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        return <AssessmentStage lessonPlan={lessonPlan} value={assessment} request={request} onRequestChange={() => {}} onChange={setAssessment}/>;
    }
    render(<Harness/>);
    await user.click(screen.getByRole('button', { name: '표지 항목 추가' }));
    const group = screen.getByRole('group', { name: /새 안내/ });
    const type = within(group).getByLabelText('항목 유형');

    expect(within(type).queryByRole('option', { name: '평가 기준' })).not.toBeInTheDocument();
    expect(within(group).getByRole('button', { name: '삭제' })).toBeEnabled();
});

test('연결표 화면은 증거 구분과 점수 근거를 함께 보여준다', () => {
    const lessonPlan = makeGeneratedPlan();
    render(<AssessmentStage lessonPlan={lessonPlan} value={{ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false }} request={request} onRequestChange={() => {}} onChange={() => {}}/>);
    const map = screen.getByRole('heading', { name: '성취기준 ↔ 과제 ↔ 평가영역 연결표' }).closest('section');

    expect(within(map).getByText(/증거 구분: 결과 증거, 과정 증거/)).toBeInTheDocument();
    expect(within(map).getByText(/점수 근거:/)).toBeInTheDocument();
});

test('학생 표지 데스크톱 표도 모든 수준의 점수와 수행 설명을 보여준다', () => {
    const lessonPlan = makeGeneratedPlan();
    render(<AssessmentStage lessonPlan={lessonPlan} value={{ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false }} request={request} onRequestChange={() => {}} onChange={() => {}}/>);
    const table = screen.getByRole('table', { name: '표 형식 평가 기준' });

    expect(within(table).getAllByText('40점').length).toBeGreaterThan(0);
    expect(within(table).getByText('모든 기관을 구체적으로 기록함')).toBeInTheDocument();
});

test('표지 PDF가 한 페이지를 넘으면 서버의 구체적인 수정 안내를 그대로 보여주고 편집본을 보존한다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'cover_overflow', message: '학생 안내 표지는 한 페이지에 들어가야 합니다. 표지 문구를 줄여주세요.' }, { status: 422 })));
    render(<AssessmentStage lessonPlan={lessonPlan} value={{ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false }} request={request} onRequestChange={() => {}} onChange={() => {}}/>);

    await user.click(screen.getByRole('button', { name: '학생 안내문 PDF 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('표지 문구를 줄여주세요');
    expect(screen.getByLabelText('과제명')).toHaveValue('식물 기관 탐구 보고서 만들기');
});

test('교사가 고친 루브릭을 네 가지 형식으로 내려받을 수 있다', async () => {
    const user = userEvent.setup();
    const lessonPlan = makeGeneratedPlan();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createObjectURL = vi.fn(() => 'blob:rubric');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['rubric']))));
    function Harness() {
        const [assessment, setAssessment] = useState({ ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false });
        return <AssessmentStage lessonPlan={lessonPlan} value={assessment} request={request} onRequestChange={() => {}} onChange={setAssessment}/>;
    }
    render(<Harness/>);

    const name = screen.getAllByLabelText('영역명')[0];
    await user.clear(name);
    await user.type(name, '교사가 고친 관찰 근거');
    expect(screen.getByRole('group', { name: '루브릭 다운로드' })).toBeInTheDocument();
    for (const format of ['PDF', 'HWPX', 'DOCX', 'Excel']) expect(screen.getByRole('button', { name: `루브릭 ${format} 저장` })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '루브릭 HWPX 저장' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/export-rubric/hwpx', expect.objectContaining({
        body: expect.stringContaining('교사가 고친 관찰 근거'),
    })));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rubric');
    expect(click).toHaveBeenCalled();
});

test('수행과제 편집기는 선택한 평가 방식에만 GRASPS 용어를 사용한다', () => {
    const lessonPlan = makeGeneratedPlan();
    const backwardAssessment = { ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false };
    const first = render(<AssessmentStage lessonPlan={lessonPlan} value={backwardAssessment} request={{ ...request, assessmentApproachId: 'backward-design' }} onRequestChange={() => {}} onChange={() => {}}/>);

    expect(screen.getByText(/선택한 평가 설계 방식에 맞게 목표·역할·대상·상황·산출물·성공 기준/)).toBeInTheDocument();
    expect(screen.queryByText(/GRASPS의 목표/)).not.toBeInTheDocument();
    expect(screen.getByText('평가 목표')).toBeInTheDocument();
    expect(screen.queryByText('평가 목표(G)')).not.toBeInTheDocument();

    first.unmount();
    const graspsAssessment = structuredClone(backwardAssessment);
    graspsAssessment.generationSettings.assessmentApproachId = 'authentic-performance';
    render(<AssessmentStage lessonPlan={lessonPlan} value={graspsAssessment} request={{ ...request, assessmentApproachId: 'authentic-performance' }} onRequestChange={() => {}} onChange={() => {}}/>);

    expect(screen.getByText(/GRASPS의 목표·역할·대상·상황·산출물·성공 기준/)).toBeInTheDocument();
    expect(screen.getByText('평가 목표(G)')).toBeInTheDocument();
});
