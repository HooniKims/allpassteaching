import { z } from 'zod';

const meaningfulString = z.string().trim().min(1);

const metadataSchema = z.object({
    date: z.string().default(''),
    place: z.string().default(''),
    className: z.string().default(''),
    teacherName: z.string().default(''),
});

const levelFeedbackSchema = z.object({
    needsSupport: meaningfulString,
    meets: meaningfulString,
    exceeds: meaningfulString,
});

export const lessonStageSchema = z.object({
    phase: z.enum(['도입', '전개', '정리']),
    learningElement: meaningfulString,
    teacherActivities: z.array(z.string().min(1)).min(1),
    studentActivities: z.array(z.string().min(1)).min(1),
    teacherQuestions: z.array(meaningfulString).min(1),
    expectedStudentResponses: z.array(meaningfulString).min(1),
    supportNotes: z.array(z.string()),
    minutes: z.number().int().positive(),
    materialsAndNotes: z.array(z.string()).default([]),
});

const sessionSchema = z.object({
    id: z.string().min(1), order: z.number().int().positive(), title: z.string().min(1),
    sessionMinutes: z.number().int().positive(),
    nextSessionConnection: meaningfulString,
    stages: z.array(lessonStageSchema).min(3),
}).superRefine((session, context) => {
    const total = session.stages.reduce((sum, stage) => sum + stage.minutes, 0);
    if (total !== session.sessionMinutes) context.addIssue({ code: 'custom', path: ['stages'], message: `단계 시간 합계 ${total}분이 차시 시간 ${session.sessionMinutes}분과 다릅니다.` });
});

export const lessonPlanSchema = z.object({
    metadata: metadataSchema,
    title: z.string().min(1), schoolLevel: z.enum(['elementary', 'middle', 'high']), grade: z.string().min(1), subject: z.string().min(1),
    unitTitle: meaningfulString,
    essentialQuestion: meaningfulString,
    standards: z.array(z.object({ code: z.string().min(1), text: z.string().min(1) })).min(1),
    learningGoals: z.array(z.string().min(1)).min(1), materials: z.array(z.string()),
    instructionModel: z.object({ id: z.string().min(1), name: z.string().min(1), reason: z.string().min(1) }),
    sessions: z.array(sessionSchema).min(1).max(10),
    assessment: z.array(z.object({
        element: z.string().min(1),
        method: meaningfulString,
        evidence: z.string().min(1),
        feedback: z.string().min(1),
        levelFeedback: levelFeedbackSchema,
    })).min(1),
    supportStrategies: z.array(z.string().min(1)).min(1), reflectionPrompt: z.string().min(1),
});
