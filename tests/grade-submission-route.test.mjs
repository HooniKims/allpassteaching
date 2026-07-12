import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { POST } from '@/app/api/grade-submission/route';
import { gradingSourceHash } from '@/lib/workflow-lineage';
import { canonicalGradingSourceRef } from '@/lib/grading-evidence';
import { makeAssessment } from './fixtures/workflow.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; delete process.env.GRADING_INTEGRITY_SECRET; });
beforeEach(() => { process.env.GRADING_INTEGRITY_SECRET = randomBytes(32).toString('hex'); });

const extractedText = '관찰 결과 뿌리에 가는 털이 있다. 식을 계산하면 x² = 4이다. 피드백을 반영해 설명을 고쳤다.';
const coordinates = [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.3 }];
const elements = [
    { id: 'text-1', page: 1, category: 'paragraph', text: '뿌리에 가는 털이 있다', confidence: 0.98, coordinates },
    { id: 'equation-1', page: 1, category: 'equation', text: 'x² = 4', confidence: 0.72, coordinates },
    { id: 'text-2', page: 1, category: 'text', text: '피드백을 반영해 설명을 고쳤다', confidence: 0.97, coordinates },
    { id: 'unrelated-1', page: 1, category: 'text', text: '이 평가영역과 관계없는 별도 문장', confidence: 0.99, coordinates },
];
const aiOutput = { criteria: [
    { status: 'scored', criterionId: 'criterion-1', selectedLevelId: 'proficient', score: 35, evidence: '뿌리에 가는 털이 있다', reason: '기관의 특징을 구체적으로 관찰했습니다.', feedback: '다른 기관도 같은 방식으로 관찰해보세요.', confidence: 0.94, sourceRefs: [{ elementId: 'text-1', page: 1 }], teacherConfirmed: false },
    { status: 'scored', criterionId: 'criterion-2', selectedLevelId: 'proficient', score: 35, evidence: 'x² = 4', reason: '계산 결과를 식으로 제시했습니다.', feedback: '계산 과정의 기호를 확인해보세요.', confidence: 0.72, sourceRefs: [{ elementId: 'equation-1', page: 1 }], teacherConfirmed: false },
    { status: 'scored', criterionId: 'criterion-3', selectedLevelId: 'proficient', score: 15, evidence: '피드백을 반영해 설명을 고쳤다', reason: '피드백 반영과 수정 결과가 드러납니다.', feedback: '수정 이유를 더 구체적으로 남겨보세요.', confidence: 0.93, sourceRefs: [{ elementId: 'text-2', page: 1 }], teacherConfirmed: false },
], summary: '관찰과 수정 증거를 제시했습니다.', nextSteps: '수식 기호를 원본과 대조해보세요.' };

const approvedAssessment = () => ({ ...makeAssessment(), sourceHash: 'lesson-source', approved: true });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });
const generationProvenance = { submissionId: 'submission-1', studentId: null, studentName: '김학생', originalRevision: 2, elementsTruncated: false, visualAnalysisStatus: 'enhanced_used', autoScoreAllowed: true, requiresVisualReview: false };
const request = body => new Request('http://localhost/api/grade-submission', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body.mode === 'finalize' ? { ...generationProvenance, ...body } : body) });
const generateBody = (overrides = {}) => ({ assessment: approvedAssessment(), studentName: '김학생', extractedText, elements, ...generationProvenance, ...overrides });

async function generatedMixedGrading() {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(aiOutput)));
    const response = await POST(request(generateBody()));
    return { response, body: await response.json() };
}

async function gradingReadyForApproval() {
    const { body } = await generatedMixedGrading();
    const grading = structuredClone(body.grading);
    grading.criteria = grading.criteria.map((criterion, index) => index === 1
        ? { status: 'scored', decisionSource: 'teacher', reviewRequired: true, criterionId: criterion.criterionId, selectedLevelId: 'proficient', score: 35, evidence: criterion.evidence, reason: '원본 수식과 계산 과정을 확인해 수준에 부합합니다.', feedback: '계산 과정을 문장으로도 설명해보세요.', confidence: criterion.confidence, sourceRefs: criterion.sourceRefs, teacherConfirmed: true }
        : { ...criterion, teacherConfirmed: true });
    grading.provisionalTotal = 85;
    vi.restoreAllMocks();
    return grading;
}

test('Given one text source and one uncertain equation When grading is generated Then only verified evidence scores and final total stays null', async () => {
    const { response, body } = await generatedMixedGrading();

    expect(response.status).toBe(200);
    expect(body.grading.criteria[0]).toMatchObject({ status: 'scored', decisionSource: 'ai', selectedLevelId: 'proficient', score: 35, teacherConfirmed: false });
    expect(body.grading.criteria[1]).toMatchObject({ status: 'teacher_review', selectedLevelId: null, score: null, teacherConfirmed: false });
    expect(body.grading.criteria[1].reviewReason).toMatch(/수식|기호|원본/);
    expect(body.grading.provisionalTotal).toBe(50);
    expect(body.grading.totalScore).toBeNull();
    expect(body.grading.sourceHash).toBe(gradingSourceHash(approvedAssessment(), extractedText, elements, body.grading.criteria, generationProvenance));
});

test('Given an arbitrary score outside the rubric ladder When repair also returns it Then generation is rejected', async () => {
    const invalid = structuredClone(aiOutput);
    invalid.criteria[0].score = 34;
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion(invalid))));

    const response = await POST(request(generateBody()));

    expect(response.status).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('Given a fake source element When repair cannot link it Then generation is rejected', async () => {
    const invalid = structuredClone(aiOutput);
    invalid.criteria[0].sourceRefs = [{ elementId: 'invented-source', page: 99 }];
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion(invalid))));

    const response = await POST(request(generateBody()));

    expect(response.status).toBe(422);
});

test('Given a scored criterion without a level-matching reason When repair cannot add it Then generation is rejected', async () => {
    const invalid = structuredClone(aiOutput);
    delete invalid.criteria[0].reason;
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion(invalid))));

    const response = await POST(request(generateBody()));

    expect(response.status).toBe(422);
});

test('Given Enhanced analysis is unavailable When grading is generated Then every criterion stays scoreless for teacher review', async () => {
    const { body } = await (async () => {
        process.env.UPSTAGE_API_KEY = 'test-key';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(aiOutput)));
        const response = await POST(request(generateBody({ visualAnalysisStatus: 'enhanced_unavailable', autoScoreAllowed: false })));
        return { response, body: await response.json() };
    })();

    expect(body.grading.criteria.every(item => item.status === 'teacher_review' && item.score === null)).toBe(true);
    expect(body.grading.totalScore).toBeNull();
});

test('Given OCR forbids automatic scoring even after Enhanced analysis When grading is generated Then every criterion stays teacher review', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(aiOutput)));

    const response = await POST(request(generateBody({ autoScoreAllowed: false })));
    const body = await response.json();

    expect(body.grading.criteria.every(item => item.status === 'teacher_review' && item.reviewRequired === true)).toBe(true);
});

test('Given the current original and every criterion confirmation When teacher resolves the equation Then the server computes the final total', async () => {
    const grading = await gradingReadyForApproval();

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, elementsTruncated: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));
    const finalBody = await response.json();

    expect(response.status, JSON.stringify(finalBody)).toBe(200);
    expect(finalBody.grading.totalScore).toBe(85);
    expect(finalBody.grading.provisionalTotal).toBe(85);
});

test('Given criterion evidence linked to another existing OCR element When approval is requested Then the foreign source is rejected', async () => {
    const grading = await gradingReadyForApproval();
    grading.criteria[0].sourceRefs = structuredClone(grading.criteria[1].sourceRefs);
    grading.sourceHash = gradingSourceHash(approvedAssessment(), extractedText, elements, grading.criteria, generationProvenance);

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, elementsTruncated: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test('Given one correct source and one unrelated canonical source When approval is requested Then every source must contain the criterion evidence', async () => {
    const grading = await gradingReadyForApproval();
    grading.criteria[0].sourceRefs.push(canonicalGradingSourceRef(elements[3]));
    grading.sourceHash = gradingSourceHash(approvedAssessment(), extractedText, elements, grading.criteria, generationProvenance);

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test('Given normalized OCR element content changes without aggregate text changing When approval is requested Then element lineage is stale', async () => {
    const grading = await gradingReadyForApproval();
    const changedElements = elements.map(element => element.id === 'text-1' ? {
        ...element,
        text: '다른 학생의 unrelated 근거',
        category: 'heading',
        coordinates: [{ x: .02, y: .03 }, { x: .24, y: .08 }],
    } : element);
    grading.sourceHash = gradingSourceHash(approvedAssessment(), extractedText, changedElements, grading.criteria, generationProvenance);

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements: changedElements, elementsTruncated: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test('Given a visual criterion was forced to teacher review When it is relabelled as AI after resolution Then approval is rejected', async () => {
    const grading = await gradingReadyForApproval();
    grading.criteria[1].decisionSource = 'ai';
    grading.criteria[1].reviewRequired = false;
    grading.sourceHash = gradingSourceHash(approvedAssessment(), extractedText, elements, grading.criteria, generationProvenance);

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, elementsTruncated: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test('Given a safe AI recommendation When its level is raised but still labelled AI Then signed origin rejects the escalation', async () => {
    const grading = await gradingReadyForApproval();
    const excellent = approvedAssessment().rubric.criteria[0].levels.find(level => level.levelId === 'excellent');
    grading.criteria[0] = { ...grading.criteria[0], selectedLevelId: excellent.levelId, score: excellent.score };
    grading.provisionalTotal = excellent.score + 50;
    grading.sourceHash = gradingSourceHash(approvedAssessment(), extractedText, elements, grading.criteria, generationProvenance);

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test('Given a canonical source payload is altered while retaining its element hash When approval is requested Then exact source equality is enforced', async () => {
    const grading = await gradingReadyForApproval();
    grading.criteria[0].sourceRefs[0] = { ...grading.criteria[0].sourceRefs[0], text: '변조된 표시 문구', category: 'figure', coordinates: [] };
    grading.sourceHash = gradingSourceHash(approvedAssessment(), extractedText, elements, grading.criteria, generationProvenance);

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, elementsTruncated: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test('Given a safe scored criterion omits its decision source When approval is requested Then canonical provenance is rejected', async () => {
    const grading = await gradingReadyForApproval();
    delete grading.criteria[0].decisionSource;
    grading.sourceHash = gradingSourceHash(approvedAssessment(), extractedText, elements, grading.criteria, generationProvenance);

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, elementsTruncated: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test('Given duplicate normalized OCR element ids When approval is requested Then ambiguous source identity is rejected', async () => {
    const grading = await gradingReadyForApproval();
    const duplicateElements = [...elements, structuredClone(elements[0])];
    grading.sourceHash = gradingSourceHash(approvedAssessment(), extractedText, duplicateElements, grading.criteria, generationProvenance);

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements: duplicateElements, elementsTruncated: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test('Given one OCR element is reused across rubric criteria When approval is requested Then cross-criterion source reuse is rejected', async () => {
    const grading = await gradingReadyForApproval();
    grading.criteria = grading.criteria.map(criterion => ({ ...criterion, evidence: elements[0].text, sourceRefs: structuredClone(grading.criteria[0].sourceRefs) }));
    grading.sourceHash = gradingSourceHash(approvedAssessment(), extractedText, elements, grading.criteria, generationProvenance);

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, elementsTruncated: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: [] }));

    expect(response.status).toBe(409);
});

test('Given one canonical OCR source is repeated within a criterion When approval is requested Then duplicate source identity is rejected', async () => {
    const grading = await gradingReadyForApproval();
    grading.criteria[0].sourceRefs.push(structuredClone(grading.criteria[0].sourceRefs[0]));
    grading.sourceHash = gradingSourceHash(approvedAssessment(), extractedText, elements, grading.criteria, generationProvenance);

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test('Given grading was issued for one roster link When finalization relinks the submission Then server provenance rejects it', async () => {
    const grading = await gradingReadyForApproval();

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), studentId: 'student-2', studentName: '다른 학생', extractedText, elements, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test('Given visual review is required When grading is generated Then every score remains teacher-owned review', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(aiOutput)));

    const response = await POST(request(generateBody({ requiresVisualReview: true })));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.grading.criteria.every(item => item.status === 'teacher_review' && item.reviewRequired === true)).toBe(true);
});

test('Given no server integrity secret is configured When grading is requested Then generation fails closed before the model call', async () => {
    delete process.env.GRADING_INTEGRITY_SECRET;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(aiOutput)));

    const response = await POST(request(generateBody()));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe('integrity_unavailable');
    expect(fetch).not.toHaveBeenCalled();
});

test('Given only the Upstage credential is configured When grading is requested Then it is not reused as an integrity key', async () => {
    delete process.env.GRADING_INTEGRITY_SECRET;
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(aiOutput)));

    const response = await POST(request(generateBody()));

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
});

test('Given an undersized integrity secret When grading is requested Then generation fails closed', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    process.env.GRADING_INTEGRITY_SECRET = 'short';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(aiOutput)));

    const response = await POST(request(generateBody()));

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
});

test('Given OCR provenance changes to disallow automatic scoring When approval is requested Then lineage is stale', async () => {
    const grading = await gradingReadyForApproval();

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, elementsTruncated: false, autoScoreAllowed: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test('Given the model originally returned teacher review for safe evidence When the origin is erased and relabelled AI Then approval is rejected', async () => {
    const cautiousOutput = structuredClone(aiOutput);
    cautiousOutput.criteria[0] = { status: 'teacher_review', criterionId: 'criterion-1', selectedLevelId: null, score: null, evidence: '뿌리에 가는 털이 있다', reviewReason: '교사가 관찰 표현을 확인해야 합니다.', confidence: .94, sourceRefs: [{ elementId: 'text-1', page: 1 }], teacherConfirmed: false };
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(cautiousOutput)));
    const generated = await POST(request(generateBody()));
    const grading = (await generated.json()).grading;
    grading.criteria = grading.criteria.map((criterion, index) => ({
        ...criterion,
        ...(criterion.status === 'teacher_review' ? {
            status: 'scored', decisionSource: index === 1 ? 'teacher' : 'ai', reviewRequired: index === 1,
            selectedLevelId: 'proficient', score: 35, reason: '원본을 확인했습니다.', feedback: '근거를 더 구체화하세요.', teacherConfirmed: true,
        } : { teacherConfirmed: true }),
    }));
    grading.provisionalTotal = 85;
    grading.sourceHash = gradingSourceHash(approvedAssessment(), extractedText, elements, grading.criteria, generationProvenance);
    vi.restoreAllMocks();

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, elementsTruncated: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));

    expect(response.status).toBe(409);
});

test.each([
    ['unresolved review', grading => ({ ...grading, criteria: grading.criteria.map((item, index) => index ? item : { status: 'teacher_review', criterionId: item.criterionId, selectedLevelId: null, score: null, evidence: item.evidence, reviewReason: '원본 확인이 아직 필요합니다.', confidence: item.confidence, sourceRefs: item.sourceRefs, teacherConfirmed: false }), provisionalTotal: 50 }), {}],
    ['arbitrary level score', grading => ({ ...grading, criteria: grading.criteria.map((item, index) => index ? item : { ...item, score: 34 }), provisionalTotal: 84 }), {}],
    ['fake source', grading => ({ ...grading, criteria: grading.criteria.map((item, index) => index ? item : { ...item, sourceRefs: [{ elementId: 'invented', page: 99 }] }) }), {}],
    ['missing reason', grading => { const next = structuredClone(grading); delete next.criteria[0].reason; return next; }, {}],
    ['stale edited OCR', grading => grading, { extractedText: `${extractedText} 교사가 수정한 OCR` }],
    ['stale rubric', grading => grading, { assessment: { ...approvedAssessment(), task: { ...approvedAssessment().task, title: '교사가 수정한 수행과제' } } }],
    ['stale original review', grading => grading, { reviewedOriginalRevision: 1 }],
])('Given %s When approval is requested Then the server preserves data and blocks approval', async (_label, mutate, requestPatch) => {
    const grading = mutate(await gradingReadyForApproval());

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, elementsTruncated: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'], ...requestPatch }));
    const finalBody = await response.json();

    expect(response.status).toBe(409);
    expect(finalBody.code).toBe('approval_blocked');
    expect(finalBody.grading).toEqual(grading);
});

test('Given an assessment not approved by the teacher When grading is requested Then the model is not called', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const response = await POST(request(generateBody({ assessment: { ...makeAssessment(), sourceHash: 'lesson-source', approved: false } })));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
});
