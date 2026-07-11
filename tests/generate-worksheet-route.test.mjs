import { afterEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/generate-worksheet/route';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeWorksheet } from './fixtures/workflow.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
const request = body => new Request('http://localhost/api/generate-worksheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

test('returns a validated worksheet in the teacher-selected format', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(makeWorksheet())));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), selectedFormatId: 'inquiry-experiment' }));

    expect(response.status).toBe(200);
    expect((await response.json()).worksheet.formatId).toBe('inquiry-experiment');
    expect(fetch).toHaveBeenCalledOnce();
});

test('repairs a worksheet that ignores the teacher-selected format', async () => {
    const invalid = makeWorksheet(); invalid.formatId = 'project'; invalid.formatName = '프로젝트 계획지';
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(invalid)).mockResolvedValueOnce(completion(makeWorksheet())));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), selectedFormatId: 'inquiry-experiment' }));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});
