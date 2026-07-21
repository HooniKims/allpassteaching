import { z } from 'zod';
import { assessmentDesignSchema, assessmentOutputSchema } from '@/lib/assessment-schema';
import { mergeRegeneratedCriterion } from '@/lib/rubric-score';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { criterionRegenerationMessages } from '@/lib/workflow-prompts';

const requestSchema = z.object({ assessment: z.union([assessmentOutputSchema, assessmentDesignSchema]), criterionId: z.string().trim().min(1).max(300) });
const wordingSchema = z.object({
    name: z.string().trim().min(1).max(300), description: z.string().trim().min(1).max(5000), standardCodes: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
    kind: z.enum(['outcome', 'process']), evidence: z.string().trim().min(1).max(5000),
    levels: z.array(z.object({ levelId: z.string().trim().min(1).max(300), description: z.string().trim().min(1).max(5000) })).min(2).max(6),
});

export async function POST(request) {
    let body;
    try { body = await request.json(); } catch { return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_request', message: '현재 수행평가와 평가영역을 확인해주세요.', issues: parsed.error.issues }, { status: 400 });
    const criterion = parsed.data.assessment.rubric.criteria.find(item => item.id === parsed.data.criterionId);
    if (!criterion) return Response.json({ code: 'criterion_not_found', message: '선택한 평가영역을 찾지 못했습니다.' }, { status: 404 });
    try {
        const content = await chatContent({ messages: criterionRegenerationMessages(parsed.data.assessment, criterion), timeoutMs: 45000 });
        let value;
        try { value = JSON.parse(content); } catch { return Response.json({ code: 'invalid_generation', message: 'AI 평가영역 형식을 확인하지 못했습니다.' }, { status: 422 }); }
        const wording = wordingSchema.safeParse(value);
        if (!wording.success) return Response.json({ code: 'invalid_generation', message: 'AI 평가영역 내용을 확인하지 못했습니다.', issues: wording.error.issues }, { status: 422 });
        const allowedStandards = new Set(parsed.data.assessment.task.standards.map(item => item.code));
        const expectedLevels = criterion.levels.map(item => item.levelId);
        if (wording.data.standardCodes.some(code => !allowedStandards.has(code)) || wording.data.levels.map(item => item.levelId).join('|') !== expectedLevels.join('|')) return Response.json({ code: 'invalid_generation', message: '성취기준 또는 수준 연결이 바뀌어 제안을 적용하지 않았습니다.' }, { status: 422 });
        return Response.json({ criterion: mergeRegeneratedCriterion(criterion, wording.data) });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
