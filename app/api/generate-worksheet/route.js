import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { worksheetGenerationRequestSchema, worksheetOutputSchema } from '@/lib/worksheet-schema';
import { worksheetFormats, worksheetFormatById } from '@/lib/worksheet-formats';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { repairWorksheetMessages, worksheetMessages } from '@/lib/workflow-prompts';

const requestSchema = z.object({ lessonPlan: lessonPlanSchema, selectedFormatId: z.enum(worksheetFormats.map(item => item.id)), generationRequest: worksheetGenerationRequestSchema });

function parseWorksheet(content, lessonPlan, selectedFormatId, generationRequest) {
    try {
        const value = JSON.parse(content);
        const parsed = worksheetOutputSchema.safeParse(value);
        if (!parsed.success) return { success: false, value, issues: parsed.error.issues };
        const format = worksheetFormatById(selectedFormatId);
        if (parsed.data.formatId !== selectedFormatId || parsed.data.formatName !== format.name) return { success: false, value, issues: [{ path: ['formatId'], message: '교사가 선택한 학습지 형식과 다릅니다.' }] };
        if (JSON.stringify(parsed.data.standards) !== JSON.stringify(lessonPlan.standards)) return { success: false, value, issues: [{ path: ['standards'], message: '지도안의 성취기준 원문과 다릅니다.' }] };
        if (JSON.stringify(parsed.data.generationRequest) !== JSON.stringify(generationRequest)) return { success: false, value, issues: [{ path: ['generationRequest'], message: '교사가 입력한 생성 요청과 다릅니다.' }] };
        const generatedTypes = new Set(parsed.data.document.sections.flatMap(section => section.questions).map(question => question.type));
        const missingType = generationRequest.questionTypes.find(type => !generatedTypes.has(type));
        if (missingType) return { success: false, value, issues: [{ path: ['document', 'sections'], message: `${missingType} 유형 문항이 생성 결과에 없습니다.` }] };
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
    const { lessonPlan, selectedFormatId, generationRequest } = parsed.data;
    try {
        const first = await chatContent({ messages: worksheetMessages(lessonPlan, selectedFormatId, generationRequest), timeoutMs: 60000 });
        let checked = parseWorksheet(first, lessonPlan, selectedFormatId, generationRequest);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairWorksheetMessages(lessonPlan, selectedFormatId, generationRequest, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseWorksheet(repaired, lessonPlan, selectedFormatId, generationRequest);
        }
        if (!checked.success) return Response.json({ code: 'invalid_generation', message: '학습지 형식을 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return Response.json({ worksheet: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
