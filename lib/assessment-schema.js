import { z } from 'zod';

const text = z.string().trim().min(1).max(5000);
const shortText = z.string().trim().min(1).max(300);
const levelsSchema = z.object({ excellent: text, proficient: text, developing: text, beginning: text });

export const assessmentOutputSchema = z.object({
    task: z.object({
        title: shortText,
        standards: z.array(z.object({ code: shortText, text })).min(1).max(10),
        situation: text,
        role: text,
        audience: text,
        product: text,
        procedure: z.array(text).min(1).max(20),
        conditions: z.array(text).min(1).max(20),
        materials: z.array(text).max(30),
        cautions: z.array(text).max(20),
    }),
    rubric: z.object({
        levels: z.tuple([
            z.object({ id: z.literal('excellent'), label: shortText }),
            z.object({ id: z.literal('proficient'), label: shortText }),
            z.object({ id: z.literal('developing'), label: shortText }),
            z.object({ id: z.literal('beginning'), label: shortText }),
        ]),
        criteria: z.array(z.object({
            id: shortText,
            name: shortText,
            description: text,
            maxPoints: z.number().int().min(1).max(100),
            evidence: text,
            levels: levelsSchema,
        })).min(2).max(10),
    }),
    totalPoints: z.literal(100),
}).superRefine((assessment, context) => {
    const total = assessment.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
    if (total !== assessment.totalPoints) context.addIssue({ code: 'custom', path: ['rubric', 'criteria'], message: `평가 요소 배점 합계는 100점이어야 합니다. 현재 ${total}점입니다.` });
    const ids = assessment.rubric.criteria.map(criterion => criterion.id);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['rubric', 'criteria'], message: '평가 요소 id는 서로 달라야 합니다.' });
});

export const approvedAssessmentSchema = z.intersection(assessmentOutputSchema, z.object({
    sourceHash: z.string().min(1).max(100),
    approved: z.literal(true),
}));
