import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { chatJson, UpstageError } from '@/lib/upstage/client';
import { lessonPlanMessages, repairLessonPlanMessages } from '@/lib/upstage/prompts';

const draftSchema = z.object({
    basics: z.object({ schoolLevel: z.enum(['elementary','middle','high']), grade: z.string(), subject: z.string(), mode: z.enum(['single','multi']), sessions: z.number().int().min(1).max(10), sessionMinutes: z.number().int().positive().default(40), intent: z.string().min(2), studentNeeds: z.string().default('') }),
    standards: z.array(z.object({ code: z.string(), text: z.string() })).min(1),
    instructionModel: z.object({ id: z.string(), name: z.string(), stages: z.array(z.string()) }).passthrough(),
});

function validAgainstDraft(plan, draft) {
    const allowed = new Set(draft.standards.map(item => item.code));
    return plan.standards.every(item => allowed.has(item.code)) && plan.sessions.length === draft.basics.sessions;
}

function parsePlan(value, draft) {
    const parsed = lessonPlanSchema.safeParse(value);
    return parsed.success && validAgainstDraft(parsed.data, draft) ? { success: true, data: parsed.data } : { success: false, issues: parsed.success ? [{ message: '성취기준 또는 차시 수가 요청과 다릅니다.' }] : parsed.error.issues };
}

export async function POST(request) {
    const parsed = draftSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ code: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
    const draft = parsed.data;
    try {
        const first = await chatJson({ messages: lessonPlanMessages(draft), schema: z.unknown(), timeoutMs: 60000 });
        let checked = parsePlan(first, draft);
        if (!checked.success) {
            const repaired = await chatJson({ messages: repairLessonPlanMessages(draft, first, checked.issues), schema: z.unknown(), timeoutMs: 60000 });
            checked = parsePlan(repaired, draft);
        }
        if (!checked.success) return Response.json({ code: 'invalid_generation', message: '생성 결과를 지도안 형식으로 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return Response.json({ plan: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
