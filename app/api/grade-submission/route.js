import { z } from 'zod';
import { approvedAssessmentSchema } from '@/lib/assessment-schema';
import { canonicalGradingOrigin, canonicalGradingProvenance, canonicalGradingSourceRef, gradingDecisionMatchesOrigin, gradingEvidenceMatchesElements, gradingEvidenceRiskIds, gradingSourceRefMatchesElement, ocrElementNeedsTeacherReview } from '@/lib/grading-evidence';
import { createGradingApprovalToken, createGradingOriginToken, gradingIntegrityAvailable, verifyGradingOriginToken } from '@/lib/grading-origin-token';
import { aiGradingOutputSchema, gradingSourceRefSchema, MAX_OCR_TEXT_LENGTH, storedGradingSchema } from '@/lib/grading-schema';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { gradingSourceHash } from '@/lib/workflow-lineage';
import { gradingMessages, repairGradingMessages } from '@/lib/workflow-prompts';

const shortText = z.string().trim().min(1).max(300);
const coordinates = z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).max(16).default([]);
const documentElementSchema = z.object({
    id: shortText, page: z.number().int().min(1).max(10000), category: z.string().regex(/^[a-z][a-z0-9_-]{0,49}$/),
    text: z.string().trim().max(5000), coordinates, confidence: z.number().min(0).max(1).optional(),
});
const commonSchema = z.object({
    assessment: approvedAssessmentSchema,
    submissionId: shortText.default('submission-1'),
    studentId: shortText.nullable().default(null),
    studentName: z.string().trim().min(1).max(100),
    originalRevision: z.number().int().min(1).default(1),
    gradingRevision: z.number().int().min(0).default(0),
    extractedText: z.string().trim().min(20).max(MAX_OCR_TEXT_LENGTH),
    elements: z.array(documentElementSchema).max(2000).default([]),
    elementsTruncated: z.boolean().default(false),
    visualAnalysisStatus: z.enum(['not_requested', 'enhanced_used', 'enhanced_unavailable', 'enhanced_failed']).default('not_requested'),
    autoScoreAllowed: z.boolean().default(true),
    requiresVisualReview: z.boolean().default(false),
});
const generateRequestSchema = commonSchema.extend({
    mode: z.literal('generate').optional(),
});
const finalizeRequestSchema = commonSchema.extend({
    mode: z.literal('finalize'), grading: z.unknown(), originalAttached: z.literal(true),
    originalReviewedAt: z.string().datetime(), reviewedOriginalRevision: z.number().int().min(1),
    confirmedElementIds: z.array(shortText).max(2004).default([]),
});

const json = (body, init = {}) => Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...(init.headers ?? {}) } });
const issue = (path, message) => ({ path, message });
const gradingProvenance = input => canonicalGradingProvenance(input);
const hasDuplicateElementIds = elements => new Set(elements.map(element => element.id)).size !== elements.length;

function canonicalSourceRefs(sourceRefs, elements, path, issues, requireIntegrity = false) {
    const elementById = new Map(elements.map(element => [element.id, element]));
    const seen = new Set();
    const result = [];
    sourceRefs.forEach((sourceRef, index) => {
        const element = elementById.get(sourceRef.elementId);
        if (!element || element.page !== sourceRef.page || (requireIntegrity && !gradingSourceRefMatchesElement(sourceRef, element))) {
            issues.push(issue([...path, index], '현재 OCR 요소의 id·내용·분류·페이지·좌표와 정확히 일치하는 근거만 사용할 수 있습니다.'));
            return;
        }
        if (seen.has(element.id)) {
            issues.push(issue([...path, index], '같은 OCR 요소를 한 평가영역의 근거로 중복 사용할 수 없습니다.'));
            return;
        }
        seen.add(element.id);
        result.push(gradingSourceRefSchema.parse(canonicalGradingSourceRef(element)));
    });
    return result;
}

function sourceNeedsReview(element) {
    return ocrElementNeedsTeacherReview(element);
}

function reviewReasonFor(input, sourceElements, criterion) {
    if (input.elementsTruncated) return 'OCR 요소가 일부 생략되어 원본 전체를 교사가 확인해야 합니다.';
    if (!input.autoScoreAllowed) return 'OCR 정규화 결과상 자동 채점이 허용되지 않아 교사가 원본을 확인해야 합니다.';
    if (['enhanced_unavailable', 'enhanced_failed'].includes(input.visualAnalysisStatus)) return 'Enhanced 분석을 사용할 수 없어 일반 OCR 결과를 원본과 대조해야 합니다.';
    if (input.requiresVisualReview) return '시각 자료가 포함되어 원본의 의미와 위치를 교사가 확인해야 합니다.';
    if (!criterion.sourceRefs.length) return '채점 근거가 원본 OCR 요소와 연결되지 않아 교사가 위치와 내용을 확인해야 합니다.';
    if (sourceElements.some(element => element.category === 'equation')) return '수식의 핵심 기호와 계산 과정을 원본에서 확인해야 합니다.';
    if (sourceElements.some(element => ['chart', 'figure'].includes(element.category))) return '도표·그림의 의미가 정확히 판독되었는지 원본에서 확인해야 합니다.';
    if (sourceElements.some(sourceNeedsReview) || criterion.confidence < 0.85) return 'OCR 신뢰도 또는 원본 위치가 불확실해 교사가 직접 확인해야 합니다.';
    return '';
}

function validateAiGrading(value, input) {
    const parsed = aiGradingOutputSchema.safeParse(value);
    if (!parsed.success) return { success: false, value, issues: parsed.error.issues };
    const expected = input.assessment.rubric.criteria;
    const actual = parsed.data.criteria;
    const issues = [];
    if (actual.length !== expected.length || expected.some((criterion, index) => actual[index]?.criterionId !== criterion.id)) {
        issues.push(issue(['criteria'], '루브릭 평가 요소 id와 순서를 정확히 보존해야 합니다.'));
    }
    const elementById = new Map(input.elements.map(element => [element.id, element]));
    const criteria = actual.map((criterion, index) => {
        const rubricCriterion = expected[index];
        const refs = canonicalSourceRefs(criterion.sourceRefs, input.elements, ['criteria', index, 'sourceRefs'], issues);
        if (!rubricCriterion) return { ...criterion, sourceRefs: refs, teacherConfirmed: false };
        const sourceElements = refs.map(ref => elementById.get(ref.elementId));
        const directEvidence = gradingEvidenceMatchesElements(criterion.evidence, sourceElements);
        if (criterion.status === 'scored') {
            const level = rubricCriterion.levels.find(item => item.levelId === criterion.selectedLevelId);
            if (!level || level.score !== criterion.score) issues.push(issue(['criteria', index, 'score'], `${rubricCriterion.name}은 현재 루브릭 수준에 정의된 점수만 사용할 수 있습니다.`));
        }
        const forcedReason = reviewReasonFor(input, sourceElements, { ...criterion, sourceRefs: refs });
        if (criterion.status === 'teacher_review' || forcedReason || !directEvidence) {
            return {
                status: 'teacher_review', criterionId: criterion.criterionId, selectedLevelId: null, score: null,
                evidence: criterion.evidence, reviewReason: forcedReason || criterion.reviewReason || '직접 근거가 OCR 원문과 일치하지 않아 원본 확인이 필요합니다.',
                confidence: criterion.confidence, sourceRefs: refs, teacherConfirmed: false, reviewRequired: true,
            };
        }
        return { ...criterion, decisionSource: 'ai', reviewRequired: false, sourceRefs: refs, teacherConfirmed: false };
    });
    if (issues.length) return { success: false, value, issues };
    const provisionalTotal = criteria.reduce((sum, criterion) => sum + (criterion.status === 'scored' ? criterion.score : 0), 0);
    const reviewOrigins = criteria.map(canonicalGradingOrigin);
    const originRevision = input.gradingRevision + 1;
    const provenance = gradingProvenance({ ...input, gradingRevision: originRevision });
    return { success: true, data: {
        ...parsed.data, criteria, provisionalTotal, totalScore: null,
        sourceHash: gradingSourceHash(input.assessment, input.extractedText, input.elements, criteria, provenance),
        reviewOrigins, originRevision,
        originToken: createGradingOriginToken(input.assessment, input.extractedText, input.elements, provenance, reviewOrigins),
    } };
}

function parseGrading(content, input) {
    try {
        const value = JSON.parse(content);
        return validateAiGrading(value, input);
    } catch (error) {
        return { success: false, value: content, issues: [issue([], `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}`)] };
    }
}

function finalizeGrading(input) {
    const issues = [];
    const provenance = gradingProvenance(input);
    const currentHash = gradingSourceHash(input.assessment, input.extractedText, input.elements, input.grading.criteria, provenance);
    if (input.grading.sourceHash !== currentHash) issues.push(issue(['grading', 'sourceHash'], 'OCR 원문 또는 루브릭이 바뀌어 다시 채점해야 합니다.'));
    const originProvenance = gradingProvenance({ ...input, gradingRevision: input.grading.originRevision });
    if (!verifyGradingOriginToken(input.grading.originToken, input.assessment, input.extractedText, input.elements, originProvenance, input.grading.reviewOrigins)) issues.push(issue(['grading', 'originToken'], '서버가 확인한 OCR 원본 계보와 일치하지 않아 다시 채점해야 합니다.'));
    if (input.reviewedOriginalRevision !== input.originalRevision) issues.push(issue(['reviewedOriginalRevision'], '현재 연결된 원본 PDF를 다시 확인해야 합니다.'));
    const expected = input.assessment.rubric.criteria;
    if (input.grading.criteria.length !== expected.length) issues.push(issue(['grading', 'criteria'], '모든 평가영역을 확인해야 합니다.'));
    const elementById = new Map(input.elements.map(element => [element.id, element]));
    const originByCriterionId = new Map(input.grading.reviewOrigins.map(origin => [origin.criterionId, origin]));
    const sourceOwnerByElementId = new Map();
    let total = 0;
    const criteria = input.grading.criteria.map((criterion, index) => {
        const rubricCriterion = expected[index];
        const refs = canonicalSourceRefs(criterion.sourceRefs, input.elements, ['grading', 'criteria', index, 'sourceRefs'], issues, true);
        let revisionEvidence = criterion.revisionEvidence;
        if (revisionEvidence) {
            const beforeRef = canonicalSourceRefs([revisionEvidence.beforeSourceRef], input.elements, ['grading', 'criteria', index, 'revisionEvidence', 'beforeSourceRef'], issues, true)[0];
            const afterRef = canonicalSourceRefs([revisionEvidence.afterSourceRef], input.elements, ['grading', 'criteria', index, 'revisionEvidence', 'afterSourceRef'], issues, true)[0];
            if (rubricCriterion?.kind !== 'process'
                || !input.assessment.backwardDesign.checkpoints.some(checkpoint => checkpoint.phase === 'revision' && checkpoint.id === revisionEvidence.checkpointId)) {
                issues.push(issue(['grading', 'criteria', index, 'revisionEvidence', 'checkpointId'], '현재 수정 체크포인트와 과정 평가영역만 연결할 수 있습니다.'));
            }
            if (!revisionEvidence.teacherConfirmed) issues.push(issue(['grading', 'criteria', index, 'revisionEvidence', 'teacherConfirmed'], '수정 전후 원본과 수정 이유를 교사가 확인해야 합니다.'));
            if (!beforeRef || !afterRef || beforeRef.elementId === afterRef.elementId) issues.push(issue(['grading', 'criteria', index, 'revisionEvidence'], '서로 다른 수정 전·후 원본 근거가 필요합니다.'));
            if (beforeRef && !gradingEvidenceMatchesElements(revisionEvidence.beforeEvidence, [elementById.get(beforeRef.elementId)])) issues.push(issue(['grading', 'criteria', index, 'revisionEvidence', 'beforeEvidence'], '수정 전 근거는 연결한 현재 OCR 원문에 있어야 합니다.'));
            if (afterRef && !gradingEvidenceMatchesElements(revisionEvidence.afterEvidence, [elementById.get(afterRef.elementId)])) issues.push(issue(['grading', 'criteria', index, 'revisionEvidence', 'afterEvidence'], '수정 후 근거는 연결한 현재 OCR 원문에 있어야 합니다.'));
            if (beforeRef && afterRef) revisionEvidence = { ...revisionEvidence, beforeSourceRef: beforeRef, afterSourceRef: afterRef };
        }
        if (!rubricCriterion || criterion.criterionId !== rubricCriterion.id) issues.push(issue(['grading', 'criteria', index, 'criterionId'], '현재 루브릭 평가영역 id와 순서를 보존해야 합니다.'));
        const origin = originByCriterionId.get(criterion.criterionId);
        if (!origin || input.grading.reviewOrigins[index]?.criterionId !== criterion.criterionId) issues.push(issue(['grading', 'reviewOrigins', index], '서버가 발급한 평가영역 출처 순서를 보존해야 합니다.'));
        if (criterion.status !== 'scored') {
            issues.push(issue(['grading', 'criteria', index], '교사 확인 필요 영역의 수준을 먼저 선택해야 합니다.'));
            return { ...criterion, sourceRefs: refs };
        }
        const level = rubricCriterion?.levels.find(item => item.levelId === criterion.selectedLevelId);
        if (!level || level.score !== criterion.score) issues.push(issue(['grading', 'criteria', index, 'score'], '현재 루브릭에 정의된 수준 점수만 확정할 수 있습니다.'));
        if (!refs.length) issues.push(issue(['grading', 'criteria', index, 'sourceRefs'], '하나 이상의 현재 원본 근거를 연결해야 합니다.'));
        if (!criterion.teacherConfirmed) issues.push(issue(['grading', 'criteria', index, 'teacherConfirmed'], '근거와 수준을 교사가 확인해야 합니다.'));
        const evidenceMatches = gradingEvidenceMatchesElements(criterion.evidence, refs.map(ref => elementById.get(ref.elementId)));
        if (!evidenceMatches) issues.push(issue(['grading', 'criteria', index, 'evidence'], '근거는 현재 OCR 원문 또는 연결 요소에 실제로 있어야 합니다.'));
        for (const ref of refs) {
            const owner = sourceOwnerByElementId.get(ref.elementId);
            if (owner && owner !== criterion.criterionId) issues.push(issue(['grading', 'criteria', index, 'sourceRefs'], '같은 OCR 요소를 서로 다른 평가영역의 근거로 중복 사용할 수 없습니다.'));
            sourceOwnerByElementId.set(ref.elementId, criterion.criterionId);
        }
        const derivedReviewRequired = gradingEvidenceRiskIds(input, refs.map(ref => elementById.get(ref.elementId))).length > 0
            || criterion.confidence < 0.85;
        const decisionChanged = origin ? !gradingDecisionMatchesOrigin(criterion, origin) : true;
        const reviewRequired = origin?.reviewRequired === true || derivedReviewRequired || decisionChanged;
        if (criterion.reviewRequired !== reviewRequired) issues.push(issue(['grading', 'criteria', index, 'reviewRequired'], '서버가 보존한 교사 확인 출처와 현재 결정 출처가 일치해야 합니다.'));
        if (reviewRequired && criterion.decisionSource !== 'teacher') issues.push(issue(['grading', 'criteria', index, 'decisionSource'], 'AI 추천에서 변경하거나 교사 확인으로 해소한 수준은 교사 선택으로만 확정할 수 있습니다.'));
        total += level?.score ?? 0;
        return { ...criterion, sourceRefs: refs, ...(revisionEvidence ? { revisionEvidence } : {}) };
    });
    const requiredIds = gradingEvidenceRiskIds(input, input.elements);
    for (const id of new Set(requiredIds)) if (!input.confirmedElementIds.includes(id)) issues.push(issue(['confirmedElementIds'], `${id} 원본 근거를 확인해야 합니다.`));
    const provisionalTotal = criteria.reduce((sum, criterion) => sum + (criterion.status === 'scored' ? criterion.score : 0), 0);
    if (input.grading.provisionalTotal !== provisionalTotal) issues.push(issue(['grading', 'provisionalTotal'], '현재 수준 선택으로 임시 합계를 다시 계산해야 합니다.'));
    if (issues.length) return { success: false, issues };
    return { success: true, data: { ...input.grading, criteria, provisionalTotal: total, totalScore: total, sourceHash: currentHash } };
}

async function generate(input) {
    try {
        const first = await chatContent({ messages: gradingMessages(input), timeoutMs: 60000 });
        let checked = parseGrading(first, input);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairGradingMessages(input, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseGrading(repaired, input);
        }
        if (!checked.success) return json({ code: 'invalid_generation', message: '채점 결과의 수준·근거·원본 연결을 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return json({ grading: checked.data, gradingRevision: input.gradingRevision + 1 });
    } catch (error) {
        if (error instanceof UpstageError) return json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}

export async function POST(request) {
    let body;
    try { body = await request.json(); } catch { return json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    if (body?.mode === 'finalize') {
        const parsed = finalizeRequestSchema.safeParse(body);
        if (!parsed.success) return json({ code: 'invalid_request', message: '확정할 채점과 원본 확인 정보를 확인해주세요.', issues: parsed.error.issues }, { status: 400 });
        const parsedGrading = storedGradingSchema.safeParse(parsed.data.grading);
        if (!parsedGrading.success) return json({ code: 'approval_blocked', message: '모든 평가영역의 근거·이유·피드백을 입력해야 승인할 수 있습니다.', issues: parsedGrading.error.issues, grading: parsed.data.grading }, { status: 409 });
        const input = { ...parsed.data, grading: parsedGrading.data };
        if (hasDuplicateElementIds(input.elements)) return json({ code: 'approval_blocked', message: 'OCR 요소 id가 중복되어 원본 근거를 확정할 수 없습니다.', grading: input.grading }, { status: 409 });
        if (!gradingIntegrityAvailable()) return json({ code: 'integrity_unavailable', message: '채점 무결성 설정을 확인해주세요.', grading: input.grading }, { status: 503 });
        const checked = finalizeGrading(input);
        if (!checked.success) return json({ code: 'approval_blocked', message: '현재 원본·루브릭·근거 확인이 모두 끝나야 승인할 수 있습니다.', issues: checked.issues, grading: input.grading }, { status: 409 });
        const approvalToken = createGradingApprovalToken(input.assessment, input.extractedText, input.elements, gradingProvenance(input), checked.data, input);
        return json({ grading: { ...checked.data, approvalToken }, gradingRevision: input.gradingRevision });
    }
    const parsed = generateRequestSchema.safeParse(body);
    if (!parsed.success) return json({ code: 'invalid_request', message: '채점할 학생 내용과 루브릭을 확인해주세요.', issues: parsed.error.issues }, { status: 400 });
    if (hasDuplicateElementIds(parsed.data.elements)) return json({ code: 'invalid_request', message: 'OCR 요소 id가 중복되어 채점할 수 없습니다.' }, { status: 400 });
    if (!gradingIntegrityAvailable()) return json({ code: 'integrity_unavailable', message: '채점 무결성 설정을 확인해주세요.' }, { status: 503 });
    return generate(parsed.data);
}
