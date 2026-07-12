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

const submissionSchema = z.object({
    id: z.string().min(1).max(200), studentId: z.string().min(1).max(300).nullable().default(null), studentName: z.string().min(1).max(100), approved: z.literal(true),
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
const requestSchema = z.object({ lessonPlan: lessonPlanSchema, assessment: approvedAssessmentSchema, submission: submissionSchema, targetLength: z.number().int().min(300).max(1000).default(500) });

function parseRecord(content, targetLength) {
    try {
        const value = JSON.parse(content);
        const parsed = recordOutputSchema.safeParse(value);
        if (!parsed.success) return { success: false, value, issues: parsed.error.issues };
        if (parsed.data.text.length > targetLength) return { success: false, value, issues: [{ path: ['text'], message: `${targetLength}자 이내로 작성해야 합니다.` }] };
        return { success: true, data: parsed.data };
    } catch (error) { return { success: false, value: content, issues: [{ path: [], message: `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}` }] }; }
}

export async function POST(request) {
    let body;
    try { body = await request.json(); } catch { return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_request', message: '승인된 채점 결과와 입력 내용을 확인해주세요.', issues: parsed.error.issues }, { status: 400 });
    const input = parsed.data;
    if (input.assessment.sourceHash !== sourceHash(input.lessonPlan)) return Response.json({ code: 'stale_assessment', message: '현재 지도안으로 수행평가를 다시 생성하고 승인해주세요.' }, { status: 409 });
    if (!gradingIntegrityAvailable()) return Response.json({ code: 'integrity_unavailable', message: '채점 무결성 설정을 확인해주세요.' }, { status: 503 });
    const provenance = canonicalGradingProvenance(input.submission);
    const originProvenance = canonicalGradingProvenance({ ...input.submission, gradingRevision: input.submission.grading.originRevision });
    if (!verifyGradingOriginToken(input.submission.grading.originToken, input.assessment, input.submission.extractedText, input.submission.elements, originProvenance, input.submission.grading.reviewOrigins)
        || !verifyGradingApprovalToken(input.submission.grading.approvalToken, input.assessment, input.submission.extractedText, input.submission.elements, provenance, input.submission.grading, input.submission)) {
        return Response.json({ code: 'stale_grading', message: '서버가 승인한 현재 채점 결과만 세특에 사용할 수 있습니다.' }, { status: 409 });
    }
    if (!gradingIsCurrent(input.assessment, input.submission)) return Response.json({ code: 'stale_grading', message: '현재 수행평가로 다시 채점하고 승인해주세요.' }, { status: 409 });
    try {
        const first = await chatContent({ messages: recordMessages(input), timeoutMs: 60000 });
        let checked = parseRecord(first, input.targetLength);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairRecordMessages(input, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseRecord(repaired, input.targetLength);
        }
        if (!checked.success) return Response.json({ code: 'invalid_generation', message: '세특 초안의 길이와 기록 문체를 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return Response.json({ record: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
