import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { approvedAssessmentSchema } from '@/lib/assessment-schema';
import { storedGradingSchema } from '@/lib/grading-schema';
import { gradingIsCurrent } from '@/lib/workflow-lineage';
import { sourceHash } from '@/lib/source-hash';
import { recordOutputSchema } from '@/lib/record-schema';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { recordMessages, repairRecordMessages } from '@/lib/workflow-prompts';

const submissionSchema = z.object({
    id: z.string().min(1).max(200), studentName: z.string().min(1).max(100), approved: z.literal(true),
    extractedText: z.string().min(10).max(100000), grading: storedGradingSchema, sourceHash: z.string().min(1).max(100),
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
