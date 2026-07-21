import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { assessmentDesignSchema, assessmentOutputSchema } from '@/lib/assessment-schema';
import { assessmentRequestSchema, integratedAssessmentScoreIssue } from '@/lib/assessment-request';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { assessmentMessages, repairAssessmentMessages } from '@/lib/workflow-prompts';
import { assessmentDesignMessages, assessmentStudentSheetMessages, repairAssessmentDesignMessages, repairAssessmentStudentSheetMessages } from '@/lib/assessment-prompts';
import { createAssessmentFallback } from '@/lib/assessment-fallback';
import { upgradeAssessmentStudentSheet } from '@/lib/assessment-student-sheet';
import { integrationEvidenceIssues } from '@/lib/integration-evidence';
import { assessmentRequestFromDesign, assessmentSupplementFrom, extractAssessmentDesign } from '@/lib/assessment-design';

const designRequestSchema = z.object({ phase: z.literal('design').optional(), lessonPlan: lessonPlanSchema, assessmentRequest: assessmentRequestSchema }).superRefine(({ lessonPlan, assessmentRequest }, context) => {
    if (lessonPlan.instructionModel.id !== 'integrated') return;
    const issue = integratedAssessmentScoreIssue(assessmentRequest);
    if (issue) context.addIssue({ code: 'custom', path: ['assessmentRequest', ...issue.path], message: issue.message });
});
const studentSheetRequestSchema = z.object({ phase: z.literal('student-sheet'), lessonPlan: lessonPlanSchema, assessmentDesign: assessmentDesignSchema });

function reconcileTeacherOwnedFields(value, lessonPlan, assessmentRequest) {
    return {
        ...value,
        assessmentName: assessmentRequest.assessmentName,
        subject: lessonPlan.subject,
        visualAnalysisRequired: assessmentRequest.visualAnalysisRequired,
        includeStudentCover: assessmentRequest.includeStudentCover,
        generationSettings: {
            outputTypes: assessmentRequest.outputTypes,
            answerTypes: assessmentRequest.answerTypes,
            stages: assessmentRequest.stages,
            additionalRequirements: assessmentRequest.additionalRequirements,
            assessmentApproachId: assessmentRequest.assessmentApproachId,
        },
        task: { ...value?.task, standards: lessonPlan.standards, product: assessmentRequest.outputTypes.join(', ') },
        ...(value?.cover ? { cover: { ...value.cover, title: `${assessmentRequest.assessmentName} 안내` } } : {}),
    };
}

function integrationIssuesFor(lessonPlan, assessment, includeQuestions) {
    const outcomeCriteria = assessment.rubric.criteria.filter(criterion => criterion.kind === 'outcome');
    const criterionIssues = integrationEvidenceIssues(lessonPlan, outcomeCriteria).map(issue => ({ ...issue, path: ['rubric', 'criteria'] }));
    if (!includeQuestions) return criterionIssues;
    const questions = assessment.studentSheet.document.sections.flatMap(section => section.questions);
    return [...criterionIssues, ...integrationEvidenceIssues(lessonPlan, questions).map(issue => ({ ...issue, path: ['studentSheet', 'document', 'sections'] }))];
}

function issueMessage(issue) {
    return issue.kind === 'disciplinary' ? `${issue.subject} 교과의 고유한 수행 증거가 필요합니다.` : '두 교과의 근거를 연결한 통합 수행 증거가 필요합니다.';
}

function parseAssessmentDesign(content, lessonPlan, assessmentRequest) {
    try {
        const rawValue = JSON.parse(content);
        const value = reconcileEvidenceMap(reconcileTeacherOwnedFields(extractAssessmentDesign(rawValue), lessonPlan, assessmentRequest));
        const parsed = assessmentDesignSchema.safeParse(value);
        if (!parsed.success) return { success: false, value, issues: parsed.error.issues };
        if (JSON.stringify(parsed.data.backwardDesign.teacherIntent) !== JSON.stringify(assessmentRequest.teacherIntent)) return { success: false, value, issues: [{ path: ['backwardDesign', 'teacherIntent'], message: '교사가 입력한 도착점과 증거 질문을 정확히 보존해야 합니다.' }] };
        const issues = [...teacherContractIssues(parsed.data, assessmentRequest), ...integrationIssuesFor(lessonPlan, parsed.data, false).map(issue => ({ path: issue.path, message: issueMessage(issue) }))];
        return issues.length ? { success: false, value, issues } : { success: true, data: parsed.data };
    } catch (error) {
        return { success: false, value: content, issues: [{ path: [], message: `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}` }] };
    }
}

function parseStudentSheet(content, lessonPlan, design) {
    try {
        const supplement = JSON.parse(content);
        const value = upgradeAssessmentStudentSheet({ ...design, studentSheet: supplement.studentSheet, cover: supplement.cover });
        const parsed = assessmentOutputSchema.safeParse(value);
        if (!parsed.success) return { success: false, value: supplement, issues: parsed.error.issues };
        const issues = integrationIssuesFor(lessonPlan, parsed.data, true).filter(issue => issue.path[0] === 'studentSheet').map(issue => ({ path: issue.path, message: issueMessage(issue) }));
        return issues.length ? { success: false, value: supplement, issues } : { success: true, data: parsed.data };
    } catch (error) {
        return { success: false, value: content, issues: [{ path: [], message: `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}` }] };
    }
}

function reconcileEvidenceMap(value) {
    const standards = value?.task?.standards;
    const criteria = value?.rubric?.criteria;
    if (!Array.isArray(standards) || !Array.isArray(criteria)) return value;
    return {
        ...value,
        backwardDesign: {
            ...value?.backwardDesign,
            evidenceMap: standards.map(standard => {
                const linkedCriteria = criteria.filter(criterion => Array.isArray(criterion?.standardCodes) && criterion.standardCodes.includes(standard.code));
                return {
                    standardCode: standard.code,
                    criterionIds: linkedCriteria.map(criterion => criterion.id),
                    taskEvidenceTypes: [...new Set(linkedCriteria.map(criterion => criterion.evidence))],
                    evidenceTypes: ['결과 증거', '과정 증거'].filter(type => linkedCriteria.some(criterion => (criterion.kind === 'process' ? '과정 증거' : '결과 증거') === type)),
                    scoreBasis: `${linkedCriteria.map(criterion => `${criterion.name} ${criterion.maxPoints}점`).join(', ')} · 수준별 정의 점수`,
                };
            }),
        },
    };
}

function teacherContractIssues(assessment, assessmentRequest) {
    const issues = [];
    const expectedProcessPoints = assessmentRequest.includeProcessInScore ? Math.round(assessmentRequest.totalPoints * assessmentRequest.processWeightPercent / 100) : 0;
    const checks = [
        [assessment.totalPoints === assessmentRequest.totalPoints, ['totalPoints'], '교사가 정한 전체 총점을 바꿀 수 없습니다.'],
        [assessment.rubric.levels.length === assessmentRequest.levelCount, ['rubric', 'levels'], '교사가 정한 성취수준 수를 바꿀 수 없습니다.'],
        [assessment.scoring.includeProcessInScore === assessmentRequest.includeProcessInScore, ['scoring', 'includeProcessInScore'], '교사가 정한 과정 점수 포함 여부를 바꿀 수 없습니다.'],
        [assessment.scoring.processWeightPercent === assessmentRequest.processWeightPercent, ['scoring', 'processWeightPercent'], '교사가 정한 과정 점수 비중을 바꿀 수 없습니다.'],
        [assessment.scoring.processTargetPoints === expectedProcessPoints, ['scoring', 'processTargetPoints'], '과정 목표 점수는 교사 설정에서 계산한 값이어야 합니다.'],
    ];
    checks.forEach(([matches, path, message]) => { if (!matches) issues.push({ path, message }); });
    return issues;
}

function parseAssessment(content, lessonPlan, assessmentRequest) {
    try {
        const rawValue = JSON.parse(content);
        const teacherOwnedValue = reconcileTeacherOwnedFields(rawValue, lessonPlan, assessmentRequest);
        const value = reconcileEvidenceMap(upgradeAssessmentStudentSheet(teacherOwnedValue));
        const parsed = assessmentOutputSchema.safeParse(value);
        if (!parsed.success) return { success: false, value, issues: parsed.error.issues };
        if (JSON.stringify(parsed.data.backwardDesign.teacherIntent) !== JSON.stringify(assessmentRequest.teacherIntent)) return { success: false, value, issues: [{ path: ['backwardDesign', 'teacherIntent'], message: '교사가 입력한 도착점과 증거 질문을 정확히 보존해야 합니다.' }] };
        const contractIssues = teacherContractIssues(parsed.data, assessmentRequest);
        if (contractIssues.length) return { success: false, value, issues: contractIssues };
        const integrationIssues = integrationIssuesFor(lessonPlan, parsed.data, true);
        if (integrationIssues.length) return { success: false, value, issues: integrationIssues.map(issue => ({
            path: issue.path,
            message: issueMessage(issue),
        })) };
        return { success: true, data: parsed.data };
    } catch (error) {
        return { success: false, value: content, issues: [{ path: [], message: `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}` }] };
    }
}

export async function POST(request) {
    let body;
    try { body = await request.json(); } catch { return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    if (body?.phase === 'student-sheet') {
        const parsed = studentSheetRequestSchema.safeParse(body);
        if (!parsed.success) return Response.json({ code: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
        const { lessonPlan, assessmentDesign } = parsed.data;
        try {
            const first = await chatContent({ messages: assessmentStudentSheetMessages(lessonPlan, assessmentDesign), timeoutMs: 60000 });
            let checked = parseStudentSheet(first, lessonPlan, assessmentDesign);
            if (!checked.success) {
                const repaired = await chatContent({ messages: repairAssessmentStudentSheetMessages(lessonPlan, assessmentDesign, checked.value, checked.issues), timeoutMs: 60000 });
                checked = parseStudentSheet(repaired, lessonPlan, assessmentDesign);
            }
            if (!checked.success) checked = parseStudentSheet(JSON.stringify(assessmentSupplementFrom(createAssessmentFallback(lessonPlan, assessmentRequestFromDesign(assessmentDesign)))), lessonPlan, assessmentDesign);
            if (!checked.success) return Response.json({ code: 'invalid_generation', message: '학생용 수행평가지 형식을 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
            return Response.json({ assessment: checked.data });
        } catch (error) {
            if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
            throw error;
        }
    }
    const parsed = designRequestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
    const { lessonPlan, assessmentRequest } = parsed.data;
    try {
        if (body.phase === 'design') {
            const first = await chatContent({ messages: assessmentDesignMessages(lessonPlan, assessmentRequest), timeoutMs: 60000 });
            let checked = parseAssessmentDesign(first, lessonPlan, assessmentRequest);
            if (!checked.success) {
                const repaired = await chatContent({ messages: repairAssessmentDesignMessages(lessonPlan, assessmentRequest, checked.value, checked.issues), timeoutMs: 60000 });
                checked = parseAssessmentDesign(repaired, lessonPlan, assessmentRequest);
            }
            if (!checked.success) checked = parseAssessmentDesign(JSON.stringify(extractAssessmentDesign(createAssessmentFallback(lessonPlan, assessmentRequest))), lessonPlan, assessmentRequest);
            if (!checked.success) return Response.json({ code: 'invalid_generation', message: '수행평가 설계 형식을 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
            return Response.json({ assessmentDesign: checked.data });
        }
        const first = await chatContent({ messages: assessmentMessages(lessonPlan, assessmentRequest), timeoutMs: 60000 });
        let checked = parseAssessment(first, lessonPlan, assessmentRequest);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairAssessmentMessages(lessonPlan, assessmentRequest, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseAssessment(repaired, lessonPlan, assessmentRequest);
        }
        if (!checked.success) checked = parseAssessment(JSON.stringify(createAssessmentFallback(lessonPlan, assessmentRequest)), lessonPlan, assessmentRequest);
        if (!checked.success) return Response.json({ code: 'invalid_generation', message: '수행평가 형식을 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return Response.json({ assessment: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
