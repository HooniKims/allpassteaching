import { z } from 'zod';
import { scoreLadderIsValid } from './rubric-score.js';

const text = z.string().trim().min(1).max(5000);
const optionalText = z.string().trim().max(5000);
const shortText = z.string().trim().min(1).max(300);
const unique = values => new Set(values).size === values.length;
const issue = (context, path, message) => context.addIssue({ code: 'custom', path, message });

const levelSchema = z.object({ id: shortText, label: shortText });
const criterionLevelSchema = z.object({ levelId: shortText, score: z.number().int().min(0).max(1000), description: text });
const criterionSchema = z.object({
    id: shortText, name: shortText, description: text, standardCodes: z.array(shortText).min(1).max(10),
    kind: z.enum(['outcome', 'process']), maxPoints: z.number().int().min(1).max(1000), intervalPoints: z.number().int().min(1).max(1000),
    evidence: text, levels: z.array(criterionLevelSchema).min(2).max(6),
});

const assessmentShape = z.object({
    backwardDesign: z.object({
        teacherIntent: z.object({ desiredResult: text, evidenceOfSuccess: optionalText, growthProcess: optionalText }),
        transferGoal: text, enduringUnderstanding: text, essentialQuestions: z.array(text).min(1).max(8), knowledge: z.array(text).min(1).max(20), skills: z.array(text).min(1).max(20),
        evidenceMap: z.array(z.object({ standardCode: shortText, taskEvidenceTypes: z.array(shortText).min(1).max(10), criterionIds: z.array(shortText).min(1).max(15), evidenceTypes: z.array(shortText).min(1).max(10), scoreBasis: text })).min(1).max(20),
        checkpoints: z.array(z.object({ id: shortText, title: shortText, evidence: text, feedbackPurpose: text, order: z.number().int().min(1).max(20) })).min(1).max(10),
        supportPlan: z.array(z.object({ id: shortText, order: z.number().int().min(1).max(20), title: shortText, purpose: text, teacherAction: text, studentEvidence: text })).min(1).max(20),
        alignmentIssues: z.array(z.object({ id: shortText, severity: z.enum(['blocking', 'warning']), code: shortText, message: text, resolved: z.boolean() })).max(30),
    }),
    task: z.object({
        title: shortText, standards: z.array(z.object({ code: shortText, text })).min(1).max(10), situation: text, role: text, audience: text, product: text,
        procedure: z.array(text).min(1).max(20), conditions: z.array(text).min(1).max(20), materials: z.array(text).max(30), cautions: z.array(text).max(20),
    }),
    cover: z.object({
        title: shortText,
        sections: z.array(z.object({ id: shortText, type: z.enum(['identity', 'purpose', 'standards', 'task', 'procedure', 'checkpoints', 'rubric', 'self-checklist', 'custom']), label: shortText, content: optionalText, visible: z.boolean(), order: z.number().int().min(1).max(30) })).min(1).max(20),
    }),
    rubric: z.object({ levels: z.array(levelSchema).min(2).max(6), criteria: z.array(criterionSchema).min(2).max(15) }),
    scoring: z.object({ includeProcessInScore: z.boolean(), processWeightPercent: z.number().int().min(0).max(100), processTargetPoints: z.number().int().min(0).max(1000) }),
    totalPoints: z.number().int().min(1).max(1000),
    visualAnalysisRequired: z.boolean(),
});

function validateAssessmentRelationships(assessment, context) {
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
        if (criterion.levels.map(item => item.levelId).join('|') !== levelIds.join('|')) issue(context, ['rubric', 'criteria', index, 'levels'], '모든 평가영역은 같은 성취수준 순서를 사용해야 합니다.');
        if (criterion.standardCodes.some(code => !standardCodes.includes(code))) issue(context, ['rubric', 'criteria', index, 'standardCodes'], '선택하지 않은 성취기준은 연결할 수 없습니다.');
    });
    standardCodes.forEach(code => {
        if (!criteria.some(item => item.standardCodes.includes(code))) issue(context, ['rubric', 'criteria'], `${code} 성취기준에 연결된 평가영역이 없습니다.`);
        if (!assessment.backwardDesign.evidenceMap.some(item => item.standardCode === code)) issue(context, ['backwardDesign', 'evidenceMap'], `${code} 성취기준이 연결표에서 누락되었습니다.`);
    });
    const mappedIds = new Set(assessment.backwardDesign.evidenceMap.flatMap(item => item.criterionIds));
    criterionIds.forEach(id => { if (!mappedIds.has(id)) issue(context, ['backwardDesign', 'evidenceMap'], `${id} 평가영역이 연결표에서 누락되었습니다.`); });
    assessment.backwardDesign.evidenceMap.forEach((mapping, index) => {
        if (!standardCodes.includes(mapping.standardCode) || mapping.criterionIds.some(id => !criterionIds.includes(id))) issue(context, ['backwardDesign', 'evidenceMap', index], '연결표에 존재하지 않는 성취기준 또는 평가영역이 있습니다.');
    });
    const expectedProcess = assessment.scoring.includeProcessInScore ? Math.round(assessment.totalPoints * assessment.scoring.processWeightPercent / 100) : 0;
    const actualProcess = criteria.filter(item => item.kind === 'process').reduce((sum, item) => sum + item.maxPoints, 0);
    if (assessment.scoring.processTargetPoints !== expectedProcess || actualProcess !== expectedProcess) issue(context, ['scoring'], `과정 평가영역 합계는 과정 목표 ${expectedProcess}점과 같아야 합니다.`);
    if (!assessment.scoring.includeProcessInScore && criteria.some(item => item.kind === 'process')) issue(context, ['rubric', 'criteria'], '과정 점수를 제외하면 과정 평가영역이 없어야 합니다.');
    if (!unique(assessment.cover.sections.map(item => item.id)) || !unique(assessment.cover.sections.map(item => item.order))) issue(context, ['cover', 'sections'], '표지 섹션 id와 순서는 서로 달라야 합니다.');
    if (!unique(assessment.backwardDesign.checkpoints.map(item => item.order)) || !unique(assessment.backwardDesign.supportPlan.map(item => item.order))) issue(context, ['backwardDesign'], '체크포인트와 지원 계획 순서는 서로 달라야 합니다.');
}

export const assessmentOutputSchema = assessmentShape.superRefine(validateAssessmentRelationships);
export const approvedAssessmentSchema = z.intersection(assessmentOutputSchema, z.object({ sourceHash: z.string().min(1).max(100), approved: z.literal(true) }));

export function unresolvedBlockingAlignmentIssues(assessment) {
    return assessment?.backwardDesign?.alignmentIssues?.filter(item => item.severity === 'blocking' && !item.resolved) ?? [];
}
