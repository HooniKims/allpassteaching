import { z } from 'zod';
import { searchTeachingTool, TOOL_SEARCH_LIMITS } from '@/lib/tool-search';

const requestSchema = z.object({
    query: z.string().trim().min(1).max(TOOL_SEARCH_LIMITS.query),
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
    // 검색 경로가 모두 막혀도 오류 대신 미검증 결과를 돌려주어 지도안 작성은 계속할 수 있게 합니다.
    return Response.json({ tool: await searchTeachingTool(parsed.data.query) });
}
