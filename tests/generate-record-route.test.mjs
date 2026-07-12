import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { POST } from '@/app/api/generate-record/route';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment } from './fixtures/workflow.mjs';
import { gradingSourceHash } from '@/lib/workflow-lineage';
import { sourceHash } from '@/lib/source-hash';
import { canonicalGradingOrigin, canonicalGradingProvenance, canonicalGradingSourceRef } from '@/lib/grading-evidence';
import { createGradingApprovalToken, createGradingOriginToken } from '@/lib/grading-origin-token';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
const integritySecret = randomBytes(32).toString('hex');
beforeEach(() => { process.env.GRADING_INTEGRITY_SECRET = integritySecret; });
process.env.GRADING_INTEGRITY_SECRET = integritySecret;
const text = '관찰한 식물 기관의 특징을 구체적인 문장으로 기록하고, 뿌리의 가는 털과 물 흡수 기능을 연결하여 설명함. 관찰 사실을 근거로 결론을 도출하는 과정이 드러났으며, 다른 기관도 같은 방식으로 비교하려는 학습 방향을 확인함.';
const lessonPlan = makeGeneratedPlan();
const assessment = { ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: true };
const recordElements = ['뿌리에 가는 털', '물을 흡수한다', '관찰 결과'].map((value, index) => ({ id: `e${index + 1}`, page: 1, category: 'text', text: value, confidence: .9, coordinates: [{ x: .1, y: .1 + index * .2 }, { x: .8, y: .2 + index * .2 }] }));
const submissionBase = { id: 's1', studentId: 'student-1', studentName: '김학생', originalRevision: 2, gradingRevision: 5, elements: recordElements, elementsTruncated: false, visualAnalysisStatus: 'enhanced_used', autoScoreAllowed: true, requiresVisualReview: false, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', reviewedOriginalRevision: 2, confirmedElementIds: [], approved: true, extractedText: '관찰 결과 뿌리에 가는 털이 있고 물을 흡수한다.', grading: { criteria: [
    { status: 'scored', decisionSource: 'ai', reviewRequired: false, criterionId: 'criterion-1', selectedLevelId: 'proficient', score: 35, evidence: '뿌리에 가는 털', reason: '관찰 특징이 수준 설명에 부합합니다.', feedback: '관찰 근거가 구체적입니다.', confidence: .9, sourceRefs: [canonicalGradingSourceRef(recordElements[0])], teacherConfirmed: true },
    { status: 'scored', decisionSource: 'ai', reviewRequired: false, criterionId: 'criterion-2', selectedLevelId: 'proficient', score: 35, evidence: '물을 흡수한다', reason: '구조와 기능을 근거로 연결했습니다.', feedback: '구조와 기능을 연결했습니다.', confidence: .9, sourceRefs: [canonicalGradingSourceRef(recordElements[1])], teacherConfirmed: true },
    { status: 'scored', decisionSource: 'ai', reviewRequired: false, criterionId: 'criterion-3', selectedLevelId: 'proficient', score: 15, evidence: '관찰 결과', reason: '수정 과정의 근거가 드러납니다.', feedback: '수정 과정의 근거를 확인했습니다.', confidence: .9, sourceRefs: [canonicalGradingSourceRef(recordElements[2])], teacherConfirmed: true },
], provisionalTotal: 85, totalScore: 85, sourceHash: '', summary: '근거를 활용했습니다.', nextSteps: '다른 기관도 설명해보세요.', reviewOrigins: [], originRevision: 5, originToken: '' } };
submissionBase.grading.reviewOrigins = submissionBase.grading.criteria.map(canonicalGradingOrigin);
submissionBase.grading.originToken = createGradingOriginToken(assessment, submissionBase.extractedText, recordElements, canonicalGradingProvenance(submissionBase), submissionBase.grading.reviewOrigins);
const currentGradingHash = gradingSourceHash(assessment, submissionBase.extractedText, recordElements, submissionBase.grading.criteria, submissionBase);
const finalizedGrading = { ...submissionBase.grading, sourceHash: currentGradingHash };
finalizedGrading.approvalToken = createGradingApprovalToken(assessment, submissionBase.extractedText, recordElements, canonicalGradingProvenance(submissionBase), finalizedGrading, submissionBase);
const submission = { ...submissionBase, grading: finalizedGrading, sourceHash: currentGradingHash };
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

test('rejects a fabricated approval token before generating a student record', async () => {
    process.env.GRADING_INTEGRITY_SECRET = 'x'.repeat(32);
    vi.stubGlobal('fetch', vi.fn());
    const forged = { ...submission, grading: { ...submission.grading, approvalToken: '0'.repeat(64) } };

    const response = await POST(request({ lessonPlan, assessment, submission: forged, targetLength: 500 }));

    expect(response.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
});

test('rejects replaying a finalized token after the grading generation changes', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const replayed = { ...submission, gradingRevision: submission.gradingRevision + 1 };

    const response = await POST(request({ lessonPlan, assessment, submission: replayed, targetLength: 500 }));

    expect(response.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
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
