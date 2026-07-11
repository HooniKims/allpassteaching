import { z } from 'zod';
import catalog from '@/data/curriculum.json';
import { chatJson, UpstageError } from '@/lib/upstage/client';
import { subjectMappingMessages } from '@/lib/upstage/prompts';
import { filterSubjectMappings, officialSubjects } from '@/lib/subject-mapping';

const requestSchema = z.object({
    schoolLevel: z.enum(['elementary', 'middle', 'high']),
    gradeBand: z.string().min(1),
    displaySubject: z.string().trim().min(1).max(100),
    lessonIntent: z.string().trim().min(2),
});
const responseSchema = z.object({
    mappings: z.array(z.object({
        subject: z.string().min(1),
        score: z.number().min(0).max(100),
        reason: z.string().min(1),
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
    const directCandidates = officialSubjects(catalog, parsed.data.schoolLevel);
    try {
        const ranked = await chatJson({
            messages: subjectMappingMessages({
                displaySubject: parsed.data.displaySubject,
                lessonIntent: parsed.data.lessonIntent,
                candidates: directCandidates,
            }),
            schema: responseSchema,
        });
        return Response.json({
            mappings: filterSubjectMappings(catalog, parsed.data.schoolLevel, ranked.mappings),
            directCandidates,
        });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message, directCandidates }, { status: error.status });
        throw error;
    }
}
