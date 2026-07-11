import { z } from 'zod';

export const lessonStageSchema = z.object({
    phase: z.enum(['도입', '전개', '정리']),
    teacherActivities: z.array(z.string().min(1)).min(1),
    studentActivities: z.array(z.string().min(1)).min(1),
    minutes: z.number().int().positive(),
    materialsAndNotes: z.array(z.string()).default([]),
});

const sessionSchema = z.object({
    id: z.string().min(1), order: z.number().int().positive(), title: z.string().min(1),
    sessionMinutes: z.number().int().positive(), stages: z.array(lessonStageSchema).min(3),
}).superRefine((session, context) => {
    const total = session.stages.reduce((sum, stage) => sum + stage.minutes, 0);
    if (total !== session.sessionMinutes) context.addIssue({ code: 'custom', path: ['stages'], message: `단계 시간 합계 ${total}분이 차시 시간 ${session.sessionMinutes}분과 다릅니다.` });
});

export const lessonPlanSchema = z.object({
    title: z.string().min(1), schoolLevel: z.enum(['elementary', 'middle', 'high']), grade: z.string().min(1), subject: z.string().min(1),
    standards: z.array(z.object({ code: z.string().min(1), text: z.string().min(1) })).min(1),
    learningGoals: z.array(z.string().min(1)).min(1), materials: z.array(z.string()),
    instructionModel: z.object({ id: z.string().min(1), name: z.string().min(1), reason: z.string().min(1) }),
    sessions: z.array(sessionSchema).min(1).max(10),
    assessment: z.array(z.object({ element: z.string().min(1), evidence: z.string().min(1), feedback: z.string().min(1) })).min(1),
    supportStrategies: z.array(z.string().min(1)).min(1), reflectionPrompt: z.string().min(1),
});
