import { afterEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/generate-record/route';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment } from './fixtures/workflow.mjs';
import { gradingSourceHash } from '@/lib/workflow-lineage';
import { sourceHash } from '@/lib/source-hash';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
const text = '관찰한 식물 기관의 특징을 구체적인 문장으로 기록하고, 뿌리의 가는 털과 물 흡수 기능을 연결하여 설명함. 관찰 사실을 근거로 결론을 도출하는 과정이 드러났으며, 다른 기관도 같은 방식으로 비교하려는 학습 방향을 확인함.';
const lessonPlan = makeGeneratedPlan();
const assessment = { ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: true };
const submissionBase = { id: 's1', studentName: '김학생', approved: true, extractedText: '뿌리에 가는 털이 있고 물을 흡수한다.', grading: { criteria: [
    { criterionId: 'criterion-1', score: 35, evidence: '뿌리에 가는 털', feedback: '관찰 근거가 구체적입니다.' },
    { criterionId: 'criterion-2', score: 50, evidence: '물을 흡수한다', feedback: '구조와 기능을 연결했습니다.' },
], totalScore: 85, summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명해보세요.' } };
const submission = { ...submissionBase, sourceHash: gradingSourceHash(assessment, submissionBase.extractedText) };
const request = body => new Request('http://localhost/api/generate-record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

test('generates only from a teacher-approved grading result', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key'; vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion({ text })));
    const response = await POST(request({ lessonPlan, assessment, submission, targetLength: 500 }));

    expect(response.status).toBe(200);
    expect((await response.json()).record.text).toBe(text);
});

test('rejects an unapproved submission before calling the model', async () => {
    const response = await POST(request({ lessonPlan, assessment, submission: { ...submission, approved: false }, targetLength: 500 }));
    expect(response.status).toBe(400);
});

test('repairs score-list language in the generated record', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key'; vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion({ text: `${text} 총점 85점.` })).mockResolvedValueOnce(completion({ text })));
    const response = await POST(request({ lessonPlan, assessment, submission, targetLength: 500 }));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('rejects grading created for an older rubric', async () => {
    const response = await POST(request({ lessonPlan, assessment: { ...assessment, task: { ...assessment.task, title: '바뀐 과제' } }, submission, targetLength: 500 }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('stale_grading');
});

test('rejects an assessment created for a different lesson plan', async () => {
    const response = await POST(request({ lessonPlan: { ...lessonPlan, title: '다른 지도안' }, assessment, submission, targetLength: 500 }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('stale_assessment');
});
