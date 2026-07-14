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

test('학생 문제지는 생성됐지만 교사용 채점 참고를 누락한 AI 결과도 문제지를 버리지 않고 보완한다', async () => {
    const generated = makeAssessment();
    delete generated.studentSheet.teacherKey;
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion(generated))));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), assessmentRequest }));
    const body = await response.json();
    const questionIds = body.assessment.studentSheet.document.sections.flatMap(section => section.questions.map(question => question.id));

    expect(response.status).toBe(200);
    expect(body.assessment.studentSheet.teacherKey.answers.map(answer => answer.questionId)).toEqual(questionIds);
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
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion(generated))));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), assessmentRequest: requested }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assessment).toMatchObject({ assessmentName: '교사 지정 포스터', subject: '과학', visualAnalysisRequired: true, includeStudentCover: false });
    expect(body.assessment.task.product).toBe('포스터');
    expect(body.assessment.generationSettings).toEqual({ outputTypes: ['포스터'], answerTypes: ['논술형'], stages: requested.stages, additionalRequirements: '도표 포함', assessmentApproachId: 'backward-design' });
});

test('생성 루브릭에서 성취기준 연결표를 다시 만들어 잘못된 AI 참조를 보정한다', async () => {
    const generated = makeAssessment();
    generated.backwardDesign.evidenceMap = [{
        standardCode: '존재하지 않는 성취기준', criterionIds: ['존재하지 않는 평가영역'], taskEvidenceTypes: ['다른 관찰 근거'], evidenceTypes: ['결과 증거'], scoreBasis: '다른 평가영역 10점',
    }];
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion(generated))));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), assessmentRequest }));
    const body = await response.json();
    const expectedCriteria = generated.rubric.criteria;

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect(body.assessment.backwardDesign.evidenceMap).toEqual([{
        standardCode: '6과11-02',
        criterionIds: expectedCriteria.map(criterion => criterion.id),
        taskEvidenceTypes: expectedCriteria.map(criterion => criterion.evidence),
        evidenceTypes: ['결과 증거', '과정 증거'],
        scoreBasis: `${expectedCriteria.map(criterion => `${criterion.name} ${criterion.maxPoints}점`).join(', ')} · 수준별 정의 점수`,
    }]);
});

test('지원 상한인 15개 평가영역을 실제 생성 API 계약으로 통과시킨다', async () => {
    const generated = makeAssessment();
    generated.totalPoints = 150;
    generated.scoring = { includeProcessInScore: false, processWeightPercent: 0, processTargetPoints: 0 };
    generated.rubric.levels = Array.from({ length: 6 }, (_, index) => ({ id: `level-${index + 1}`, label: `${index + 1}수준` }));
    generated.rubric.criteria = Array.from({ length: 15 }, (_, index) => ({
        id: `criterion-${index + 1}`, name: `평가영역 ${index + 1}`, description: `성취 증거 ${index + 1}`, standardCodes: ['6과11-02'], kind: 'outcome', maxPoints: 10, intervalPoints: 1, evidence: `관찰 증거 ${index + 1}`,
        levels: generated.rubric.levels.map((level, levelIndex) => ({ levelId: level.id, score: 10 - levelIndex, description: `${levelIndex + 1}수준 수행 설명` })),
    }));
    generated.backwardDesign.evidenceMap = [{
        standardCode: '6과11-02',
        criterionIds: generated.rubric.criteria.map(criterion => criterion.id),
        taskEvidenceTypes: generated.rubric.criteria.map(criterion => criterion.evidence),
        evidenceTypes: ['결과 증거'],
        scoreBasis: `${generated.rubric.criteria.map(criterion => `${criterion.name} ${criterion.maxPoints}점`).join(', ')} · 수준별 정의 점수`,
    }];
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(generated)));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), assessmentRequest: { ...assessmentRequest, totalPoints: 150, levelCount: 6, includeProcessInScore: false, processWeightPercent: 0 } }));

    expect(response.status).toBe(200);
    expect((await response.json()).assessment.rubric.criteria).toHaveLength(15);
});
