import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { chatJson, UpstageError } from '@/lib/upstage/client';
import { lessonPlanMessages, repairLessonPlanMessages } from '@/lib/upstage/prompts';

const lessonPhases = ['도입', '전개', '정리'];
const generationRequiredFieldsSchema = z.object({
    metadata: z.object({ date: z.string(), place: z.string(), className: z.string(), teacherName: z.string() }),
    sessions: z.array(z.object({ stages: z.array(z.object({ materialsAndNotes: z.array(z.string()) }).passthrough()) }).passthrough()),
}).passthrough();
const draftSchema = z.object({
    basics: z.object({ schoolLevel: z.enum(['elementary','middle','high']), grade: z.string(), subject: z.string(), mode: z.enum(['single','multi']), sessions: z.number().int().min(1).max(10), sessionMinutes: z.number().int().positive().default(40), intent: z.string().min(2), studentNeeds: z.string().default(''), metadata: z.object({ date: z.string().default(''), place: z.string().default(''), className: z.string().default(''), teacherName: z.string().default('') }).default({ date: '', place: '', className: '', teacherName: '' }) }),
    standards: z.array(z.object({ code: z.string(), text: z.string() })).min(1),
    instructionModel: z.object({ id: z.string(), name: z.string(), stages: z.array(z.string()) }).passthrough(),
});

function validAgainstDraft(plan, draft) {
    const selectedStandards = new Map(draft.standards.map(item => [item.code, item.text]));
    const generatedStandards = new Map(plan.standards.map(item => [item.code, item.text]));
    const standardsMatch = plan.standards.length === draft.standards.length && generatedStandards.size === selectedStandards.size && draft.standards.every(item => generatedStandards.get(item.code) === item.text);
    const metadataMatches = Object.entries(draft.basics.metadata).every(([key, value]) => plan.metadata[key] === value);
    const sessionsMatch = plan.sessions.length === draft.basics.sessions && plan.sessions.every(session => session.sessionMinutes === draft.basics.sessionMinutes && session.stages.length === lessonPhases.length && session.stages.every((stage, index) => stage.phase === lessonPhases[index]));
    return metadataMatches && standardsMatch && sessionsMatch;
}

function parsePlan(value, draft) {
    const requiredFields = generationRequiredFieldsSchema.safeParse(value);
    if (!requiredFields.success) return { success: false, issues: requiredFields.error.issues };
    const parsed = lessonPlanSchema.safeParse(value);
    return parsed.success && validAgainstDraft(parsed.data, draft) ? { success: true, data: parsed.data } : { success: false, issues: parsed.success ? [{ message: '행정 정보, 성취기준 또는 차시 구성이 요청과 다릅니다.' }] : parsed.error.issues };
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
