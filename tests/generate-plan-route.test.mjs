import { afterEach, test, expect, vi } from 'vitest';
import { POST } from '@/app/api/generate-plan/route';
import { generationDraft, makeGeneratedPlan, makeTwoSessionPlan } from './fixtures/lesson-plan.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
const request = body => new Request('http://localhost/api/generate-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const completionContent = content => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const completion = value => completionContent(JSON.stringify(value));

test('returns a consistent 400 response for malformed request JSON', async () => {
    const malformedRequest = new Request('http://localhost/api/generate-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });

    const response = await POST(malformedRequest);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ code: 'invalid_request', message: expect.any(String) }));
});

test('returns a validated lesson plan', async () => {
    const metadata = { date: '2026-07-11T09:00', place: '과학실', className: '5학년 1반', teacherName: '김교사' };
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
    expect(modelDraft.basics.metadata).toEqual({ date: '', place: '', className: '', teacherName: '' });
});

test('repairs generated metadata that differs from the request', async () => {
    const metadata = { date: '2026-07-11T09:00', place: '과학실', className: '5학년 1반', teacherName: '김교사' };
    const draft = { ...generationDraft, basics: { ...generationDraft.basics, metadata } };
    const changed = makeGeneratedPlan({ metadata: { ...metadata, place: '운동장' } });
    const repaired = makeGeneratedPlan({ metadata });
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(changed)).mockResolvedValueOnce(completion(repaired)));

    const response = await POST(request(draft));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((await response.json()).plan.metadata).toEqual(metadata);
});

test('returns 422 when generated metadata keys remain missing after repair', async () => {
    const invalid = makeGeneratedPlan({ metadata: {} });
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(invalid)));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test.each(['date', 'place', 'className', 'teacherName'])('returns 422 when generated metadata.%s remains missing after repair', async key => {
    const invalid = structuredClone(makeGeneratedPlan());
    delete invalid.metadata[key];
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(invalid)));

    const response = await POST(request(generationDraft));

    expect(response.status).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(2);
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
