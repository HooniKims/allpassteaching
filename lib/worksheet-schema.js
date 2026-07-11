import { z } from 'zod';
import { worksheetFormats } from './worksheet-formats.js';

const text = z.string().trim().min(1).max(4000);
const shortText = z.string().trim().min(1).max(300);
const formatIds = worksheetFormats.map(item => item.id);

export const worksheetOutputSchema = z.object({
    formatId: z.enum(formatIds),
    formatName: shortText,
    selectionReason: text,
    document: z.object({
        title: shortText,
        instructions: text,
        studentFields: z.array(shortText).min(1).max(8),
        sections: z.array(z.object({
            id: shortText,
            title: shortText,
            purpose: text,
            questions: z.array(z.object({ id: shortText, prompt: text, responseLines: z.number().int().min(1).max(16) })).min(1).max(20),
        })).min(1).max(12),
    }),
    teacherKey: z.object({ answers: z.array(z.object({ questionId: shortText, answer: text })).min(1).max(100) }),
}).superRefine((worksheet, context) => {
    const questions = worksheet.document.sections.flatMap(section => section.questions);
    const questionIds = questions.map(question => question.id);
    const answerIds = worksheet.teacherKey.answers.map(answer => answer.questionId);
    if (new Set(questionIds).size !== questionIds.length) context.addIssue({ code: 'custom', path: ['document', 'sections'], message: '문항 id는 서로 달라야 합니다.' });
    if (new Set(answerIds).size !== answerIds.length || questionIds.length !== answerIds.length || questionIds.some(id => !answerIds.includes(id))) {
        context.addIssue({ code: 'custom', path: ['teacherKey', 'answers'], message: '모든 문항은 정확히 하나의 예시 답안을 가져야 합니다.' });
    }
});
