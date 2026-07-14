import { afterEach, test, expect, vi } from 'vitest';
import { POST } from '@/app/api/generate-plan/route';
import { generationDraft, makeGeneratedPlan, makeTwoSessionPlan } from './fixtures/lesson-plan.mjs';
import { instructionModels } from '@/data/instruction-models';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
const request = body => new Request('http://localhost/api/generate-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const completionContent = content => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const completion = value => completionContent(JSON.stringify(value));

function integratedDraftAndPlan() {
    const integrated = instructionModels.find(item => item.id === 'integrated');
    const primaryStandard = generationDraft.standards[0];
    const secondaryStandard = { code: '6수04-02', text: '자료를 수집하여 그래프로 나타내고 해석할 수 있다.', subject: '수학' };
    const draft = {
        ...generationDraft,
        standards: [primaryStandard, secondaryStandard],
        instructionModel: integrated,
        integration: {
            primarySubject: '과학', secondarySubject: '수학',
            primaryStandards: [primaryStandard], secondaryStandards: [secondaryStandard],
        },
    };
    const plan = makeGeneratedPlan({
        standards: [primaryStandard, secondaryStandard],
        instructionModel: { id: integrated.id, name: integrated.name, reason: '관찰 자료를 그래프로 해석해 통합하기 위해' },
    });
    plan.sessions[0].stages[0].learningElement = '공통 맥락·문제';
    plan.sessions[0].stages[0].teacherActivities = ['공통 맥락·문제: 과학 관찰과 수학 표현이 함께 필요한 공동 문제를 제시한다.', '공통 맥락·문제: 두 교과의 역할을 질문한다.'];
    plan.sessions[0].stages[0].studentActivities = ['공통 맥락·문제: 과학과 수학이 필요한 까닭을 찾는다.', '공통 맥락·문제: 공동 문제 지도를 만든다.'];
    plan.sessions[0].stages[1].learningElement = '교과 관점 탐구 · 관점 통합';
    plan.sessions[0].stages[1].teacherActivities = ['교과 관점 탐구: 과학 관찰 근거와 수학 그래프를 탐구하도록 안내한다.', '관점 통합: 근거 사이의 관계를 묻는다.'];
    plan.sessions[0].stages[1].studentActivities = ['교과 관점 탐구: 과학 자료를 수학 그래프로 나타낸다.', '관점 통합: 두 관점을 융합한 설명 산출물을 만든다.'];
    plan.sessions[0].stages[2].learningElement = '적용·성찰';
    plan.sessions[0].stages[2].teacherActivities = ['적용·성찰: 융합 설명을 새 사례에 적용하도록 돕는다.', '적용·성찰: 교과별 기여를 성찰하게 한다.'];
    plan.sessions[0].stages[2].studentActivities = ['적용·성찰: 통합 결과물을 발표한다.', '적용·성찰: 과학과 수학의 기여를 성찰한다.'];
    plan.assessment[0].evidence = '과학 관찰과 수학 그래프를 통합한 설명 산출물';
    plan.detailedPlan.teachingStrategy = '과학 관찰과 수학 그래프 해석을 단계적으로 통합해 공동 산출물을 만드는 융합수업 전략을 적용한다.';
    return { draft, plan };
}

test('returns a consistent 400 response for malformed request JSON', async () => {
    const malformedRequest = new Request('http://localhost/api/generate-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });

    const response = await POST(malformedRequest);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ code: 'invalid_request', message: expect.any(String) }));
});

test('융합수업은 서로 다른 두 교과와 각 교과 성취기준이 없으면 생성 요청을 거부한다', async () => {
    const integrated = instructionModels.find(item => item.id === 'integrated');
    const response = await POST(request({ ...generationDraft, instructionModel: integrated }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ code: 'invalid_request', issues: expect.any(Array) }));
});

test('융합수업은 교과별 성취기준과 전체 성취기준 목록이 다르면 생성 요청을 거부한다', async () => {
    const integrated = instructionModels.find(item => item.id === 'integrated');
    const primaryStandard = generationDraft.standards[0];
    const secondaryStandard = { code: '6수04-01', text: '자료를 수집하여 그림그래프나 띠그래프로 나타낼 수 있다.', subject: '수학' };
    const response = await POST(request({
        ...generationDraft,
        instructionModel: integrated,
        standards: [primaryStandard],
        integration: {
            primarySubject: '과학',
            secondarySubject: '수학',
            primaryStandards: [primaryStandard],
            secondaryStandards: [secondaryStandard],
        },
    }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({ code: 'invalid_request' }));
    expect(body.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ['standards'] }),
    ]));
});

test('융합수업 생성 결과는 두 교과 관점과 통합 산출물이 실제 활동에 있어야 통과한다', async () => {
    const { draft, plan } = integratedDraftAndPlan();
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(plan)));

    const response = await POST(request(draft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
});

test('융합수업 활동에서 교과별 관점과 통합 산출물이 빠지면 복구 생성을 요청한다', async () => {
    const { draft, plan } = integratedDraftAndPlan();
    const generic = structuredClone(plan);
    generic.sessions[0].stages.forEach(stage => {
        stage.teacherActivities = ['활동을 안내한다.', '질문을 제시한다.'];
        stage.studentActivities = ['자료를 살펴본다.', '생각을 나눈다.'];
        stage.expectedStudentResponses = ['자료의 특징을 말합니다.'];
        stage.materialsAndNotes = [];
    });
    generic.assessment[0] = { ...generic.assessment[0], element: '내용 이해', method: '관찰', evidence: '학습 기록', feedback: '근거를 보완한다.' };
    generic.detailedPlan.teachingStrategy = '학습자의 참여를 돕는 질문과 단계별 피드백을 활용하고, 수업 중 관찰 결과에 따라 지원 방법을 조정한다.';
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(generic)).mockResolvedValueOnce(completion(plan)));

    const response = await POST(request(draft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    const repairRequest = JSON.parse(fetch.mock.calls[1][1].body);
    expect(repairRequest.messages.at(-1).content).toContain('과학 관점·활동');
    expect(repairRequest.messages.at(-1).content).toContain('공동 산출물');
});

test('returns a validated lesson plan', async () => {
    const metadata = { date: '2026-07-11', period: '2', place: '과학실', className: '5학년 1반', teacherName: '김교사' };
    const draft = { ...generationDraft, basics: { ...generationDraft.basics, metadata } };
    const generated = makeGeneratedPlan({ metadata });
    process.env.UPSTAGE_API_KEY = 'test-key'; vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(generated)));

    const response = await POST(request(draft));

    expect(response.status).toBe(200);
    expect((await response.json()).plan).toEqual(generated);
    expect(fetch).toHaveBeenCalledOnce();
    const upstreamRequest = JSON.parse(fetch.mock.calls[0][1].body);
    const modelDraft = JSON.parse(upstreamRequest.messages[1].content);
    expect(modelDraft.basics.metadata).toEqual(metadata);
});

const generationInvariantCases = [
    ['schoolLevel', plan => { plan.schoolLevel = 'middle'; }],
    ['grade', plan => { plan.grade = '6'; }],
    ['subject', plan => { plan.subject = '사회'; }],
    ['instructionModel.id', plan => { plan.instructionModel.id = 'direct'; }],
    ['instructionModel.name', plan => { plan.instructionModel.name = '직접 교수 모형'; }],
];

test.each(generationInvariantCases)('repairs generated %s that differs from the selected draft', async (_field, changePlan) => {
    const invalid = makeGeneratedPlan();
    changePlan(invalid);
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(invalid)).mockResolvedValueOnce(completion(makeGeneratedPlan())));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('keeps the AI-generated instruction model reason without triggering repair', async () => {
    const generated = makeGeneratedPlan({ instructionModel: { ...makeGeneratedPlan().instructionModel, reason: 'AI가 수업 맥락에 맞춰 작성한 선정 이유' } });
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(generated)));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(200);
    expect((await response.json()).plan.instructionModel.reason).toBe(generated.instructionModel.reason);
    expect(fetch).toHaveBeenCalledOnce();
});

test('repairs a plan that names the selected model but omits its stage evidence', async () => {
    const invalid = makeGeneratedPlan();
    invalid.sessions[0].stages.forEach(stage => { stage.learningElement = stage.phase; });
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(invalid)).mockResolvedValueOnce(completion(makeGeneratedPlan())));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    const repairRequest = JSON.parse(fetch.mock.calls[1][1].body);
    expect(repairRequest.messages.at(-1).content).toContain('가설 설정');
});

test('구체적인 활동은 유지하고 누락된 수업 모형 단계 라벨을 서버에서 보완한다', async () => {
    const generated = makeGeneratedPlan();
    generated.sessions[0].stages[0].learningElement = '문제 인식 · 문제 인식 · 가설 설정';
    generated.sessions[0].stages.forEach(stage => {
        stage.teacherActivities = stage.teacherActivities.map(item => item.replace(/^[^:]+:\s*/, ''));
        stage.studentActivities = stage.studentActivities.map(item => item.replace(/^[^:]+:\s*/, ''));
    });
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(generated)));

    const response = await POST(request(generationDraft));
    const plan = (await response.json()).plan;

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect(plan.sessions[0].stages[0].teacherActivities.join('\n')).toContain('문제 인식:');
    expect(plan.sessions[0].stages[0].studentActivities.join('\n')).toContain('가설 설정:');
    expect(plan.sessions[0].stages[1].teacherActivities.join('\n')).toContain('탐구 수행:');
    expect(plan.sessions[0].stages[0].learningElement).toBe('문제 인식 · 가설 설정');
});

test('accepts unordered TPACK checks without turning them into lesson phases', async () => {
    const tpack = instructionModels.find(model => model.id === 'tpack');
    const draft = { ...generationDraft, instructionModel: tpack };
    const generated = makeGeneratedPlan({ instructionModel: { id: tpack.id, name: tpack.name, reason: '학습 목표에 맞는 기술 활용 점검' } });
    generated.sessions[0].stages[0].learningElement = '수업 맥락과 목표 확인';
    generated.sessions[0].stages[0].materialsAndNotes = ['설계 점검: 기술 적합성 검토 · 내용·목표 확인'];
    generated.sessions[0].stages[0].teacherActivities = ['내용·목표 확인: 학습 목표를 확인한다.', '기술 적합성 검토: 접근성과 대체 수단을 확인한다.'];
    generated.sessions[0].stages[1].learningElement = '핵심 학습 활동';
    generated.sessions[0].stages[1].materialsAndNotes = ['설계 점검: 통합·맥락 점검 · 교수법 선택'];
    generated.sessions[0].stages[1].studentActivities = ['교수법 선택: 협력 탐구를 수행한다.', '통합·맥락 점검: 기술 활용의 효과를 성찰한다.'];
    generated.sessions[0].stages[2].learningElement = '학습 결과와 기술 활용 성찰';
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(generated)));

    const response = await POST(request(draft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect((await response.json()).plan.sessions[0].stages.map(stage => stage.learningElement)).toEqual([
        '수업 맥락과 목표 확인', '핵심 학습 활동', '학습 결과와 기술 활용 성찰',
    ]);
});

test.each(generationInvariantCases)('returns 422 when generated %s still differs after repair', async (_field, changePlan) => {
    const invalid = makeGeneratedPlan();
    changePlan(invalid);
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(invalid)));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual(expect.objectContaining({ code: 'invalid_generation' }));
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('defaults omitted request metadata before generation', async () => {
    const draft = structuredClone(generationDraft);
    delete draft.basics.metadata;
    process.env.UPSTAGE_API_KEY = 'test-key'; vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(makeGeneratedPlan())));

    const response = await POST(request(draft));

    expect(response.status).toBe(200);
    const upstreamRequest = JSON.parse(fetch.mock.calls[0][1].body);
    const modelDraft = JSON.parse(upstreamRequest.messages[1].content);
    expect(modelDraft.basics.metadata).toEqual({ date: '', period: '', place: '', className: '', teacherName: '' });
});

test('preserves requested metadata when the generated plan fills an empty date', async () => {
    const metadata = { date: '', period: '3', place: '과학실', className: '합성 1학년 1반', teacherName: '검증 교사' };
    const draft = { ...generationDraft, basics: { ...generationDraft.basics, metadata } };
    const generated = makeGeneratedPlan({ metadata: { ...metadata, date: '2026-07-13' } });
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion(generated))));

    const response = await POST(request(draft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect((await response.json()).plan.metadata).toEqual(metadata);
});

test('preserves requested metadata when the generated plan changes populated information', async () => {
    const metadata = { date: '2026-07-11', period: '2', place: '과학실', className: '5학년 1반', teacherName: '김교사' };
    const draft = { ...generationDraft, basics: { ...generationDraft.basics, metadata } };
    const changed = makeGeneratedPlan({ metadata: { ...metadata, place: '운동장' } });
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion(changed))));

    const response = await POST(request(draft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect((await response.json()).plan.metadata).toEqual(metadata);
});

test('preserves teacher metadata when the generated plan omits the metadata object', async () => {
    const invalid = makeGeneratedPlan({ metadata: {} });
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(invalid)));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect((await response.json()).plan.metadata).toEqual(generationDraft.basics.metadata);
});

test.each(['date', 'place', 'className', 'teacherName'])('preserves teacher metadata when generated metadata.%s is missing', async key => {
    const invalid = structuredClone(makeGeneratedPlan());
    delete invalid.metadata[key];
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(invalid)));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect((await response.json()).plan.metadata).toEqual(generationDraft.basics.metadata);
});

test('repairs a fresh response that omits a defaulted stage field', async () => {
    const invalid = structuredClone(makeGeneratedPlan());
    delete invalid.sessions[0].stages[0].materialsAndNotes;
    const repaired = makeGeneratedPlan();
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(invalid)).mockResolvedValueOnce(completion(repaired)));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('repairs a fresh response that is missing required detail fields', async () => {
    const legacy = structuredClone(makeGeneratedPlan());
    delete legacy.essentialQuestion;
    delete legacy.sessions[0].stages[0].teacherQuestions;
    delete legacy.assessment[0].levelFeedback;
    const repaired = makeGeneratedPlan();
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(legacy)).mockResolvedValueOnce(completion(repaired)));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    const repairRequest = JSON.parse(fetch.mock.calls[1][1].body);
    expect(repairRequest.messages.at(-1).content).toContain('essentialQuestion');
    expect(repairRequest.messages[0].content).toContain('teacherQuestions');
    expect((await response.json()).plan.essentialQuestion).toBe(repaired.essentialQuestion);
});

test('repairs malformed JSON from the first generation attempt', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completionContent('{malformed')).mockResolvedValueOnce(completion(makeGeneratedPlan())));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    const repairRequest = JSON.parse(fetch.mock.calls[1][1].body);
    expect(repairRequest.messages.at(-2).content).toBe('{malformed');
    expect(repairRequest.messages.at(-1).content).toContain('JSON');
});

test('returns 422 when repaired generation JSON remains malformed', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completionContent('{malformed')));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('invalid_generation');
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('returns 422 when missing detail fields remain invalid after repair', async () => {
    const legacy = structuredClone(makeGeneratedPlan());
    delete legacy.essentialQuestion;
    delete legacy.sessions[0].stages[0].teacherQuestions;
    delete legacy.assessment[0].levelFeedback;
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(legacy)));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('invalid_generation');
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('rejects a changed standard source text after one repair attempt', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key'; const invalid = makeGeneratedPlan({ standards: [{ code: generationDraft.standards[0].code, text: '바뀐 원문' }] });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(invalid)));
    const response = await POST(request(generationDraft));
    expect(response.status).toBe(422); expect((await response.json()).code).toBe('invalid_generation');
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('rejects duplicate standards that omit another selected standard', async () => {
    const secondStandard = { code: '6과11-03', text: '식물의 구조와 기능을 환경과 관련지어 설명한다.' };
    const draft = { ...generationDraft, standards: [...generationDraft.standards, secondStandard] };
    const duplicated = makeGeneratedPlan({ standards: [generationDraft.standards[0], generationDraft.standards[0]] });
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(duplicated)));

    const response = await POST(request(draft));

    expect(response.status).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('rejects sessions whose minutes differ from the requested duration', async () => {
    const invalid = structuredClone(makeGeneratedPlan());
    invalid.sessions[0].sessionMinutes = 35;
    invalid.sessions[0].stages[1].minutes = 25;
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(invalid)));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('rejects sessions without the exact introduction-development-closing phases', async () => {
    const invalid = structuredClone(makeGeneratedPlan());
    invalid.sessions[0].stages[1].phase = '도입';
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(invalid)));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('repairs multi-session order that does not match array order', async () => {
    const draft = { ...generationDraft, basics: { ...generationDraft.basics, mode: 'multi', sessions: 2 } };
    const invalid = makeTwoSessionPlan();
    invalid.sessions[1].order = 1;
    const repaired = makeTwoSessionPlan();
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(invalid)).mockResolvedValueOnce(completion(repaired)));

    const response = await POST(request(draft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('returns 422 when duplicate session ids remain after repair', async () => {
    const draft = { ...generationDraft, basics: { ...generationDraft.basics, mode: 'multi', sessions: 2 } };
    const invalid = makeTwoSessionPlan();
    invalid.sessions[1].id = invalid.sessions[0].id;
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(invalid)));

    const response = await POST(request(draft));

    expect(response.status).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(2);
});
