import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { POST } from '@/app/api/generate-record/route';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';
import { makeAssessment } from './fixtures/workflow.mjs';
import { gradingSourceHash } from '@/lib/workflow-lineage';
import { sourceHash } from '@/lib/source-hash';
import { canonicalGradingOrigin, canonicalGradingProvenance, canonicalGradingSourceRef } from '@/lib/grading-evidence';
import { createGradingApprovalToken, createGradingOriginToken } from '@/lib/grading-origin-token';
import { createRecordContext } from '@/lib/record-context-token';

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
const student = { id: 'student-1', grade: '6', className: '1', number: 1, name: '김학생' };
const request = body => new Request('http://localhost/api/generate-record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });
const claims = value => ({ claims: [{ text: value, kind: 'performance', criterionIds: ['criterion-1'], evidenceQuotes: [{ criterionId: 'criterion-1', stage: 'performance', quote: '뿌리에 가는 털' }], sourceRefs: [{ criterionId: 'criterion-1', elementId: 'e1', page: 1 }] }] });
const input = ({ currentLessonPlan = lessonPlan, currentAssessment = assessment, currentStudent = student, currentSubmission = submission, roster = [currentStudent], targetLength = 500 } = {}) => ({
    lessonPlan: currentLessonPlan,
    assessment: currentAssessment,
    student: currentStudent,
    submission: currentSubmission,
    roster,
    recordContext: createRecordContext({ lessonPlan: currentLessonPlan, assessment: currentAssessment, students: roster, submissions: [currentSubmission] }),
    targetLength,
});
function submissionWithRevisionEvidence() {
    const criteria = submission.grading.criteria.map(criterion => criterion.criterionId === 'criterion-3' ? { ...criterion, revisionEvidence: {
        checkpointId: 'checkpoint-2', beforeEvidence: '뿌리에 가는 털', beforeSourceRef: canonicalGradingSourceRef(recordElements[0]),
        afterEvidence: '관찰 결과', afterSourceRef: canonicalGradingSourceRef(recordElements[2]), changeReason: '피드백을 반영해 설명 근거를 보완함.', teacherConfirmed: true,
    } } : criterion);
    const draft = { ...submission, grading: { ...submission.grading, criteria, approvalToken: undefined } };
    const sourceHashValue = gradingSourceHash(assessment, draft.extractedText, draft.elements, criteria, draft);
    const grading = { ...draft.grading, sourceHash: sourceHashValue };
    grading.approvalToken = createGradingApprovalToken(assessment, draft.extractedText, draft.elements, canonicalGradingProvenance(draft), grading, draft);
    return { ...draft, grading, sourceHash: sourceHashValue };
}

test('generates only from a teacher-approved grading result', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key'; vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(claims(text))));
    const response = await POST(request(input()));

    expect(response.status).toBe(200);
    expect((await response.json()).record.text).toBe(text);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
});

test('rejects a submission that is not linked to the current roster student id', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const changedStudent = { ...student, id: 'student-2' };
    const response = await POST(request(input({ currentStudent: changedStudent, roster: [changedStudent] })));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('stale_context');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
});

test('rejects an unapproved submission before calling the model', async () => {
    const response = await POST(request({ ...input(), submission: { ...submission, approved: false } }));
    expect(response.status).toBe(400);
});

test('rejects a fabricated approval token before generating a student record', async () => {
    process.env.GRADING_INTEGRITY_SECRET = 'x'.repeat(32);
    vi.stubGlobal('fetch', vi.fn());
    const forged = { ...submission, grading: { ...submission.grading, approvalToken: '0'.repeat(64) } };

    const response = await POST(request(input({ currentSubmission: forged })));

    expect(response.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
});

test('rejects replaying a finalized token after the grading generation changes', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const replayed = { ...submission, gradingRevision: submission.gradingRevision + 1 };

    const response = await POST(request(input({ currentSubmission: replayed })));

    expect(response.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
});

test('repairs score-list language in the generated record', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key'; vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(claims(`${text} 총점 85점.`))).mockResolvedValueOnce(completion(claims(text))));
    const response = await POST(request(input()));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('rejects grading created for an older rubric', async () => {
    const changedAssessment = { ...assessment, task: { ...assessment.task, title: '바뀐 과제' } };
    const response = await POST(request(input({ currentAssessment: changedAssessment })));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('stale_grading');
});

test('rejects an assessment created for a different lesson plan', async () => {
    const response = await POST(request(input({ currentLessonPlan: { ...lessonPlan, title: '다른 지도안' } })));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('stale_assessment');
});

test('rejects a stale roster context before calling the model', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const recordContext = createRecordContext({ lessonPlan, assessment, students: [student], submissions: [submission] });
    const roster = [{ ...student, name: '변경된 이름' }];

    const response = await POST(request({ lessonPlan, assessment, student: roster[0], roster, submission, recordContext, targetLength: 500 }));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('stale_context');
    expect(fetch).not.toHaveBeenCalled();
});

test('repairs a revision claim that is not linked to approved revision evidence', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    const invalid = { claims: [{ text: '이전보다 설명이 정교해짐.', kind: 'revision', criterionIds: ['criterion-1'], evidenceQuotes: [{ criterionId: 'criterion-1', stage: 'performance', quote: '뿌리에 가는 털' }], sourceRefs: [{ criterionId: 'criterion-1', elementId: 'e1', page: 1 }] }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(invalid)).mockResolvedValueOnce(completion(claims(text))));

    const response = await POST(request(input()));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('repairs a claim whose quote and source reference are not in approved evidence', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    const fabricated = { claims: [{ text, kind: 'performance', criterionIds: ['criterion-1'], evidenceQuotes: [{ criterionId: 'criterion-1', stage: 'performance', quote: '제출물에 없는 문장' }], sourceRefs: [{ criterionId: 'criterion-1', elementId: 'fake', page: 1 }] }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(fabricated)).mockResolvedValueOnce(completion(claims(text))));

    const response = await POST(request(input()));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('rejects a one-character substring instead of the complete approved evidence quote', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    const partial = { claims: [{ text, kind: 'performance', criterionIds: ['criterion-1'], evidenceQuotes: [{ criterionId: 'criterion-1', stage: 'performance', quote: '뿌' }], sourceRefs: [{ criterionId: 'criterion-1', elementId: 'e1', page: 1 }] }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(partial)).mockResolvedValueOnce(completion(claims(text))));

    const response = await POST(request(input()));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('requires every revision criterion to cite its own before and after evidence and source references', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    const revisedSubmission = submissionWithRevisionEvidence();
    const validRevision = { claims: [{ text, kind: 'revision', criterionIds: ['criterion-3'], evidenceQuotes: [
        { criterionId: 'criterion-3', stage: 'before', quote: '뿌리에 가는 털' }, { criterionId: 'criterion-3', stage: 'after', quote: '관찰 결과' },
    ], sourceRefs: [
        { criterionId: 'criterion-3', elementId: 'e1', page: 1 }, { criterionId: 'criterion-3', elementId: 'e3', page: 1 },
    ] }] };
    const missingAfter = { claims: [{ ...validRevision.claims[0], evidenceQuotes: validRevision.claims[0].evidenceQuotes.slice(0, 1), sourceRefs: validRevision.claims[0].sourceRefs.slice(0, 1) }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(missingAfter)).mockResolvedValueOnce(completion(validRevision)));

    const response = await POST(request(input({ currentSubmission: revisedSubmission })));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('rejects mixed revision criterion ids when any id lacks structured revision support', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    const revisedSubmission = submissionWithRevisionEvidence();
    const mixed = { claims: [{ text, kind: 'revision', criterionIds: ['criterion-3', 'criterion-1'], evidenceQuotes: [
        { criterionId: 'criterion-3', stage: 'before', quote: '뿌리에 가는 털' }, { criterionId: 'criterion-3', stage: 'after', quote: '관찰 결과' }, { criterionId: 'criterion-1', stage: 'performance', quote: '뿌리에 가는 털' },
    ], sourceRefs: [
        { criterionId: 'criterion-3', elementId: 'e1', page: 1 }, { criterionId: 'criterion-3', elementId: 'e3', page: 1 }, { criterionId: 'criterion-1', elementId: 'e1', page: 1 },
    ] }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(mixed)).mockResolvedValueOnce(completion(claims(text))));

    const response = await POST(request(input({ currentSubmission: revisedSubmission })));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('rejects an expired record context before calling the model', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const recordContext = createRecordContext({ lessonPlan, assessment, students: [student], submissions: [submission] }, Date.now() - 5 * 60_000 - 1);

    const response = await POST(request({ lessonPlan, assessment, student, roster: [student], submission, recordContext, targetLength: 500 }));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('expired_context');
    expect(fetch).not.toHaveBeenCalled();
});

test('rejects a deleted student absent from the signed current roster before calling the model', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const otherStudent = { ...student, id: 'student-2', number: 2, name: '이학생' };
    const recordContext = createRecordContext({ lessonPlan, assessment, students: [otherStudent], submissions: [submission] });

    const response = await POST(request({ lessonPlan, assessment, student, roster: [otherStudent], submission, recordContext, targetLength: 500 }));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('stale_context');
    expect(fetch).not.toHaveBeenCalled();
});
