import { afterEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/grade-submission/route';
import { makeAssessment } from './fixtures/workflow.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
const extractedText = '관찰 결과 뿌리에 가는 털이 있다. 뿌리는 물을 흡수한다. 줄기는 물질을 운반한다.';
const output = { criteria: [
    { criterionId: 'criterion-1', score: 35, evidence: '뿌리에 가는 털이 있다', feedback: '관찰 근거가 구체적입니다.' },
    { criterionId: 'criterion-2', score: 35, evidence: '뿌리는 물을 흡수한다', feedback: '구조와 기능을 연결했습니다.' },
    { criterionId: 'criterion-3', score: 15, evidence: '관찰 결과', feedback: '수정 과정의 근거를 확인했습니다.' },
], summary: '관찰 사실을 기능 설명에 활용했습니다.', nextSteps: '다른 기관도 설명해보세요.' };
const request = body => new Request('http://localhost/api/grade-submission', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });
const approvedAssessment = () => ({ ...makeAssessment(), sourceHash: 'lesson-source', approved: true });

test('calculates total score on the server from bounded criterion scores', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key'; vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(output)));
    const response = await POST(request({ assessment: approvedAssessment(), studentName: '김학생', extractedText }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.grading.totalScore).toBe(85);
});

test('repairs criterion scores above the rubric maximum', async () => {
    const invalid = structuredClone(output); invalid.criteria[0].score = 50;
    process.env.UPSTAGE_API_KEY = 'test-key'; vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(invalid)).mockResolvedValueOnce(completion(output)));

    const response = await POST(request({ assessment: approvedAssessment(), studentName: '김학생', extractedText }));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('rejects grading against a rubric that the teacher has not approved', async () => {
    const response = await POST(request({ assessment: { ...makeAssessment(), sourceHash: 'lesson-source', approved: false }, studentName: '김학생', extractedText }));
    expect(response.status).toBe(400);
});

test('수식·도표·그림 분석이 필요한 평가는 원본 확인 전 자동 점수를 만들지 않는다', async () => {
    const assessment = approvedAssessment();
    assessment.visualAnalysisRequired = true;
    vi.stubGlobal('fetch', vi.fn());

    const response = await POST(request({ assessment, studentName: '김학생', extractedText }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('visual_review_required');
    expect(body.teacherReview.totalScore).toBeNull();
    expect(body.teacherReview.criteria.every(item => item.score === null)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
});
