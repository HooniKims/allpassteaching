import { z } from 'zod';

export const recordOutputSchema = z.object({
    text: z.string().trim().min(80).max(1000),
}).superRefine((record, context) => {
    if (/\d+\s*점/.test(record.text)) context.addIssue({ code: 'custom', path: ['text'], message: '점수나 총점을 나열하지 마세요.' });
});
