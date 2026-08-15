import { z } from 'zod';
import { chatJson, UpstageError } from '@/lib/upstage/client';
import { teachingToolRecommendationMessages } from '@/lib/upstage/prompts';
import { searchTeachingTool, TOOL_SEARCH_LIMITS } from '@/lib/tool-search';

const requestSchema = z.object({
    lessonIntent: z.string().trim().min(2).max(2000),
    schoolLevel: z.enum(['elementary', 'middle', 'high']),
    grade: z.string().default(''),
    subject: z.string().default(''),
});
const responseSchema = z.object({
    tools: z.array(z.object({
        name: z.string().trim().min(1).max(TOOL_SEARCH_LIMITS.query),
        reason: z.string().trim().min(1),
    })).min(1).max(3),
});

export async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
    try {
        const recommended = await chatJson({ messages: teachingToolRecommendationMessages(parsed.data), schema: responseSchema });
        // 모델이 이름을 지어냈을 수 있으므로 추천마다 검색으로 실재 여부를 확인해 교사에게 함께 보여줍니다.
        const tools = await Promise.all(recommended.tools.map(async tool => ({
            ...tool,
            search: await searchTeachingTool(`${tool.name} 수업 활용`),
        })));
        return Response.json({ tools });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
