import { afterEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/generate-assessment/route';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment } from './fixtures/workflow.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
const request = body => new Request('http://localhost/api/generate-assessment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });
const assessmentRequest = {
    assessmentName: '식물 기관 탐구 수행평가', teacherIntent: makeAssessment().backwardDesign.teacherIntent,
    totalPoints: 100, levelCount: 4, includeProcessInScore: true, processWeightPercent: 20,
    outputTypes: ['탐구 보고서'], answerTypes: ['서술형'], stages: { draft: true, checkpoint: true, revision: true, final: true },
    visualAnalysisRequired: false, includeStudentCover: true, additionalRequirements: '',
};

test('returns a validated performance task and rubric', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(makeAssessment())));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), assessmentRequest }));

    expect(response.status).toBe(200);
    expect((await response.json()).assessment.totalPoints).toBe(100);
});

test('repairs a rubric whose point total is not 100', async () => {
    const invalid = makeAssessment(); invalid.rubric.criteria[0].maxPoints = 20;
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(invalid)).mockResolvedValueOnce(completion(makeAssessment())));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), assessmentRequest }));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('rejects generation when the required desired result is empty', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), assessmentRequest: { ...assessmentRequest, teacherIntent: { ...assessmentRequest.teacherIntent, desiredResult: '' } } }));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
});
