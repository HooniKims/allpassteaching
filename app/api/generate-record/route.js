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
import { compressRecordMessages, recordMessages, repairRecordMessages } from '@/lib/workflow-prompts';
import { recordEvidenceBundle } from '@/lib/record-evidence';
import { hasUnsupportedGrowthInference } from '@/lib/record-schema';
import { recordContextIncludesSubmission, verifyRecordContext } from '@/lib/record-context-token';
import { canonicalJson } from '@/lib/source-hash';
import { parseBoundedJsonRequest, publicValidationIssues, requestBoundaryError } from '@/lib/api-request-boundary';
import { MAX_RECORD_TARGET_BYTES, MIN_RECORD_TARGET_BYTES, normalizeRecordTargetBytes, recordUtf8ByteLength } from '@/lib/record-length';

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
    targetBytes: z.number().int().min(MIN_RECORD_TARGET_BYTES).max(MAX_RECORD_TARGET_BYTES).optional(),
    targetLength: z.number().int().min(MIN_RECORD_TARGET_BYTES).max(1000).optional(),
}).strict().transform(value => ({ ...value, targetBytes: value.targetBytes ?? normalizeRecordTargetBytes(value.targetLength) }));

const claimSchema = z.object({
    text: z.string().trim().min(1).max(1000),
    kind: z.enum(['performance', 'revision', 'next_step']),
    criterionIds: z.array(z.string().min(1).max(300)).min(1).max(15),
    evidenceQuotes: z.array(z.object({ criterionId: z.string().min(1).max(300), stage: z.enum(['performance', 'before', 'after']), quote: z.string().trim().min(1).max(5000) }).strict()).min(1).max(15),
    sourceRefs: z.array(z.object({ criterionId: z.string().min(1).max(300), elementId: z.string().min(1).max(300), page: z.number().int().min(1).max(10000) }).strict()).min(1).max(15),
}).strict();

function parseRecord(content, targetBytes, evidence) {
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
                const allowedQuote = citation.stage === 'performance' ? criterion?.evidence : citation.stage === 'before' ? revision?.beforeEvidence : revision?.afterEvidence;
                if (!claim.criterionIds.includes(citation.criterionId) || allowedQuote !== citation.quote || (claim.kind !== 'revision' && citation.stage !== 'performance')) issues.push({ path: ['claims', index, 'evidenceQuotes', citationIndex], message: '주장에 연결한 직접 인용은 같은 단계의 승인 근거 원문 전체와 일치해야 합니다.' });
            });
            claim.sourceRefs.forEach((citation, citationIndex) => {
                const criterion = evidence.criteria.find(item => item.criterionId === citation.criterionId);
                const revision = evidence.growthEvidence.find(item => item.criterionId === citation.criterionId)?.revisionEvidence;
                const allowedRefs = [...(criterion?.sourceRefs ?? []), revision?.beforeSourceRef, revision?.afterSourceRef].filter(Boolean);
                if (!claim.criterionIds.includes(citation.criterionId) || !allowedRefs.some(ref => ref.elementId === citation.elementId && ref.page === citation.page)) issues.push({ path: ['claims', index, 'sourceRefs', citationIndex], message: '주장에 연결한 원본 위치는 승인된 근거와 일치해야 합니다.' });
            });
            const linkedGrowth = claim.criterionIds.some(id => growthIds.has(id));
            if (claim.kind === 'revision') {
                const unsupportedIds = claim.criterionIds.filter(id => !growthIds.has(id));
                if (!linkedGrowth || unsupportedIds.length) issues.push({ path: ['claims', index, 'criterionIds'], message: '수정 주장의 모든 평가영역은 구조화된 수정 전후 근거가 있어야 합니다.' });
                claim.criterionIds.filter(id => growthIds.has(id)).forEach(criterionId => {
                    const revision = evidence.growthEvidence.find(item => item.criterionId === criterionId)?.revisionEvidence;
                    const quotes = claim.evidenceQuotes.filter(item => item.criterionId === criterionId);
                    const refs = claim.sourceRefs.filter(item => item.criterionId === criterionId);
                    const citesBefore = revision && quotes.some(item => item.stage === 'before' && item.quote === revision.beforeEvidence)
                        && refs.some(ref => ref.elementId === revision.beforeSourceRef.elementId && ref.page === revision.beforeSourceRef.page);
                    const citesAfter = revision && quotes.some(item => item.stage === 'after' && item.quote === revision.afterEvidence)
                        && refs.some(ref => ref.elementId === revision.afterSourceRef.elementId && ref.page === revision.afterSourceRef.page);
                    if (!revision?.changeReason?.trim() || !citesBefore || !citesAfter) issues.push({ path: ['claims', index], message: `${criterionId} 수정 주장은 같은 평가영역의 수정 전·후 직접 근거와 원본 위치를 모두 연결해야 합니다.` });
                });
                const expectedQuotes = claim.criterionIds.filter(id => growthIds.has(id)).flatMap(criterionId => {
                    const revision = evidence.growthEvidence.find(item => item.criterionId === criterionId)?.revisionEvidence;
                    return revision ? [`${criterionId}\0before\0${revision.beforeEvidence}`, `${criterionId}\0after\0${revision.afterEvidence}`] : [];
                });
                const actualQuotes = claim.evidenceQuotes.map(item => `${item.criterionId}\0${item.stage}\0${item.quote}`);
                const expectedRefs = claim.criterionIds.filter(id => growthIds.has(id)).flatMap(criterionId => {
                    const revision = evidence.growthEvidence.find(item => item.criterionId === criterionId)?.revisionEvidence;
                    return revision ? [`${criterionId}\0${revision.beforeSourceRef.elementId}\0${revision.beforeSourceRef.page}`, `${criterionId}\0${revision.afterSourceRef.elementId}\0${revision.afterSourceRef.page}`] : [];
                });
                const actualRefs = claim.sourceRefs.map(item => `${item.criterionId}\0${item.elementId}\0${item.page}`);
                const exactQuotes = expectedQuotes.length === actualQuotes.length && new Set(actualQuotes).size === actualQuotes.length && actualQuotes.every(item => expectedQuotes.includes(item));
                const exactRefs = expectedRefs.length === actualRefs.length && new Set(actualRefs).size === actualRefs.length && actualRefs.every(item => expectedRefs.includes(item));
                if (!exactQuotes || !exactRefs) issues.push({ path: ['claims', index], message: '수정 주장은 같은 평가영역의 수정 전·후 인용과 원본 위치만 정확히 한 번씩 포함해야 합니다.' });
            }
            if (claim.kind !== 'revision' && hasUnsupportedGrowthInference(claim.text, false)) issues.push({ path: ['claims', index, 'text'], message: '성장 주장은 실제 수정 근거와 revision 유형으로 연결해야 합니다.' });
        });
        if (issues.length) return { success: false, value, issues };
        const record = { text: parsedClaims.data.claims.map(claim => claim.text).join(' '), claims: parsedClaims.data.claims, evidenceCriterionIds: [...new Set(parsedClaims.data.claims.flatMap(claim => claim.criterionIds))] };
        const parsed = recordOutputSchema.safeParse({ text: record.text });
        if (!parsed.success) return { success: false, value, issues: parsed.error.issues };
        if (recordUtf8ByteLength(record.text) > targetBytes) return { success: false, value, issues: [{ path: ['text'], message: `${targetBytes}byte 이내로 작성해야 합니다.` }] };
        return { success: true, data: record };
    } catch (error) { return { success: false, value: content, issues: [{ path: [], message: `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}` }] }; }
}

export async function POST(request) {
    const boundary = await parseBoundedJsonRequest(request);
    if (!boundary.ok) {
        const error = requestBoundaryError(boundary.reason);
        return json(error.body, { status: error.status });
    }
    const body = boundary.value;
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return json({ code: 'invalid_request', message: '현재 명단과 승인된 채점 결과를 확인해주세요.', issues: publicValidationIssues(parsed.error.issues) }, { status: 400 });
    const input = parsed.data;
    if (input.recordContext.payload.expiresAt <= Date.now()) return json({ code: 'expired_context', message: '생성 권한 확인 시간이 만료되었습니다. 현재 상태를 다시 확인해주세요.' }, { status: 409 });
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
        let checked = parseRecord(first, input.targetBytes, evidence);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairRecordMessages(input, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseRecord(repaired, input.targetBytes, evidence);
        }
        // 길이 초과만 남은 실패는 하드 실패 대신 인용을 유지한 채 본문만 줄이는 압축 재시도로 복구한다.
        if (!checked.success && checked.issues.every(issue => issue.path?.[0] === 'text' && String(issue.message).includes('이내로 작성'))) {
            const compressed = await chatContent({ messages: compressRecordMessages(input, checked.value), timeoutMs: 60000 });
            checked = parseRecord(compressed, input.targetBytes, evidence);
        }
        if (!checked.success) return json({ code: 'invalid_generation', message: '세특 초안의 길이와 기록 문체를 복구하지 못했습니다.', issues: publicValidationIssues(checked.issues) }, { status: 422 });
        return json({ record: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
