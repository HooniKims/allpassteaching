import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { assessmentOutputSchema } from '@/lib/assessment-schema';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { assessmentMessages, repairAssessmentMessages } from '@/lib/workflow-prompts';

const requestSchema = z.object({ lessonPlan: lessonPlanSchema });

function parseAssessment(content, lessonPlan) {
    try {
        const value = JSON.parse(content);
        const parsed = assessmentOutputSchema.safeParse(value);
        if (!parsed.success) return { success: false, value, issues: parsed.error.issues };
        const actual = parsed.data.task.standards;
        const standardsMatch = actual.length === lessonPlan.standards.length && lessonPlan.standards.every(item => actual.some(candidate => candidate.code === item.code && candidate.text === item.text));
        if (!standardsMatch) return { success: false, value, issues: [{ path: ['task', 'standards'], message: '지도안 성취기준 코드와 원문을 정확히 보존해야 합니다.' }] };
        return { success: true, data: parsed.data };
    } catch (error) {
        return { success: false, value: content, issues: [{ path: [], message: `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}` }] };
    }
}

export async function POST(request) {
    let body;
    try { body = await request.json(); } catch { return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
    const { lessonPlan } = parsed.data;
    try {
        const first = await chatContent({ messages: assessmentMessages(lessonPlan), timeoutMs: 60000 });
        let checked = parseAssessment(first, lessonPlan);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairAssessmentMessages(lessonPlan, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseAssessment(repaired, lessonPlan);
        }
        if (!checked.success) return Response.json({ code: 'invalid_generation', message: '수행평가 형식을 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return Response.json({ assessment: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
