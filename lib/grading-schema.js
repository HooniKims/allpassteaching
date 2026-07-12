import { z } from 'zod';

const text = z.string().trim().min(1).max(5000);
const shortText = z.string().trim().min(1).max(300);
const confidence = z.number().min(0).max(1);
const coordinate = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export const MAX_OCR_TEXT_LENGTH = 100000;

export const gradingSourceRefSchema = z.object({
    elementId: shortText,
    page: z.number().int().min(1).max(10000),
    text: z.string().trim().max(5000).optional(),
    coordinates: z.array(coordinate).max(16).optional(),
});

export const aiGradingSourceRefSchema = gradingSourceRefSchema.pick({ elementId: true, page: true }).strict();

function criterionUnion(sourceRefSchema) {
    const common = {
        criterionId: shortText,
        evidence: text,
        confidence,
        sourceRefs: z.array(sourceRefSchema).max(10),
        teacherConfirmed: z.boolean(),
    };
    return z.discriminatedUnion('status', [
        z.object({
            ...common,
            status: z.literal('scored'),
            decisionSource: z.enum(['ai', 'teacher']).optional(),
            selectedLevelId: shortText,
            score: z.number().int().min(0).max(1000),
            reason: text,
            feedback: text,
        }),
        z.object({
            ...common,
            status: z.literal('teacher_review'),
            selectedLevelId: z.null(),
            score: z.null(),
            reviewReason: text,
            teacherConfirmed: z.literal(false),
        }),
    ]);
}

export const aiGradingOutputSchema = z.object({
    criteria: z.array(criterionUnion(aiGradingSourceRefSchema)).min(1).max(15),
    summary: text,
    nextSteps: text,
});

export const gradingOutputSchema = z.object({
    criteria: z.array(criterionUnion(gradingSourceRefSchema)).min(1).max(15),
    summary: text,
    nextSteps: text,
});

export const storedGradingSchema = gradingOutputSchema.extend({
    provisionalTotal: z.number().int().min(0).max(1000),
    totalScore: z.number().int().min(0).max(1000).nullable(),
    sourceHash: shortText,
});
