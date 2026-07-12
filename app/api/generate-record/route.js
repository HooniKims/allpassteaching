import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { approvedAssessmentSchema } from '@/lib/assessment-schema';
import { storedGradingSchema } from '@/lib/grading-schema';
import { canonicalGradingProvenance } from '@/lib/grading-evidence';
import { gradingIntegrityAvailable, verifyGradingApprovalToken, verifyGradingOriginToken } from '@/lib/grading-origin-token';
import { gradingIsCurrent } from '@/lib/workflow-lineage';
import { sourceHash } from '@/lib/source-hash';
import { recordOutputSchema } from '@/lib/record-schema';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { recordMessages, repairRecordMessages } from '@/lib/workflow-prompts';
import { recordEvidenceBundle } from '@/lib/record-evidence';
import { hasUnsupportedGrowthInference } from '@/lib/record-schema';
import { recordContextIncludesSubmission, verifyRecordContext } from '@/lib/record-context-token';
import { canonicalJson } from '@/lib/source-hash';

const noStoreHeaders = { 'Cache-Control': 'no-store' };
const json = (body, init = {}) => Response.json(body, { ...init, headers: { ...init.headers, ...noStoreHeaders } });

const studentSchema = z.object({
    id: z.string().min(1).max(300), grade: z.string().max(20), className: z.string().max(30),
    number: z.number().int().min(1).max(1000).nullable(), name: z.string().min(1).max(100),
}).strict();

const submissionSchema = z.object({
    id: z.string().min(1).max(200), studentId: z.string().min(1).max(300), studentName: z.string().min(1).max(100), approved: z.literal(true),
    extractedText: z.string().min(10).max(100000), grading: storedGradingSchema, sourceHash: z.string().min(1).max(100),
    elements: z.array(z.object({
        id: z.string().min(1).max(300), page: z.number().int().min(1).max(10000), category: z.string().min(1).max(50),
        text: z.string().max(5000), coordinates: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).max(16),
        confidence: z.number().min(0).max(1).optional(),
    })).max(2000).default([]),
    originalRevision: z.number().int().min(1).default(1), gradingRevision: z.number().int().min(0).default(0), elementsTruncated: z.boolean().default(false),
    visualAnalysisStatus: z.enum(['not_requested', 'enhanced_used', 'enhanced_unavailable', 'enhanced_failed']).default('not_requested'),
    autoScoreAllowed: z.boolean().default(true), requiresVisualReview: z.boolean().default(false),
    originalAttached: z.literal(true), originalReviewedAt: z.string().datetime(), reviewedOriginalRevision: z.number().int().min(1),
    confirmedElementIds: z.array(z.string().min(1).max(300)).max(2004).default([]),
});
const recordContextSchema = z.object({
    payload: z.object({
        version: z.literal(1), lessonDigest: z.string().regex(/^[a-f0-9]{64}$/), assessmentDigest: z.string().regex(/^[a-f0-9]{64}$/),
        rosterDigest: z.string().regex(/^[a-f0-9]{64}$/), rosterStudentIds: z.array(z.string().min(1).max(300)).max(50),
        approvalLineages: z.array(z.object({
            id: z.string().min(1).max(200), studentId: z.string().min(1).max(300), sourceHash: z.string().min(1).max(100),
            gradingRevision: z.number().int().min(0), gradingSourceHash: z.string().min(1).max(100),
            originToken: z.string().regex(/^[a-f0-9]{64}$/), approvalToken: z.string().regex(/^[a-f0-9]{64}$/),
        }).strict()).max(50),
        projectRevision: z.string().regex(/^[a-f0-9]{64}$/), issuedAt: z.number().int(), expiresAt: z.number().int(),
    }).strict(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const requestSchema = z.object({
    lessonPlan: lessonPlanSchema, assessment: approvedAssessmentSchema, roster: z.array(studentSchema).min(1).max(50),
    recordContext: recordContextSchema, student: studentSchema, submission: submissionSchema,
    targetLength: z.number().int().min(300).max(1000).default(500),
}).strict();

const claimSchema = z.object({
    text: z.string().trim().min(1).max(1000),
    kind: z.enum(['performance', 'revision', 'next_step']),
    criterionIds: z.array(z.string().min(1).max(300)).min(1).max(15),
    evidenceQuotes: z.array(z.object({ criterionId: z.string().min(1).max(300), quote: z.string().trim().min(1).max(5000) }).strict()).min(1).max(15),
    sourceRefs: z.array(z.object({ criterionId: z.string().min(1).max(300), elementId: z.string().min(1).max(300), page: z.number().int().min(1).max(10000) }).strict()).min(1).max(15),
}).strict();

function parseRecord(content, targetLength, evidence) {
    try {
        const value = JSON.parse(content);
        const parsedClaims = z.object({ claims: z.array(claimSchema).min(1).max(10) }).strict().safeParse(value);
        if (!parsedClaims.success) return { success: false, value, issues: parsedClaims.error.issues };
        const allowedIds = new Set(evidence.criteria.map(item => item.criterionId));
        const growthIds = new Set(evidence.growthEvidence.map(item => item.criterionId));
        const issues = [];
        parsedClaims.data.claims.forEach((claim, index) => {
            if (claim.criterionIds.some(id => !allowedIds.has(id))) issues.push({ path: ['claims', index, 'criterionIds'], message: '승인된 평가영역 id만 연결해야 합니다.' });
            claim.evidenceQuotes.forEach((citation, citationIndex) => {
                const criterion = evidence.criteria.find(item => item.criterionId === citation.criterionId);
                const revision = evidence.growthEvidence.find(item => item.criterionId === citation.criterionId)?.revisionEvidence;
                const allowedQuotes = [criterion?.evidence, revision?.beforeEvidence, revision?.afterEvidence].filter(Boolean);
                if (!claim.criterionIds.includes(citation.criterionId) || !allowedQuotes.some(quote => quote.includes(citation.quote))) issues.push({ path: ['claims', index, 'evidenceQuotes', citationIndex], message: '주장에 연결한 직접 인용은 승인된 근거 원문에 있어야 합니다.' });
            });
            claim.sourceRefs.forEach((citation, citationIndex) => {
                const criterion = evidence.criteria.find(item => item.criterionId === citation.criterionId);
                const revision = evidence.growthEvidence.find(item => item.criterionId === citation.criterionId)?.revisionEvidence;
                const allowedRefs = [...(criterion?.sourceRefs ?? []), revision?.beforeSourceRef, revision?.afterSourceRef].filter(Boolean);
                if (!claim.criterionIds.includes(citation.criterionId) || !allowedRefs.some(ref => ref.elementId === citation.elementId && ref.page === citation.page)) issues.push({ path: ['claims', index, 'sourceRefs', citationIndex], message: '주장에 연결한 원본 위치는 승인된 근거와 일치해야 합니다.' });
            });
            const linkedGrowth = claim.criterionIds.some(id => growthIds.has(id));
            if (claim.kind === 'revision' && !linkedGrowth) issues.push({ path: ['claims', index, 'criterionIds'], message: '수정 주장은 실제 수정 근거 평가영역과 연결해야 합니다.' });
            if (claim.kind !== 'revision' && hasUnsupportedGrowthInference(claim.text, false)) issues.push({ path: ['claims', index, 'text'], message: '성장 주장은 실제 수정 근거와 revision 유형으로 연결해야 합니다.' });
        });
        if (issues.length) return { success: false, value, issues };
        const record = { text: parsedClaims.data.claims.map(claim => claim.text).join(' '), claims: parsedClaims.data.claims, evidenceCriterionIds: [...new Set(parsedClaims.data.claims.flatMap(claim => claim.criterionIds))] };
        const parsed = recordOutputSchema.safeParse({ text: record.text });
        if (!parsed.success) return { success: false, value, issues: parsed.error.issues };
        if (record.text.length > targetLength) return { success: false, value, issues: [{ path: ['text'], message: `${targetLength}자 이내로 작성해야 합니다.` }] };
        return { success: true, data: record };
    } catch (error) { return { success: false, value: content, issues: [{ path: [], message: `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}` }] }; }
}

export async function POST(request) {
    let body;
    try { body = await request.json(); } catch { return json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return json({ code: 'invalid_request', message: '현재 명단과 승인된 채점 결과를 확인해주세요.', issues: parsed.error.issues }, { status: 400 });
    const input = parsed.data;
    if (!verifyRecordContext(input.recordContext, { lessonPlan: input.lessonPlan, assessment: input.assessment, students: input.roster })
        || !recordContextIncludesSubmission(input.recordContext, input.submission)) {
        return json({ code: 'stale_context', message: '학생 명단 또는 승인 결과가 변경되었습니다. 다시 생성해주세요.' }, { status: 409 });
    }
    const rosterStudent = input.roster.find(item => item.id === input.submission.studentId);
    if (!rosterStudent || canonicalJson(rosterStudent) !== canonicalJson(input.student)) return json({ code: 'stale_context', message: '현재 학생 명단과 연결된 제출물만 사용할 수 있습니다.' }, { status: 409 });
    if (input.student.id !== input.submission.studentId) return json({ code: 'stale_student', message: '현재 학생 명단과 연결된 제출물만 사용할 수 있습니다.' }, { status: 409 });
    if (input.assessment.sourceHash !== sourceHash(input.lessonPlan)) return json({ code: 'stale_assessment', message: '현재 지도안으로 수행평가를 다시 생성하고 승인해주세요.' }, { status: 409 });
    if (!gradingIntegrityAvailable()) return json({ code: 'integrity_unavailable', message: '채점 무결성 설정을 확인해주세요.' }, { status: 503 });
    const provenance = canonicalGradingProvenance(input.submission);
    const originProvenance = canonicalGradingProvenance({ ...input.submission, gradingRevision: input.submission.grading.originRevision });
    if (!verifyGradingOriginToken(input.submission.grading.originToken, input.assessment, input.submission.extractedText, input.submission.elements, originProvenance, input.submission.grading.reviewOrigins)
        || !verifyGradingApprovalToken(input.submission.grading.approvalToken, input.assessment, input.submission.extractedText, input.submission.elements, provenance, input.submission.grading, input.submission)) {
        return json({ code: 'stale_grading', message: '서버가 승인한 현재 채점 결과만 세특에 사용할 수 있습니다.' }, { status: 409 });
    }
    if (!gradingIsCurrent(input.assessment, input.submission)) return json({ code: 'stale_grading', message: '현재 수행평가로 다시 채점하고 승인해주세요.' }, { status: 409 });
    const evidence = recordEvidenceBundle(input.assessment, input.submission);
    try {
        const first = await chatContent({ messages: recordMessages(input), timeoutMs: 60000 });
        let checked = parseRecord(first, input.targetLength, evidence);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairRecordMessages(input, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseRecord(repaired, input.targetLength, evidence);
        }
        if (!checked.success) return json({ code: 'invalid_generation', message: '세특 초안의 길이와 기록 문체를 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return json({ record: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
