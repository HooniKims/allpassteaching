import { z } from 'zod';
import { scoreLadderIsValid } from './rubric-score.js';
import { ASSESSMENT_APPROACH_IDS } from './assessment-approaches.js';
import { worksheetDocumentSchema, worksheetTeacherKeySchema } from './worksheet-schema.js';

const text = z.string().trim().min(1).max(5000);
const optionalText = z.string().trim().max(5000);
const shortText = z.string().trim().min(1).max(300);
const unique = values => new Set(values).size === values.length;
const issue = (context, path, message) => context.addIssue({ code: 'custom', path, message });

export const MAX_ASSESSMENT_RENDER_CHARACTERS = 60_000;
function stringCharacters(value) {
    let total = 0;
    const pending = [value];
    while (pending.length) {
        const item = pending.pop();
        if (typeof item === 'string') total += item.length;
        else if (Array.isArray(item)) {
            for (const child of item) pending.push(child);
        } else if (item && typeof item === 'object') {
            for (const child of Object.values(item)) pending.push(child);
        }
        if (total > MAX_ASSESSMENT_RENDER_CHARACTERS) return total;
    }
    return total;
}

export const assessmentRenderCharacters = value => {
    if (!value || typeof value !== 'object') return 0;
    const rendered = [value.task, value.studentSheet, value.rubric];
    if (value.includeStudentCover === true && value.cover && typeof value.cover === 'object') {
        const visibleSections = Array.isArray(value.cover.sections) ? value.cover.sections.filter(section => section?.visible === true) : [];
        rendered.push(value.cover.title, value.subject, visibleSections.map(section => ({ label: section.label, content: section.content })));
        const types = new Set(visibleSections.map(section => section.type));
        if (types.has('transfer-goal')) rendered.push(value.backwardDesign?.transferGoal);
        if (types.has('standards')) rendered.push(value.task?.standards);
        if (types.has('grasps') || types.has('task') || types.has('procedure') || types.has('submission')) rendered.push(value.task);
        if (types.has('checkpoints')) rendered.push(value.backwardDesign?.checkpoints);
        if (types.has('rubric')) rendered.push(value.rubric);
    }
    return stringCharacters(rendered);
};
export const assessmentRenderBudgetExceeded = value => assessmentRenderCharacters(value) > MAX_ASSESSMENT_RENDER_CHARACTERS;

const levelSchema = z.object({ id: shortText, label: shortText });
const criterionLevelSchema = z.object({ levelId: shortText, score: z.number().int().min(0).max(1000), description: text });
const criterionSchema = z.object({
    id: shortText, name: shortText, description: text, standardCodes: z.array(shortText).min(1).max(10),
    kind: z.enum(['outcome', 'process']), maxPoints: z.number().int().min(1).max(1000), intervalPoints: z.number().int().min(1).max(1000),
    evidence: text, levels: z.array(criterionLevelSchema).min(2).max(6),
});

export const REQUIRED_COVER_SECTION_TYPES = Object.freeze(['subject', 'transfer-goal', 'standards', 'grasps', 'submission', 'checkpoints', 'rubric', 'self-checklist']);
const coverSectionTypeSchema = z.enum(['identity', 'purpose', 'subject', 'transfer-goal', 'standards', 'grasps', 'task', 'procedure', 'submission', 'checkpoints', 'rubric', 'self-checklist', 'custom']);
const alignmentIssueSchema = z.object({
    id: shortText,
    severity: z.literal('warning'),
    code: z.enum(['lesson-activity-gap', 'worksheet-evidence-gap', 'task-authenticity', 'support-plan-gap']),
    message: text,
    repairAction: text,
    resolved: z.boolean(),
});

const studentSheetSchema = z.object({ document: worksheetDocumentSchema, teacherKey: worksheetTeacherKeySchema });
const coverSchema = z.object({
    title: shortText,
    sections: z.array(z.object({ id: shortText, type: coverSectionTypeSchema, label: shortText, content: optionalText, visible: z.boolean(), order: z.number().int().min(1).max(30) })).min(1).max(20),
});

const assessmentDesignShape = z.object({
    assessmentName: shortText,
    subject: shortText,
    backwardDesign: z.object({
        teacherIntent: z.object({ desiredResult: text, evidenceOfSuccess: optionalText, growthProcess: optionalText }),
        transferGoal: text, enduringUnderstanding: text, essentialQuestions: z.array(text).min(1).max(8), knowledge: z.array(text).min(1).max(20), skills: z.array(text).min(1).max(20),
        evidenceMap: z.array(z.object({ standardCode: shortText, taskEvidenceTypes: z.array(shortText).min(1).max(15), criterionIds: z.array(shortText).min(1).max(15), evidenceTypes: z.array(shortText).min(1).max(15), scoreBasis: text })).min(1).max(20),
        checkpoints: z.array(z.object({ id: shortText, phase: z.enum(['draft', 'feedback', 'revision', 'final']), title: shortText, evidence: text, feedbackPurpose: text, order: z.number().int().min(1).max(20) })).min(2).max(10),
        supportPlan: z.array(z.object({ id: shortText, order: z.number().int().min(1).max(20), title: shortText, purpose: text, teacherAction: text, studentEvidence: text })).min(1).max(20),
        alignmentIssues: z.array(alignmentIssueSchema).max(30),
    }),
    task: z.object({
        title: shortText, standards: z.array(z.object({ code: shortText, text })).min(1).max(10),
        goal: text, role: text, audience: text, situation: text, product: text, successCriteria: text,
        procedure: z.array(text).min(1).max(20), conditions: z.array(text).min(1).max(20), materials: z.array(text).max(30), cautions: z.array(text).max(20),
    }),
    rubric: z.object({ levels: z.array(levelSchema).min(2).max(6), criteria: z.array(criterionSchema).min(2).max(15) }),
    scoring: z.object({ includeProcessInScore: z.boolean(), processWeightPercent: z.number().int().min(0).max(100), processTargetPoints: z.number().int().min(0).max(1000) }),
    totalPoints: z.number().int().min(1).max(1000),
    visualAnalysisRequired: z.boolean(),
    includeStudentCover: z.boolean(),
    generationSettings: z.object({
        outputTypes: z.array(shortText).min(1).max(10),
        answerTypes: z.array(shortText).min(1).max(10),
        stages: z.object({ draft: z.boolean(), checkpoint: z.boolean(), revision: z.boolean(), final: z.boolean() }),
        additionalRequirements: optionalText,
        assessmentApproachId: z.enum(ASSESSMENT_APPROACH_IDS).default('backward-design'),
    }),
});

const assessmentShape = assessmentDesignShape.extend({ studentSheet: studentSheetSchema, cover: coverSchema });

function validateAssessmentDesignRelationships(assessment, context) {
    if (assessmentRenderBudgetExceeded(assessment)) issue(context, [], `수행평가 PDF 전체 글자 수는 ${MAX_ASSESSMENT_RENDER_CHARACTERS.toLocaleString('ko-KR')}자 이하여야 합니다.`);
    const criteria = assessment.rubric.criteria;
    const criterionIds = criteria.map(item => item.id);
    const levelIds = assessment.rubric.levels.map(item => item.id);
    const standardCodes = assessment.task.standards.map(item => item.code);
    const total = criteria.reduce((sum, item) => sum + item.maxPoints, 0);
    if (total !== assessment.totalPoints) issue(context, ['rubric', 'criteria'], `평가 요소 배점 합계가 ${assessment.totalPoints}점이어야 합니다. 현재 ${total}점입니다.`);
    if (!unique(criterionIds)) issue(context, ['rubric', 'criteria'], '평가영역 id는 서로 달라야 합니다.');
    if (!unique(levelIds)) issue(context, ['rubric', 'levels'], '성취수준 id는 서로 달라야 합니다.');
    criteria.forEach((criterion, index) => {
        if (!scoreLadderIsValid(criterion.levels, criterion.maxPoints)) issue(context, ['rubric', 'criteria', index, 'levels'], '수준 점수는 중복 없이 높은 점수부터 낮아져야 합니다.');
        if (!unique(criterion.levels.map(item => item.description))) issue(context, ['rubric', 'criteria', index, 'levels'], '수준별 수행 기술은 서로 구분되는 관찰 가능한 내용이어야 합니다.');
        if (criterion.levels.map(item => item.levelId).join('|') !== levelIds.join('|')) issue(context, ['rubric', 'criteria', index, 'levels'], '모든 평가영역은 같은 성취수준 순서를 사용해야 합니다.');
        if (criterion.standardCodes.some(code => !standardCodes.includes(code))) issue(context, ['rubric', 'criteria', index, 'standardCodes'], '선택하지 않은 성취기준은 연결할 수 없습니다.');
    });
    standardCodes.forEach(code => {
        if (!criteria.some(item => item.standardCodes.includes(code))) issue(context, ['rubric', 'criteria'], `${code} 성취기준에 연결된 평가영역이 없습니다.`);
        if (!assessment.backwardDesign.evidenceMap.some(item => item.standardCode === code)) issue(context, ['backwardDesign', 'evidenceMap'], `${code} 성취기준이 연결표에서 누락되었습니다.`);
    });
    const mappings = assessment.backwardDesign.evidenceMap;
    if (!unique(mappings.map(item => item.standardCode))) issue(context, ['backwardDesign', 'evidenceMap'], '성취기준별 연결표 행은 하나씩만 있어야 합니다.');
    const mappedIds = new Set(mappings.flatMap(item => item.criterionIds));
    criterionIds.forEach(id => { if (!mappedIds.has(id)) issue(context, ['backwardDesign', 'evidenceMap'], `${id} 평가영역이 연결표에서 누락되었습니다.`); });
    mappings.forEach((mapping, index) => {
        if (!standardCodes.includes(mapping.standardCode) || mapping.criterionIds.some(id => !criterionIds.includes(id))) issue(context, ['backwardDesign', 'evidenceMap', index], '연결표에 존재하지 않는 성취기준 또는 평가영역이 있습니다.');
        if (!unique(mapping.criterionIds)) issue(context, ['backwardDesign', 'evidenceMap', index, 'criterionIds'], '한 연결표 행에서 평가영역을 중복 연결할 수 없습니다.');
        const linkedCriteria = mapping.criterionIds.map(id => criteria.find(item => item.id === id)).filter(Boolean);
        linkedCriteria.forEach(criterion => {
            if (!criterion.standardCodes.includes(mapping.standardCode)) issue(context, ['backwardDesign', 'evidenceMap', index], `${criterion.name} 영역은 ${mapping.standardCode} 성취기준에 선언되어 있지 않습니다.`);
            if (!mapping.taskEvidenceTypes.includes(criterion.evidence)) issue(context, ['backwardDesign', 'evidenceMap', index, 'taskEvidenceTypes'], `${criterion.name} 영역의 관찰 증거가 연결표와 다릅니다.`);
            const expectedEvidenceType = criterion.kind === 'process' ? '과정 증거' : '결과 증거';
            if (!mapping.evidenceTypes.includes(expectedEvidenceType)) issue(context, ['backwardDesign', 'evidenceMap', index, 'evidenceTypes'], `${criterion.name} 영역의 증거 구분이 연결표와 다릅니다.`);
            if (!mapping.scoreBasis.includes(`${criterion.name} ${criterion.maxPoints}점`)) issue(context, ['backwardDesign', 'evidenceMap', index, 'scoreBasis'], `${criterion.name} 영역의 배점 근거가 연결표와 다릅니다.`);
        });
    });
    criteria.forEach((criterion, criterionIndex) => criterion.standardCodes.forEach(code => {
        const pairCount = mappings.filter(mapping => mapping.standardCode === code && mapping.criterionIds.includes(criterion.id)).length;
        if (pairCount !== 1) issue(context, ['rubric', 'criteria', criterionIndex, 'standardCodes'], `${criterion.name} 영역과 ${code} 성취기준 연결은 정확히 한 번 필요합니다.`);
    }));
    const expectedProcess = assessment.scoring.includeProcessInScore ? Math.round(assessment.totalPoints * assessment.scoring.processWeightPercent / 100) : 0;
    const actualProcess = criteria.filter(item => item.kind === 'process').reduce((sum, item) => sum + item.maxPoints, 0);
    if (assessment.scoring.processTargetPoints !== expectedProcess || actualProcess !== expectedProcess) issue(context, ['scoring'], `과정 평가영역 합계는 과정 목표 ${expectedProcess}점과 같아야 합니다.`);
    if (!assessment.scoring.includeProcessInScore && criteria.some(item => item.kind === 'process')) issue(context, ['rubric', 'criteria'], '과정 점수를 제외하면 과정 평가영역이 없어야 합니다.');
    if (!unique(assessment.backwardDesign.checkpoints.map(item => item.order)) || !unique(assessment.backwardDesign.supportPlan.map(item => item.order))) issue(context, ['backwardDesign'], '체크포인트와 지원 계획 순서는 서로 달라야 합니다.');
    const orderedCheckpoints = assessment.backwardDesign.checkpoints.toSorted((left, right) => left.order - right.order);
    const feedbackIndex = orderedCheckpoints.findIndex(item => item.phase === 'feedback');
    const revisionIndex = orderedCheckpoints.findIndex(item => item.phase === 'revision');
    if (feedbackIndex < 0 || revisionIndex <= feedbackIndex) issue(context, ['backwardDesign', 'checkpoints'], '피드백 뒤에 학생이 수정 증거를 제출하는 체크포인트 순서가 필요합니다.');
}

function validateAssessmentRelationships(assessment, context) {
    validateAssessmentDesignRelationships(assessment, context);
    const standardCodes = assessment.task.standards.map(item => item.code);
    if (!unique(assessment.cover.sections.map(item => item.id)) || !unique(assessment.cover.sections.map(item => item.order))) issue(context, ['cover', 'sections'], '표지 섹션 id와 순서는 서로 달라야 합니다.');
    const questions = assessment.studentSheet.document.sections.flatMap(section => section.questions);
    const questionIds = questions.map(question => question.id);
    const answerIds = assessment.studentSheet.teacherKey.answers.map(answer => answer.questionId);
    const usedStandardCodes = new Set(questions.flatMap(question => question.standardCodes));
    if (!unique(questionIds)) issue(context, ['studentSheet', 'document', 'sections'], '수행평가지 문항 id는 서로 달라야 합니다.');
    questions.forEach((question, index) => {
        if (question.standardCodes.some(code => !standardCodes.includes(code))) issue(context, ['studentSheet', 'document', 'sections', index, 'standardCodes'], '수행평가지에는 선택한 성취기준만 연결할 수 있습니다.');
        if (question.prompt.includes('학생이 직접 수행하고 기록할 문항')) issue(context, ['studentSheet', 'document', 'sections', index, 'prompt'], '예시 문구가 아니라 교과 내용과 수행 맥락이 드러나는 구체적인 실제 문항이 필요합니다.');
    });
    standardCodes.forEach(code => {
        if (!usedStandardCodes.has(code)) issue(context, ['studentSheet', 'document', 'sections'], `${code} 성취기준을 직접 확인하는 수행평가지 문항이 필요합니다.`);
    });
    if (!unique(answerIds) || questionIds.length !== answerIds.length || questionIds.some(id => !answerIds.includes(id))) issue(context, ['studentSheet', 'teacherKey', 'answers'], '수행평가지의 모든 문항은 정확히 하나의 교사 채점 참고를 가져야 합니다.');
    if (assessment.includeStudentCover) {
        REQUIRED_COVER_SECTION_TYPES.forEach(type => {
            const matching = assessment.cover.sections.filter(section => section.type === type);
            if (matching.length !== 1 || !matching[0]?.visible) issue(context, ['cover', 'sections'], `학생 표지에는 보이는 ${type} 연결 항목이 정확히 하나 필요합니다.`);
        });
    }
}

export const assessmentDesignSchema = assessmentDesignShape.superRefine(validateAssessmentDesignRelationships);
export const assessmentOutputSchema = assessmentShape.superRefine(validateAssessmentRelationships);
export const approvedAssessmentSchema = z.intersection(assessmentOutputSchema, z.object({ sourceHash: z.string().min(1).max(100), approved: z.literal(true) }));

export function unresolvedBlockingAlignmentIssues(assessment) {
    return [];
}
