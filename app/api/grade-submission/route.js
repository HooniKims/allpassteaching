import { z } from 'zod';
import { approvedAssessmentSchema } from '@/lib/assessment-schema';
import { evidenceCoordinatesUsable } from '@/lib/evidence-coordinates';
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
    extractedText: z.string().trim().min(20).max(MAX_OCR_TEXT_LENGTH),
    elements: z.array(documentElementSchema).max(2000).default([]),
    elementsTruncated: z.boolean().default(false),
});
const generateRequestSchema = commonSchema.extend({
    mode: z.literal('generate').optional(),
    studentName: z.string().trim().min(1).max(100),
    visualAnalysisStatus: z.enum(['not_requested', 'enhanced_used', 'enhanced_unavailable', 'enhanced_failed']).default('not_requested'),
    autoScoreAllowed: z.boolean().default(true),
});
const finalizeRequestSchema = commonSchema.extend({
    mode: z.literal('finalize'), grading: z.unknown(), originalAttached: z.literal(true),
    originalReviewedAt: z.string().datetime(), originalRevision: z.number().int().min(1), reviewedOriginalRevision: z.number().int().min(1),
    confirmedElementIds: z.array(shortText).max(2001).default([]),
});

const SAFE_TEXT_CATEGORIES = new Set(['text', 'paragraph', 'heading', 'list']);
const json = (body, init = {}) => Response.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...(init.headers ?? {}) } });
const issue = (path, message) => ({ path, message });

function canonicalSourceRefs(sourceRefs, elements, path, issues) {
    const elementById = new Map(elements.map(element => [element.id, element]));
    const seen = new Set();
    const result = [];
    sourceRefs.forEach((sourceRef, index) => {
        const element = elementById.get(sourceRef.elementId);
        if (!element || element.page !== sourceRef.page) {
            issues.push(issue([...path, index], '현재 OCR 요소에 존재하는 id와 페이지를 사용해야 합니다.'));
            return;
        }
        if (seen.has(element.id)) return;
        seen.add(element.id);
        result.push(gradingSourceRefSchema.parse({ elementId: element.id, page: element.page, text: element.text, coordinates: element.coordinates }));
    });
    return result;
}

function sourceNeedsReview(element) {
    return !SAFE_TEXT_CATEGORIES.has(element?.category)
        || (Number.isFinite(element?.confidence) && element.confidence < 0.85)
        || !evidenceCoordinatesUsable(element?.coordinates);
}

function reviewReasonFor(input, sourceElements, criterion) {
    if (input.elementsTruncated) return 'OCR 요소가 일부 생략되어 원본 전체를 교사가 확인해야 합니다.';
    if (['enhanced_unavailable', 'enhanced_failed'].includes(input.visualAnalysisStatus)) return 'Enhanced 분석을 사용할 수 없어 일반 OCR 결과를 원본과 대조해야 합니다.';
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
        const directEvidence = input.extractedText.includes(criterion.evidence)
            || refs.some(ref => elementById.get(ref.elementId)?.text.includes(criterion.evidence) || criterion.evidence.includes(elementById.get(ref.elementId)?.text ?? ''));
        if (criterion.status === 'scored') {
            const level = rubricCriterion.levels.find(item => item.levelId === criterion.selectedLevelId);
            if (!level || level.score !== criterion.score) issues.push(issue(['criteria', index, 'score'], `${rubricCriterion.name}은 현재 루브릭 수준에 정의된 점수만 사용할 수 있습니다.`));
        }
        const sourceElements = refs.map(ref => elementById.get(ref.elementId));
        const forcedReason = reviewReasonFor(input, sourceElements, { ...criterion, sourceRefs: refs });
        if (criterion.status === 'teacher_review' || forcedReason || !directEvidence) {
            return {
                status: 'teacher_review', criterionId: criterion.criterionId, selectedLevelId: null, score: null,
                evidence: criterion.evidence, reviewReason: forcedReason || criterion.reviewReason || '직접 근거가 OCR 원문과 일치하지 않아 원본 확인이 필요합니다.',
                confidence: criterion.confidence, sourceRefs: refs, teacherConfirmed: false,
            };
        }
        return { ...criterion, decisionSource: 'ai', sourceRefs: refs, teacherConfirmed: false };
    });
    if (issues.length) return { success: false, value, issues };
    const provisionalTotal = criteria.reduce((sum, criterion) => sum + (criterion.status === 'scored' ? criterion.score : 0), 0);
    return { success: true, data: { ...parsed.data, criteria, provisionalTotal, totalScore: null, sourceHash: gradingSourceHash(input.assessment, input.extractedText) } };
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
    const currentHash = gradingSourceHash(input.assessment, input.extractedText);
    if (input.grading.sourceHash !== currentHash) issues.push(issue(['grading', 'sourceHash'], 'OCR 원문 또는 루브릭이 바뀌어 다시 채점해야 합니다.'));
    if (input.reviewedOriginalRevision !== input.originalRevision) issues.push(issue(['reviewedOriginalRevision'], '현재 연결된 원본 PDF를 다시 확인해야 합니다.'));
    const expected = input.assessment.rubric.criteria;
    if (input.grading.criteria.length !== expected.length) issues.push(issue(['grading', 'criteria'], '모든 평가영역을 확인해야 합니다.'));
    const elementById = new Map(input.elements.map(element => [element.id, element]));
    let total = 0;
    const criteria = input.grading.criteria.map((criterion, index) => {
        const rubricCriterion = expected[index];
        const refs = canonicalSourceRefs(criterion.sourceRefs, input.elements, ['grading', 'criteria', index, 'sourceRefs'], issues);
        if (!rubricCriterion || criterion.criterionId !== rubricCriterion.id) issues.push(issue(['grading', 'criteria', index, 'criterionId'], '현재 루브릭 평가영역 id와 순서를 보존해야 합니다.'));
        if (criterion.status !== 'scored') {
            issues.push(issue(['grading', 'criteria', index], '교사 확인 필요 영역의 수준을 먼저 선택해야 합니다.'));
            return { ...criterion, sourceRefs: refs };
        }
        const level = rubricCriterion?.levels.find(item => item.levelId === criterion.selectedLevelId);
        if (!level || level.score !== criterion.score) issues.push(issue(['grading', 'criteria', index, 'score'], '현재 루브릭에 정의된 수준 점수만 확정할 수 있습니다.'));
        if (!refs.length) issues.push(issue(['grading', 'criteria', index, 'sourceRefs'], '하나 이상의 현재 원본 근거를 연결해야 합니다.'));
        if (!criterion.teacherConfirmed) issues.push(issue(['grading', 'criteria', index, 'teacherConfirmed'], '근거와 수준을 교사가 확인해야 합니다.'));
        const evidenceMatches = input.extractedText.includes(criterion.evidence) || refs.some(ref => {
            const text = elementById.get(ref.elementId)?.text ?? '';
            return text.includes(criterion.evidence) || criterion.evidence.includes(text);
        });
        if (!evidenceMatches) issues.push(issue(['grading', 'criteria', index, 'evidence'], '근거는 현재 OCR 원문 또는 연결 요소에 실제로 있어야 합니다.'));
        total += level?.score ?? 0;
        return { ...criterion, sourceRefs: refs };
    });
    const requiredIds = input.elements.filter(sourceNeedsReview).map(element => element.id);
    if (input.elementsTruncated) requiredIds.push('__elements_truncated__');
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
        return json({ grading: checked.data });
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
        const checked = finalizeGrading(input);
        if (!checked.success) return json({ code: 'approval_blocked', message: '현재 원본·루브릭·근거 확인이 모두 끝나야 승인할 수 있습니다.', issues: checked.issues, grading: input.grading }, { status: 409 });
        return json({ grading: checked.data });
    }
    const parsed = generateRequestSchema.safeParse(body);
    if (!parsed.success) return json({ code: 'invalid_request', message: '채점할 학생 내용과 루브릭을 확인해주세요.', issues: parsed.error.issues }, { status: 400 });
    return generate(parsed.data);
}
