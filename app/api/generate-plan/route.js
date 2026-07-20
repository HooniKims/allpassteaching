import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { lessonPlanMessages, repairLessonPlanMessages } from '@/lib/upstage/prompts';
import { labelInstructionModelActivities, validateInstructionModelAlignment, validateIntegrationAlignment } from '@/lib/instruction-model-alignment';

const lessonPhases = ['도입', '전개', '정리'];
const generationRequiredFieldsSchema = z.object({
    metadata: z.object({ date: z.string(), period: z.string().default(''), place: z.string(), className: z.string(), teacherName: z.string() }),
    sessions: z.array(z.object({ stages: z.array(z.object({
        teacherActivities: z.array(z.string().min(1)).min(2),
        studentActivities: z.array(z.string().min(1)).min(2),
        materialsAndNotes: z.array(z.string()),
    }).passthrough()) }).passthrough()),
    detailedPlan: z.object({
        teacherIntent: z.string().trim().min(30),
        unitOverview: z.string().trim().min(40),
        unitGoals: z.array(z.string().trim().min(2)).min(2),
        learnerAnalysis: z.string().trim().min(30),
        teachingStrategy: z.string().trim().min(30),
        unitSequence: z.array(z.object({ session: z.string(), topic: z.string(), learningGoal: z.string(), focus: z.string() })).min(3),
        boardPlan: z.array(z.string().trim().min(2)).min(2),
        references: z.array(z.string()),
    }),
}).passthrough();
const selectedStandardSchema = z.object({ code: z.string(), text: z.string(), subject: z.string().default('') });
const draftSchema = z.object({
    basics: z.object({ schoolLevel: z.enum(['elementary','middle','high']), grade: z.string(), subject: z.string(), subjectMode: z.enum(['official','custom']).default('official'), displaySubject: z.string().default(''), mappedSubjects: z.array(z.string()).max(3).default([]), lessonType: z.enum(['single','integrated']).default('single'), integrationSubject: z.string().default(''), mode: z.enum(['single','multi']), sessions: z.number().int().min(1).max(10), sessionMinutes: z.number().int().positive().default(40), intent: z.string().min(2), studentNeeds: z.string().default(''), metadata: z.object({ date: z.string().default(''), period: z.string().default(''), place: z.string().default(''), className: z.string().default(''), teacherName: z.string().default('') }).default({ date: '', period: '', place: '', className: '', teacherName: '' }) }),
    standards: z.array(selectedStandardSchema).min(1).max(10),
    instructionModel: z.object({ id: z.string(), name: z.string(), stages: z.array(z.string()) }).passthrough(),
    integration: z.object({
        primarySubject: z.string().min(1),
        secondarySubject: z.string().min(1),
        primaryStandards: z.array(selectedStandardSchema).min(1),
        secondaryStandards: z.array(selectedStandardSchema).min(1),
    }).optional(),
}).superRefine((value, context) => {
    if (value.instructionModel.id !== 'integrated') return;
    if (!value.integration) {
        context.addIssue({ code: 'custom', path: ['integration'], message: '융합수업은 두 교과와 각 교과 성취기준이 필요합니다.' });
        return;
    }
    const { primarySubject, secondarySubject, primaryStandards, secondaryStandards } = value.integration;
    if (primarySubject === secondarySubject) {
        context.addIssue({ code: 'custom', path: ['integration', 'secondarySubject'], message: '서로 다른 두 교과를 선택해주세요.' });
    }

    const standardSignature = (item, fallbackSubject = '') => `${item.subject || fallbackSubject}:${item.code}:${item.text}`;
    const primarySignatures = primaryStandards.map(item => standardSignature(item, primarySubject));
    const secondarySignatures = secondaryStandards.map(item => standardSignature(item, secondarySubject));
    const combinedSignatures = [...primarySignatures, ...secondarySignatures].sort();
    const requestedSignatures = value.standards.map(item => standardSignature(item)).sort();
    const allPrimaryStandardsMatch = primaryStandards.every(item => !item.subject || item.subject === primarySubject);
    const allSecondaryStandardsMatch = secondaryStandards.every(item => !item.subject || item.subject === secondarySubject);
    if (!allPrimaryStandardsMatch || !allSecondaryStandardsMatch) {
        context.addIssue({ code: 'custom', path: ['integration'], message: '각 성취기준은 선택한 교과에 맞아야 합니다.' });
    }
    if (combinedSignatures.length !== requestedSignatures.length || combinedSignatures.some((signature, index) => signature !== requestedSignatures[index])) {
        context.addIssue({ code: 'custom', path: ['standards'], message: '융합 교과별 성취기준과 전체 성취기준 목록이 일치해야 합니다.' });
    }
});

const standardKey = item => `${item.subject ?? ''}:${item.code}`;

function validAgainstDraft(plan, draft) {
    const selectedStandards = new Map(draft.standards.map(item => [standardKey(item), item.text]));
    const generatedStandards = new Map(plan.standards.map(item => [standardKey(item), item.text]));
    const standardsMatch = plan.standards.length === draft.standards.length && generatedStandards.size === selectedStandards.size && draft.standards.every(item => generatedStandards.get(standardKey(item)) === item.text);
    const metadataMatches = Object.entries(draft.basics.metadata).every(([key, value]) => plan.metadata[key] === value);
    const basicsMatch = plan.schoolLevel === draft.basics.schoolLevel && plan.grade === draft.basics.grade && plan.subject === draft.basics.subject;
    const instructionModelMatches = plan.instructionModel.id === draft.instructionModel.id && plan.instructionModel.name === draft.instructionModel.name;
    const sessionIds = new Set(plan.sessions.map(session => session.id));
    const sessionsMatch = plan.sessions.length === draft.basics.sessions && sessionIds.size === plan.sessions.length && plan.sessions.every((session, sessionIndex) => session.order === sessionIndex + 1 && session.sessionMinutes === draft.basics.sessionMinutes && session.stages.length === lessonPhases.length && session.stages.every((stage, stageIndex) => stage.phase === lessonPhases[stageIndex]));
    return metadataMatches && basicsMatch && instructionModelMatches && standardsMatch && sessionsMatch;
}

function parsePlan(value, draft) {
    const teacherOwnedValue = { ...value, metadata: draft.basics.metadata };
    const requiredFields = generationRequiredFieldsSchema.safeParse(teacherOwnedValue);
    if (!requiredFields.success) return { success: false, issues: requiredFields.error.issues };
    const parsed = lessonPlanSchema.safeParse(teacherOwnedValue);
    if (!parsed.success) return { success: false, issues: parsed.error.issues };
    const labeledPlan = labelInstructionModelActivities(parsed.data, draft.instructionModel);
    if (!validAgainstDraft(labeledPlan, draft)) return { success: false, issues: [{ message: '기본 정보, 수업 설계, 행정 정보, 성취기준 또는 차시 구성이 요청과 다릅니다.' }] };
    const issues = [];
    const alignment = validateInstructionModelAlignment(labeledPlan, draft.instructionModel);
    if (!alignment.success) issues.push({ path: ['instructionModel'], message: `선택한 수업 모형 또는 설계 틀의 핵심 요소가 활동과 점검 항목에 드러나지 않습니다: ${alignment.missingStages.join(', ')}`, missingStages: alignment.missingStages });
    if (draft.instructionModel.id === 'integrated') {
        const integrationAlignment = validateIntegrationAlignment(labeledPlan, draft.integration);
        if (!integrationAlignment.success) issues.push({ path: ['integration'], message: `두 교과의 관점, 연결 과정, 공동 산출물이 실제 활동에 충분히 드러나지 않습니다: ${integrationAlignment.missingEvidence.join(', ')}`, missingEvidence: integrationAlignment.missingEvidence });
    }
    if (issues.length) return { success: false, issues };
    return { success: true, data: labeledPlan };
}

function parseGeneratedContent(content, draft) {
    try {
        const value = JSON.parse(content);
        return { ...parsePlan(value, draft), value };
    } catch (error) {
        return { success: false, value: content, issues: [{ path: [], message: `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}` }] };
    }
}

export async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 });
    }
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
    const primarySubject = parsed.data.basics.displaySubject || parsed.data.basics.subject;
    const draft = {
        ...parsed.data,
        standards: parsed.data.standards.map(item => ({ ...item, subject: item.subject || primarySubject })),
    };
    try {
        const first = await chatContent({ messages: lessonPlanMessages(draft), timeoutMs: 60000 });
        let checked = parseGeneratedContent(first, draft);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairLessonPlanMessages(draft, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseGeneratedContent(repaired, draft);
        }
        if (!checked.success) return Response.json({ code: 'invalid_generation', message: '생성 결과를 지도안 형식으로 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return Response.json({ plan: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
