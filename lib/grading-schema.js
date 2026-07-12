import { z } from 'zod';

const text = z.string().trim().min(1).max(5000);
const shortText = z.string().trim().min(1).max(300);
export const MAX_OCR_TEXT_LENGTH = 100000;

export const gradingOutputSchema = z.object({
    criteria: z.array(z.object({ criterionId: shortText, score: z.number().int().min(0).max(1000), evidence: text, feedback: text })).min(1).max(15),
    summary: text,
    nextSteps: text,
});

export const storedGradingSchema = gradingOutputSchema.extend({ totalScore: z.number().int().min(0).max(1000) });
