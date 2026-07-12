import { afterEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/grade-submission/route';
import { gradingSourceHash } from '@/lib/workflow-lineage';
import { makeAssessment } from './fixtures/workflow.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });

const extractedText = '관찰 결과 뿌리에 가는 털이 있다. 식을 계산하면 x² = 4이다. 피드백을 반영해 설명을 고쳤다.';
const coordinates = [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.3 }];
const elements = [
    { id: 'text-1', page: 1, category: 'paragraph', text: '뿌리에 가는 털이 있다', confidence: 0.98, coordinates },
    { id: 'equation-1', page: 1, category: 'equation', text: 'x² = 4', confidence: 0.72, coordinates },
    { id: 'text-2', page: 1, category: 'text', text: '피드백을 반영해 설명을 고쳤다', confidence: 0.97, coordinates },
];
const aiOutput = { criteria: [
    { status: 'scored', criterionId: 'criterion-1', selectedLevelId: 'proficient', score: 35, evidence: '뿌리에 가는 털이 있다', reason: '기관의 특징을 구체적으로 관찰했습니다.', feedback: '다른 기관도 같은 방식으로 관찰해보세요.', confidence: 0.94, sourceRefs: [{ elementId: 'text-1', page: 1 }], teacherConfirmed: false },
    { status: 'scored', criterionId: 'criterion-2', selectedLevelId: 'proficient', score: 35, evidence: 'x² = 4', reason: '계산 결과를 식으로 제시했습니다.', feedback: '계산 과정의 기호를 확인해보세요.', confidence: 0.72, sourceRefs: [{ elementId: 'equation-1', page: 1 }], teacherConfirmed: false },
    { status: 'scored', criterionId: 'criterion-3', selectedLevelId: 'proficient', score: 15, evidence: '피드백을 반영해 설명을 고쳤다', reason: '피드백 반영과 수정 결과가 드러납니다.', feedback: '수정 이유를 더 구체적으로 남겨보세요.', confidence: 0.93, sourceRefs: [{ elementId: 'text-2', page: 1 }], teacherConfirmed: false },
], summary: '관찰과 수정 증거를 제시했습니다.', nextSteps: '수식 기호를 원본과 대조해보세요.' };

const approvedAssessment = () => ({ ...makeAssessment(), sourceHash: 'lesson-source', approved: true });
const request = body => new Request('http://localhost/api/grade-submission', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });
const generateBody = (overrides = {}) => ({ assessment: approvedAssessment(), studentName: '김학생', extractedText, elements, elementsTruncated: false, visualAnalysisStatus: 'enhanced_used', ...overrides });

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
        ? { status: 'scored', criterionId: criterion.criterionId, selectedLevelId: 'proficient', score: 35, evidence: criterion.evidence, reason: '원본 수식과 계산 과정을 확인해 수준에 부합합니다.', feedback: '계산 과정을 문장으로도 설명해보세요.', confidence: criterion.confidence, sourceRefs: criterion.sourceRefs, teacherConfirmed: true }
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
    expect(body.grading.sourceHash).toBe(gradingSourceHash(approvedAssessment(), extractedText));
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

test('Given the current original and every criterion confirmation When teacher resolves the equation Then the server computes the final total', async () => {
    const grading = await gradingReadyForApproval();

    const response = await POST(request({ mode: 'finalize', assessment: approvedAssessment(), extractedText, elements, elementsTruncated: false, grading, originalAttached: true, originalReviewedAt: '2026-07-12T12:00:00.000Z', originalRevision: 2, reviewedOriginalRevision: 2, confirmedElementIds: ['equation-1'] }));
    const finalBody = await response.json();

    expect(response.status).toBe(200);
    expect(finalBody.grading.totalScore).toBe(85);
    expect(finalBody.grading.provisionalTotal).toBe(85);
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
