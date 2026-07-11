import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { worksheetOutputSchema } from '@/lib/worksheet-schema';
import { worksheetFormats, worksheetFormatById } from '@/lib/worksheet-formats';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { repairWorksheetMessages, worksheetMessages } from '@/lib/workflow-prompts';

const requestSchema = z.object({ lessonPlan: lessonPlanSchema, selectedFormatId: z.enum(worksheetFormats.map(item => item.id)) });

function parseWorksheet(content, selectedFormatId) {
    try {
        const value = JSON.parse(content);
        const parsed = worksheetOutputSchema.safeParse(value);
        if (!parsed.success) return { success: false, value, issues: parsed.error.issues };
        const format = worksheetFormatById(selectedFormatId);
        if (parsed.data.formatId !== selectedFormatId || parsed.data.formatName !== format.name) return { success: false, value, issues: [{ path: ['formatId'], message: '교사가 선택한 학습지 형식과 다릅니다.' }] };
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
    const { lessonPlan, selectedFormatId } = parsed.data;
    try {
        const first = await chatContent({ messages: worksheetMessages(lessonPlan, selectedFormatId), timeoutMs: 60000 });
        let checked = parseWorksheet(first, selectedFormatId);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairWorksheetMessages(lessonPlan, selectedFormatId, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseWorksheet(repaired, selectedFormatId);
        }
        if (!checked.success) return Response.json({ code: 'invalid_generation', message: '학습지 형식을 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return Response.json({ worksheet: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
