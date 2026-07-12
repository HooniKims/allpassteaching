import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { assessmentIntentSuggestionMessages } from '@/lib/workflow-prompts';

const requestSchema = z.object({ lessonPlan: lessonPlanSchema, desiredResult: z.string().trim().min(1).max(5000) });
const responseSchema = z.object({ evidenceOfSuccess: z.string().trim().min(1).max(5000), growthProcess: z.string().trim().min(1).max(5000) });

export async function POST(request) {
    let body;
    try { body = await request.json(); } catch { return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_request', message: '평가의 도착점을 먼저 입력해주세요.', issues: parsed.error.issues }, { status: 400 });
    try {
        const content = await chatContent({ messages: assessmentIntentSuggestionMessages(parsed.data.lessonPlan, parsed.data.desiredResult), timeoutMs: 45000 });
        let value;
        try { value = JSON.parse(content); } catch { return Response.json({ code: 'invalid_generation', message: 'AI 제안 형식을 확인하지 못했습니다.' }, { status: 422 }); }
        const suggestion = responseSchema.safeParse(value);
        if (!suggestion.success) return Response.json({ code: 'invalid_generation', message: 'AI 제안 내용을 확인하지 못했습니다.', issues: suggestion.error.issues }, { status: 422 });
        return Response.json({ suggestion: suggestion.data });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
