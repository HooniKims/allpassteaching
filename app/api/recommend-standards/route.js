import { z } from 'zod';
import catalog from '@/data/curriculum.json';
import { searchStandards } from '@/lib/curriculum/search';
import { chatJson, UpstageError } from '@/lib/upstage/client';
import { standardsRecommendationMessages } from '@/lib/upstage/prompts';

const requestSchema = z.object({ schoolLevel: z.enum(['elementary', 'middle', 'high']), gradeBand: z.string().min(1), subject: z.string().min(1), query: z.string().min(2) });
const responseSchema = z.object({ recommendations: z.array(z.object({ code: z.string(), score: z.number().min(0).max(100), reason: z.string().min(1), keyPhrase: z.string().min(1) })).min(1).max(5) });

export async function POST(request) {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ code: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
    const directCandidates = searchStandards(catalog, parsed.data, 30);
    try {
        const ranked = await chatJson({ messages: standardsRecommendationMessages({ query: parsed.data.query, candidates: directCandidates }), schema: responseSchema });
        const byCode = new Map(directCandidates.map(item => [item.code, item]));
        const recommendations = ranked.recommendations.flatMap(item => byCode.has(item.code) ? [{ ...byCode.get(item.code), score: item.score, reason: item.reason, keyPhrase: item.keyPhrase }] : []);
        return Response.json({ recommendations, directCandidates });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message, directCandidates }, { status: error.status });
        throw error;
    }
}
