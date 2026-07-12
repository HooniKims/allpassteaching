import { afterEach, expect, test, vi } from 'vitest';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });

const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

test('Given a canonical lesson and desired result When intent help is requested Then only observable success and growth suggestions return', async () => {
    const { POST } = await import('@/app/api/suggest-assessment-intent/route');
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion({ evidenceOfSuccess: '관찰 기록과 설명을 보여준다.', growthProcess: '초안과 수정 이유를 보여준다.' })));
    const request = new Request('http://localhost/api/suggest-assessment-intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonPlan: makeGeneratedPlan(), desiredResult: '구조와 기능을 근거로 설명한다.' }) });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestion: { evidenceOfSuccess: '관찰 기록과 설명을 보여준다.', growthProcess: '초안과 수정 이유를 보여준다.' } });
});

test('Given an empty desired result When intent help is requested Then the route rejects before calling Upstage', async () => {
    const { POST } = await import('@/app/api/suggest-assessment-intent/route');
    vi.stubGlobal('fetch', vi.fn());
    const request = new Request('http://localhost/api/suggest-assessment-intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonPlan: makeGeneratedPlan(), desiredResult: ' ' }) });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
});
