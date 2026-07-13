import { z } from 'zod';
import { lessonPlanSchema } from '@/lib/lesson-plan-schema';
import { assessmentOutputSchema } from '@/lib/assessment-schema';
import { assessmentRequestSchema } from '@/lib/assessment-request';
import { chatContent, UpstageError } from '@/lib/upstage/client';
import { assessmentMessages, repairAssessmentMessages } from '@/lib/workflow-prompts';

const requestSchema = z.object({ lessonPlan: lessonPlanSchema, assessmentRequest: assessmentRequestSchema });

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
        cover: { ...value?.cover, title: `${assessmentRequest.assessmentName} 안내` },
    };
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
        const value = reconcileEvidenceMap(teacherOwnedValue);
        const parsed = assessmentOutputSchema.safeParse(value);
        if (!parsed.success) return { success: false, value, issues: parsed.error.issues };
        if (JSON.stringify(parsed.data.backwardDesign.teacherIntent) !== JSON.stringify(assessmentRequest.teacherIntent)) return { success: false, value, issues: [{ path: ['backwardDesign', 'teacherIntent'], message: '교사가 입력한 도착점과 증거 질문을 정확히 보존해야 합니다.' }] };
        const contractIssues = teacherContractIssues(parsed.data, assessmentRequest);
        if (contractIssues.length) return { success: false, value, issues: contractIssues };
        return { success: true, data: parsed.data };
    } catch (error) {
        return { success: false, value: content, issues: [{ path: [], message: `JSON 파싱 오류: ${error instanceof Error ? error.message : '올바른 JSON이 아닙니다.'}` }] };
    }
}

export async function POST(request) {
    let body;
    try { body = await request.json(); } catch { return Response.json({ code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 }); }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ code: 'invalid_request', issues: parsed.error.issues }, { status: 400 });
    const { lessonPlan, assessmentRequest } = parsed.data;
    try {
        const first = await chatContent({ messages: assessmentMessages(lessonPlan, assessmentRequest), timeoutMs: 60000 });
        let checked = parseAssessment(first, lessonPlan, assessmentRequest);
        if (!checked.success) {
            const repaired = await chatContent({ messages: repairAssessmentMessages(lessonPlan, assessmentRequest, checked.value, checked.issues), timeoutMs: 60000 });
            checked = parseAssessment(repaired, lessonPlan, assessmentRequest);
        }
        if (!checked.success) return Response.json({ code: 'invalid_generation', message: '수행평가 형식을 복구하지 못했습니다.', issues: checked.issues }, { status: 422 });
        return Response.json({ assessment: checked.data });
    } catch (error) {
        if (error instanceof UpstageError) return Response.json({ code: error.code, message: error.message }, { status: error.status });
        throw error;
    }
}
