import { z } from 'zod';

export const LESSON_PLAN_LIMITS = Object.freeze({
    shortText: 300,
    proseText: 5000,
    standards: 10,
    learningGoals: 20,
    materials: 50,
    sessions: 10,
    stages: 10,
    stageItems: 30,
    assessment: 20,
    supportStrategies: 20,
    unitSequence: 20,
    detailedItems: 30,
});

const shortString = z.string().min(1).max(LESSON_PLAN_LIMITS.shortText);
const meaningfulShortString = z.string().trim().min(1).max(LESSON_PLAN_LIMITS.shortText);
const proseString = z.string().min(1).max(LESSON_PLAN_LIMITS.proseText);
const meaningfulProseString = z.string().trim().min(1).max(LESSON_PLAN_LIMITS.proseText);
const optionalProseString = z.string().max(LESSON_PLAN_LIMITS.proseText);
const metadataString = z.string().max(LESSON_PLAN_LIMITS.shortText).default('');
const stageItems = item => z.array(item).max(LESSON_PLAN_LIMITS.stageItems);

const metadataSchema = z.object({
    date: metadataString,
    period: metadataString,
    place: metadataString,
    className: metadataString,
    teacherName: metadataString,
});

const levelFeedbackSchema = z.object({
    needsSupport: meaningfulProseString,
    meets: meaningfulProseString,
    exceeds: meaningfulProseString,
});

const detailedPlanSchema = z.object({
    teacherIntent: meaningfulProseString,
    unitOverview: meaningfulProseString,
    unitGoals: z.array(proseString).min(1).max(LESSON_PLAN_LIMITS.detailedItems),
    learnerAnalysis: meaningfulProseString,
    teachingStrategy: meaningfulProseString,
    unitSequence: z.array(z.object({
        session: meaningfulShortString,
        topic: meaningfulShortString,
        learningGoal: meaningfulProseString,
        focus: meaningfulProseString,
    })).min(1).max(LESSON_PLAN_LIMITS.unitSequence),
    boardPlan: z.array(proseString).min(1).max(LESSON_PLAN_LIMITS.detailedItems),
    references: z.array(optionalProseString).max(LESSON_PLAN_LIMITS.detailedItems),
});

export const lessonStageSchema = z.object({
    phase: z.enum(['도입', '전개', '정리']),
    learningElement: meaningfulProseString,
    teacherActivities: stageItems(proseString).min(1),
    studentActivities: stageItems(proseString).min(1),
    teacherQuestions: stageItems(meaningfulProseString).min(1),
    expectedStudentResponses: stageItems(meaningfulProseString).min(1),
    supportNotes: stageItems(optionalProseString),
    minutes: z.number().int().positive(),
    materialsAndNotes: stageItems(optionalProseString).default([]),
    remarks: stageItems(optionalProseString).default([]),
});

const sessionSchema = z.object({
    id: shortString,
    order: z.number().int().positive(),
    title: shortString,
    sessionMinutes: z.number().int().positive(),
    nextSessionConnection: meaningfulProseString,
    stages: z.array(lessonStageSchema).min(3).max(LESSON_PLAN_LIMITS.stages),
}).superRefine((session, context) => {
    const total = session.stages.reduce((sum, stage) => sum + stage.minutes, 0);
    if (total !== session.sessionMinutes) context.addIssue({ code: 'custom', path: ['stages'], message: `단계 시간 합계 ${total}분이 차시 시간 ${session.sessionMinutes}분과 다릅니다.` });
});

export const lessonPlanSchema = z.object({
    metadata: metadataSchema,
    title: shortString,
    schoolLevel: z.enum(['elementary', 'middle', 'high']),
    grade: shortString,
    subject: shortString,
    unitTitle: meaningfulShortString,
    essentialQuestion: meaningfulProseString,
    standards: z.array(z.object({ code: shortString, text: proseString, subject: metadataString.optional() })).min(1).max(LESSON_PLAN_LIMITS.standards),
    learningGoals: z.array(proseString).min(1).max(LESSON_PLAN_LIMITS.learningGoals),
    materials: z.array(optionalProseString).max(LESSON_PLAN_LIMITS.materials),
    instructionModel: z.object({
        id: shortString,
        name: shortString,
        reason: proseString,
    }),
    sessions: z.array(sessionSchema).min(1).max(LESSON_PLAN_LIMITS.sessions),
    assessment: z.array(z.object({
        element: proseString,
        method: meaningfulProseString,
        evidence: proseString,
        feedback: proseString,
        levelFeedback: levelFeedbackSchema,
    })).min(1).max(LESSON_PLAN_LIMITS.assessment),
    supportStrategies: z.array(proseString).min(1).max(LESSON_PLAN_LIMITS.supportStrategies),
    reflectionPrompt: proseString,
    detailedPlan: detailedPlanSchema.optional(),
});
