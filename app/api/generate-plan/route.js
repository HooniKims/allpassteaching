import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { lessonPlanMessages, repairLessonPlanMessages } from '@/lib/upstage/prompts';
import { validateInstructionModelAlignment } from '@/lib/instruction-model-alignment';

const lessonPhases = ['도입', '전개', '정리'];
const generationRequiredFieldsSchema = z.object({
    metadata: z.object({ date: z.string(), period: z.string().default(''), place: z.string(), className: z.string(), teacherName: z.string() }),
    sessions: z.array(z.object({ stages: z.array(z.object({ materialsAndNotes: z.array(z.string()) }).passthrough()) }).passthrough()),
}).passthrough();
const draftSchema = z.object({
    basics: z.object({ schoolLevel: z.enum(['elementary','middle','high']), grade: z.string(), subject: z.string(), subjectMode: z.enum(['official','custom']).default('official'), displaySubject: z.string().default(''), mappedSubjects: z.array(z.string()).max(3).default([]), mode: z.enum(['single','multi']), sessions: z.number().int().min(1).max(10), sessionMinutes: z.number().int().positive().default(40), intent: z.string().min(2), studentNeeds: z.string().default(''), metadata: z.object({ date: z.string().default(''), period: z.string().default(''), place: z.string().default(''), className: z.string().default(''), teacherName: z.string().default('') }).default({ date: '', period: '', place: '', className: '', teacherName: '' }) }),
    standards: z.array(z.object({ code: z.string(), text: z.string() })).min(1),
    instructionModel: z.object({ id: z.string(), name: z.string(), stages: z.array(z.string()) }).passthrough(),
});

function validAgainstDraft(plan, draft) {
    const selectedStandards = new Map(draft.standards.map(item => [item.code, item.text]));
    const generatedStandards = new Map(plan.standards.map(item => [item.code, item.text]));
    const standardsMatch = plan.standards.length === draft.standards.length && generatedStandards.size === selectedStandards.size && draft.standards.every(item => generatedStandards.get(item.code) === item.text);
    const metadataMatches = Object.entries(draft.basics.metadata).every(([key, value]) => plan.metadata[key] === value);
    const basicsMatch = plan.schoolLevel === draft.basics.schoolLevel && plan.grade === draft.basics.grade && plan.subject === draft.basics.subject;
    const instructionModelMatches = plan.instructionModel.id === draft.instructionModel.id && plan.instructionModel.name === draft.instructionModel.name;
    const sessionIds = new Set(plan.sessions.map(session => session.id));
    const sessionsMatch = plan.sessions.length === draft.basics.sessions && sessionIds.size === plan.sessions.length && plan.sessions.every((session, sessionIndex) => session.order === sessionIndex + 1 && session.sessionMinutes === draft.basics.sessionMinutes && session.stages.length === lessonPhases.length && session.stages.every((stage, stageIndex) => stage.phase === lessonPhases[stageIndex]));
    return metadataMatches && basicsMatch && instructionModelMatches && standardsMatch && sessionsMatch;
}

function parsePlan(value, draft) {
    const requiredFields = generationRequiredFieldsSchema.safeParse(value);
    if (!requiredFields.success) return { success: false, issues: requiredFields.error.issues };
    const parsed = lessonPlanSchema.safeParse(value);
    if (!parsed.success) return { success: false, issues: parsed.error.issues };
    if (!validAgainstDraft(parsed.data, draft)) return { success: false, issues: [{ message: '기본 정보, 수업 모형, 행정 정보, 성취기준 또는 차시 구성이 요청과 다릅니다.' }] };
    const alignment = validateInstructionModelAlignment(parsed.data, draft.instructionModel);
    if (!alignment.success) return { success: false, issues: [{ path: ['instructionModel'], message: `수업 모형 단계가 활동에 순서대로 드러나지 않습니다: ${alignment.missingStages.join(', ')}`, missingStages: alignment.missingStages }] };
    return { success: true, data: parsed.data };
}

function parseGeneratedContent(content, draft) {
    try {
        const value = JSON.parse(content);
        return { ...parsePlan(value, draft), value };
    } catch (error) {
        return { success: false, value: content, issues: [{ path: [], message: `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}` }] };
    }
}

export async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 });
    }
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
    const draft = parsed.data;
    try {
        const first = await chatContent({ messages: lessonPlanMessages(draft), timeoutMs: 60000 });
        let checked = parseGeneratedContent(first, draft);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairLessonPlanMessages(draft, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseGeneratedContent(repaired, draft);
        }
        if (!checked.success) return Response.json({ code: 'invalid_generation', message: '생성 결과를 지도안 형식으로 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return Response.json({ plan: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
