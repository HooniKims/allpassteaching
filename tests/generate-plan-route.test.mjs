import { afterEach, test, expect, vi } from 'vitest';
import { POST } from '@/app/api/generate-plan/route';
import { generationDraft, makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
const request = body => new Request('http://localhost/api/generate-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

test('returns a validated lesson plan', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key'; vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(makeGeneratedPlan())));
    const response = await POST(request(generationDraft));
    expect(response.status).toBe(200); expect((await response.json()).plan.title).toBe('식물의 구조와 기능');
});

test('rejects hallucinated standards after one repair attempt', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key'; const invalid = makeGeneratedPlan({ standards: [{ code: 'NOT-REAL', text: '가짜' }] });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => completion(invalid)));
    const response = await POST(request(generationDraft));
    expect(response.status).toBe(422); expect((await response.json()).code).toBe('invalid_generation');
    expect(fetch).toHaveBeenCalledTimes(2);
});
