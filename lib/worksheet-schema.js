import { z } from 'zod';
import { worksheetFormats } from './worksheet-formats.js';

const text = z.string().trim().min(1).max(4000);
const shortText = z.string().trim().min(1).max(300);
const formatIds = worksheetFormats.map(item => item.id);

export const WORKSHEET_LIMITS = Object.freeze({ sections: 12, questionsPerSection: 20, answers: 100 });
const MAX_WORKSHEET_RENDER_CHARACTERS = 120_000;

export const worksheetQuestionTypes = Object.freeze([
    { id: 'blank', label: '빈칸' },
    { id: 'short-answer', label: '단답형' },
    { id: 'descriptive', label: '서술형' },
    { id: 'essay', label: '논술형' },
    { id: 'true-false', label: '참·거짓' },
    { id: 'multiple-choice-5', label: '5지 선다형' },
    { id: 'table-chart', label: '표·그래프 작성' },
    { id: 'drawing-diagram', label: '그림·도표 작성' },
    { id: 'experiment-record', label: '실험 기록' },
    { id: 'self-assessment', label: '자기평가' },
]);

const questionTypeIds = worksheetQuestionTypes.map(item => item.id);
const standardSchema = z.object({ code: shortText, text, subject: shortText.optional() });
const commonQuestion = z.object({ id: shortText, prompt: text, standardCodes: z.array(shortText).min(1).max(10) });
const lineQuestion = type => commonQuestion.extend({ type: z.literal(type), responseLines: z.number().int().min(1).max(16) });
export const worksheetQuestionSchema = z.discriminatedUnion('type', [
    lineQuestion('blank'),
    lineQuestion('short-answer'),
    lineQuestion('descriptive'),
    lineQuestion('essay'),
    lineQuestion('true-false'),
    commonQuestion.extend({
        type: z.literal('multiple-choice-5'),
        choices: z.array(shortText).length(5, '5지 선다형은 선택지가 정확히 다섯 개여야 합니다.'),
        responseLines: z.number().int().min(1).max(4),
    }),
    commonQuestion.extend({ type: z.literal('table-chart'), responseAreaHeight: z.number().int().min(80).max(400) }),
    commonQuestion.extend({ type: z.literal('drawing-diagram'), responseAreaHeight: z.number().int().min(80).max(400) }),
    lineQuestion('experiment-record'),
    lineQuestion('self-assessment'),
]);

export const worksheetDocumentSchema = z.object({
    title: shortText,
    instructions: text,
    studentFields: z.array(shortText).min(1).max(8),
    sections: z.array(z.object({
        id: shortText,
        title: shortText,
        purpose: text,
        questions: z.array(worksheetQuestionSchema).min(1).max(WORKSHEET_LIMITS.questionsPerSection),
    })).min(1).max(WORKSHEET_LIMITS.sections),
});

export const worksheetTeacherKeySchema = z.object({
    answers: z.array(z.object({ questionId: shortText, answer: text })).min(1).max(WORKSHEET_LIMITS.answers),
});

export const worksheetGenerationRequestSchema = z.object({
    additionalRequirements: z.string().trim().max(4000),
    questionTypes: z.array(z.enum(questionTypeIds)).min(1).max(questionTypeIds.length),
});

export const worksheetOutputSchema = z.object({
    formatId: z.enum(formatIds),
    formatName: shortText,
    selectionReason: text,
    standards: z.array(standardSchema).min(1).max(10),
    generationRequest: worksheetGenerationRequestSchema,
    document: worksheetDocumentSchema,
    teacherKey: worksheetTeacherKeySchema,
}).superRefine((worksheet, context) => {
    const questions = worksheet.document.sections.flatMap(section => section.questions);
    const questionIds = questions.map(question => question.id);
    const answerIds = worksheet.teacherKey.answers.map(answer => answer.questionId);
    const standardCodes = new Set(worksheet.standards.map(standard => standard.code));
    const usedStandardCodes = new Set(questions.flatMap(question => question.standardCodes));
    const renderedCharacters = [
        worksheet.document.title, worksheet.document.title,
        worksheet.document.instructions, ...worksheet.document.studentFields,
        ...worksheet.document.sections.flatMap(section => [section.title, section.purpose, ...section.questions.flatMap(question => [question.prompt, ...question.standardCodes, ...(question.choices ?? [])])]),
        ...worksheet.teacherKey.answers.map(answer => answer.answer),
    ].reduce((sum, value) => sum + value.length, 0);
    if (renderedCharacters > MAX_WORKSHEET_RENDER_CHARACTERS) {
        context.addIssue({ code: 'custom', path: ['document'], message: `학습지 전체 글자 수는 ${MAX_WORKSHEET_RENDER_CHARACTERS.toLocaleString('ko-KR')}자 이하여야 합니다.` });
    }
    if (new Set(worksheet.standards.map(standard => standard.code)).size !== worksheet.standards.length) {
        context.addIssue({ code: 'custom', path: ['standards'], message: '성취기준 코드는 서로 달라야 합니다.' });
    }
    if (new Set(questionIds).size !== questionIds.length) {
        context.addIssue({ code: 'custom', path: ['document', 'sections'], message: '문항 id는 서로 달라야 합니다.' });
    }
    questions.forEach((question, index) => {
        if (question.standardCodes.some(code => !standardCodes.has(code))) {
            context.addIssue({ code: 'custom', path: ['document', 'questions', index, 'standardCodes'], message: '선택한 성취기준만 문항에 연결할 수 있습니다.' });
        }
    });
    worksheet.standards.forEach(standard => {
        if (!usedStandardCodes.has(standard.code)) {
            context.addIssue({ code: 'custom', path: ['standards'], message: `${standard.code} 성취기준을 확인하는 문항이 필요합니다.` });
        }
    });
    if (new Set(answerIds).size !== answerIds.length || questionIds.length !== answerIds.length || questionIds.some(id => !answerIds.includes(id))) {
        context.addIssue({ code: 'custom', path: ['teacherKey', 'answers'], message: '모든 문항은 정확히 하나의 예시 답안을 가져야 합니다.' });
    }
});
