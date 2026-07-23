import { z } from 'zod';

const text = z.string().trim().min(1).max(5000);
const shortText = z.string().trim().min(1).max(300);
const confidence = z.number().min(0).max(1);
const coordinate = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export const MAX_OCR_TEXT_LENGTH = 100000;

export const gradingSourceRefSchema = z.object({
    elementId: shortText,
    elementHash: shortText,
    page: z.number().int().min(1).max(10000),
    text: z.string().trim().max(5000),
    category: z.string().trim().min(1).max(50),
    coordinates: z.array(coordinate).max(16),
    confidence: confidence.nullable(),
    teacherReviewRequired: z.boolean(),
}).strict();

export const aiGradingSourceRefSchema = gradingSourceRefSchema.pick({ elementId: true, page: true }).strict();

export const revisionEvidenceSchema = z.object({
    checkpointId: shortText,
    beforeEvidence: text,
    beforeSourceRef: gradingSourceRefSchema,
    afterEvidence: text,
    afterSourceRef: gradingSourceRefSchema,
    changeReason: text,
    teacherConfirmed: z.boolean(),
}).strict()
    .refine(value => value.beforeSourceRef.elementId !== value.afterSourceRef.elementId, { message: '수정 전과 수정 후 원본 근거는 서로 달라야 합니다.' })
    .refine(value => value.beforeEvidence.normalize('NFKC').replace(/\s+/g, '') !== value.afterEvidence.normalize('NFKC').replace(/\s+/g, ''), { message: '수정 전과 수정 후 내용은 서로 달라야 합니다.' });

function criterionUnion(sourceRefSchema, canonical = false) {
    const common = {
        criterionId: shortText,
        evidence: text,
        confidence: canonical ? confidence : confidence.optional().default(0.5),
        sourceRefs: z.array(sourceRefSchema).max(10),
        teacherConfirmed: z.boolean(),
        reviewRequired: canonical ? z.boolean() : z.boolean().optional(),
        ...(canonical ? { revisionEvidence: revisionEvidenceSchema.optional() } : {}),
    };
    return z.discriminatedUnion('status', [
        z.object({
            ...common,
            status: z.literal('scored'),
            decisionSource: canonical ? z.enum(['ai', 'teacher']) : z.enum(['ai', 'teacher']).optional(),
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
    criteria: z.array(criterionUnion(gradingSourceRefSchema, true)).min(1).max(15),
    summary: text,
    nextSteps: text,
});

export const storedGradingSchema = gradingOutputSchema.extend({
    provisionalTotal: z.number().int().min(0).max(1000),
    totalScore: z.number().int().min(0).max(1000).nullable(),
    sourceHash: shortText,
    reviewOrigins: z.array(z.object({
        criterionId: shortText, reviewRequired: z.boolean(), status: z.enum(['scored', 'teacher_review']),
        selectedLevelId: shortText.nullable(), score: z.number().int().min(0).max(1000).nullable(), evidence: text,
        confidence, sourceRefs: z.array(gradingSourceRefSchema).max(10),
    }).strict()).min(1).max(15),
    originRevision: z.number().int().min(0).default(0),
    originToken: z.string().regex(/^[a-f0-9]{64}$/),
    approvalToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
