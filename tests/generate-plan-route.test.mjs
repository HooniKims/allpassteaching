import { afterEach, test, expect, vi } from 'vitest';
import { POST } from '@/app/api/generate-plan/route';
import { generationDraft, makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
const request = body => new Request('http://localhost/api/generate-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

test('returns a validated lesson plan', async () => {
    const metadata = { date: '2026-07-11T09:00', place: '과학실', className: '5학년 1반', teacherName: '김교사' };
    const draft = { ...generationDraft, basics: { ...generationDraft.basics, metadata } };
    process.env.UPSTAGE_API_KEY = 'test-key'; vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(makeGeneratedPlan({ metadata }))));

    const response = await POST(request(draft));

    expect(response.status).toBe(200);
    expect((await response.json()).plan.metadata).toEqual(metadata);
    const upstreamRequest = JSON.parse(fetch.mock.calls[0][1].body);
    const modelDraft = JSON.parse(upstreamRequest.messages[1].content);
    expect(modelDraft.basics.metadata).toEqual(metadata);
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
