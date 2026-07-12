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

test('교사가 정한 생성 계약과 다른 AI 결과를 두 번 받아도 변경된 선택으로 200 응답하지 않는다', async () => {
    const requested = {
        ...assessmentRequest,
        assessmentName: '교사 지정 생태 포스터 평가', totalPoints: 60, levelCount: 3,
        includeProcessInScore: false, processWeightPercent: 0,
        outputTypes: ['포스터'], answerTypes: ['논술형'],
        stages: { draft: false, checkpoint: true, revision: true, final: true },
        visualAnalysisRequired: true, includeStudentCover: false,
        additionalRequirements: '생태계 상호작용을 도식으로 표현한다.',
    };
    const mismatched = makeAssessment();
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion(mismatched))));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), assessmentRequest: requested }));

    expect(response.status).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('AI가 덧붙이는 메타데이터보다 교사 평가명·과목·산출물·표지·시각 분석 설정을 정규화해 보존한다', async () => {
    const generated = makeAssessment();
    generated.assessmentName = 'AI 임의 이름';
    generated.subject = 'AI 임의 과목';
    generated.visualAnalysisRequired = false;
    generated.includeStudentCover = true;
    generated.task.product = 'AI 임의 보고서';
    const requested = { ...assessmentRequest, assessmentName: '교사 지정 포스터', outputTypes: ['포스터'], answerTypes: ['논술형'], visualAnalysisRequired: true, includeStudentCover: false, additionalRequirements: '도표 포함' };
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(generated)));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), assessmentRequest: requested }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assessment).toMatchObject({ assessmentName: '교사 지정 포스터', subject: '과학', visualAnalysisRequired: true, includeStudentCover: false });
    expect(body.assessment.task.product).toBe('포스터');
    expect(body.assessment.generationSettings).toEqual({ outputTypes: ['포스터'], answerTypes: ['논술형'], stages: requested.stages, additionalRequirements: '도표 포함' });
});
