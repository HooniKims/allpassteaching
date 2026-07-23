import { assessmentApproachById } from './assessment-approaches.js';
import { createAssessmentStudentSheetTemplate } from './assessment-student-sheet.js';
import { integrationSubjectGroups } from './integration-evidence.js';

export function createAssessmentFallback(lessonPlan, assessmentRequest) {
    const standards = lessonPlan.standards;
    const approach = assessmentApproachById(assessmentRequest.assessmentApproachId);
    const processTargetPoints = assessmentRequest.includeProcessInScore ? Math.round(assessmentRequest.totalPoints * assessmentRequest.processWeightPercent / 100) : 0;
    const levels = Array.from({ length: assessmentRequest.levelCount }, (_, index) => ({ id: `level-${index + 1}`, label: `${index + 1}수준` }));
    const criterionShape = ({ id, name, kind, maxPoints, evidence }) => {
        const descriptions = [
            `${evidence}에서 요구된 요소를 모두 확인할 수 있고, ${name}의 근거와 판단을 정확히 연결해 구체적으로 설명한다.`,
            `${evidence}에서 요구된 요소를 모두 확인할 수 있고, ${name}의 근거를 사용해 핵심 내용을 정확히 설명한다.`,
            `${evidence}에서 요구된 요소를 대부분 확인할 수 있고, ${name}의 핵심 내용을 큰 오류 없이 설명한다.`,
            `${evidence}에서 요구된 요소를 일부 확인할 수 있고, ${name}의 핵심 내용을 부분적으로 설명한다.`,
            `${evidence}에서 요구된 요소가 단편적으로 나타나며, ${name}의 근거나 설명 사이의 연결이 부족하다.`,
            `${evidence}에서 요구된 요소를 확인하기 어렵거나, 제시한 내용이 ${name}의 평가 내용과 관련되지 않는다.`,
        ];
        const intervalPoints = Math.max(1, Math.floor(maxPoints / levels.length));
        return {
            id, name, description: '성취기준에서 도출한 평가 내용', standardCodes: standards.map(item => item.code), kind, maxPoints, intervalPoints, evidence,
            levels: levels.map((level, index) => ({
                levelId: level.id,
                score: Math.max(0, maxPoints - intervalPoints * index),
                description: descriptions[Math.round(index * (descriptions.length - 1) / (levels.length - 1))],
            })),
        };
    };
    const integrationGroups = integrationSubjectGroups(lessonPlan);
    const outcomePoints = assessmentRequest.totalPoints - processTargetPoints;
    const minimumCriterionPoints = assessmentRequest.levelCount - 1;
    const disciplinaryPoints = Math.max(minimumCriterionPoints, Math.floor(outcomePoints / 4));
    const integratedCriteria = integrationGroups.length === 2 && outcomePoints >= minimumCriterionPoints * 3
        ? [
            criterionShape({ id: 'criterion-primary', name: `${integrationGroups[0].subject} 교과 근거`, kind: 'outcome', maxPoints: disciplinaryPoints, evidence: `${integrationGroups[0].subject} 교과의 개념·자료·방법을 사용한 수행 증거` }),
            criterionShape({ id: 'criterion-secondary', name: `${integrationGroups[1].subject} 교과 근거`, kind: 'outcome', maxPoints: disciplinaryPoints, evidence: `${integrationGroups[1].subject} 교과의 개념·자료·방법을 사용한 수행 증거` }),
            criterionShape({ id: 'criterion-integration', name: '교과 관점 통합', kind: 'outcome', maxPoints: outcomePoints - disciplinaryPoints * 2, evidence: '두 교과의 근거를 연결해 만든 설명, 해결안 또는 공동 산출물' }),
        ].map((criterion, index) => ({ ...criterion, standardCodes: index < 2 ? integrationGroups[index].codes : standards.map(item => item.code) }))
        : null;
    const splitOutcomeCriteria = points => {
        const understanding = Math.round(points * 0.4);
        const inquiry = Math.round(points * 0.35);
        const analysis = points - understanding - inquiry;
        return [
            criterionShape({ id: 'criterion-understanding', name: '개념 이해', kind: 'outcome', maxPoints: understanding, evidence: '산출물에서 핵심 개념을 정확히 설명한 부분' }),
            criterionShape({ id: 'criterion-inquiry', name: '탐구·자료 수행', kind: 'outcome', maxPoints: inquiry, evidence: '산출물에서 자료를 다루고 탐구·측정을 수행한 부분' }),
            criterionShape({ id: 'criterion-analysis', name: '분석·결론', kind: 'outcome', maxPoints: analysis, evidence: '산출물에서 자료를 분석해 결론을 도출한 부분' }),
        ];
    };
    const outcomeCriteria = integratedCriteria ?? (outcomePoints >= 3
        ? splitOutcomeCriteria(outcomePoints)
        : [criterionShape({ id: 'criterion-outcome', name: '결과 증거', kind: 'outcome', maxPoints: outcomePoints, evidence: '산출물에서 직접 찾을 수 있는 결과 증거' })]);
    const rubricCriteria = assessmentRequest.includeProcessInScore
        ? [...outcomeCriteria, criterionShape({ id: 'criterion-process', name: '피드백 반영 과정', kind: 'process', maxPoints: processTargetPoints, evidence: '초안, 피드백 표시, 수정본과 수정 이유' })]
        : outcomeCriteria;
    const studentSheet = createAssessmentStudentSheetTemplate({
        title: assessmentRequest.assessmentName,
        standards,
        answerTypes: assessmentRequest.answerTypes,
        stages: assessmentRequest.stages,
        goal: assessmentRequest.teacherIntent.desiredResult,
        successCriteria: assessmentRequest.teacherIntent.evidenceOfSuccess,
    });
    if (integrationGroups.length === 2) {
        const question = { id: 'performance-q-integration', type: 'descriptive', prompt: `${integrationGroups.map(group => group.subject).join('와 ')}의 근거를 각각 제시하고, 두 근거를 연결해 최종 산출물의 결론이나 해결안을 설명하세요.`, responseLines: 10, standardCodes: integrationGroups.flatMap(group => group.codes.slice(0, 1)) };
        studentSheet.document.sections.at(-1).questions.push(question);
        studentSheet.teacherKey.answers.push({ questionId: question.id, answer: '각 교과의 정확한 근거, 근거 사이의 명시적 연결, 그 연결로 발전한 결론이나 해결안을 확인한다.' });
    }
    return {
        assessmentName: assessmentRequest.assessmentName,
        subject: lessonPlan.subject,
        backwardDesign: {
            teacherIntent: assessmentRequest.teacherIntent,
            transferGoal: '새로운 맥락에서도 스스로 적용할 장기 전이 목표', enduringUnderstanding: '평가 뒤에도 남아야 할 핵심 이해', essentialQuestions: ['핵심 질문'], knowledge: ['알아야 할 지식'], skills: ['스스로 해낼 기능'],
            evidenceMap: standards.map(standard => ({ standardCode: standard.code, taskEvidenceTypes: ['각 연결 평가영역의 evidence 원문'], criterionIds: ['이 성취기준을 선언한 criterion id'], evidenceTypes: ['결과 증거', '과정 증거'], scoreBasis: '평가영역명 배점점 · 수준별 정의 점수' })),
            checkpoints: [{ id: 'checkpoint-feedback', phase: 'feedback', title: '초안 피드백', evidence: '초안과 피드백 표시', feedbackPurpose: '근거를 보완하도록 피드백함', order: 1 }, { id: 'checkpoint-revision', phase: 'revision', title: '수정본', evidence: '수정 표시와 이유', feedbackPurpose: '피드백을 반영해 수정함', order: 2 }],
            supportPlan: [{ id: 'support-1', order: 1, title: '수행 준비', purpose: '목표 증거를 준비함', teacherAction: '필요한 발판과 피드백을 제공함', studentEvidence: '지원 뒤 달라진 수행 증거' }],
            alignmentIssues: [],
        },
        task: {
            title: assessmentRequest.assessmentName || '수행과제명',
            standards,
            goal: assessmentRequest.teacherIntent.desiredResult || '학생이 수행과제를 통해 성취할 목표',
            role: '학생이 맡을 실제적 역할',
            audience: '결과물을 공유할 실제적 대상',
            situation: '학습 내용을 적용할 실제적 상황',
            product: assessmentRequest.outputTypes.join(', '),
            successCriteria: assessmentRequest.teacherIntent.evidenceOfSuccess || '성취기준과 루브릭에서 확인할 관찰 가능한 성공 기준',
            procedure: ['수행 절차'], conditions: ['제출 조건'], materials: ['준비물'], cautions: ['유의점'],
        },
        studentSheet,
        cover: { title: `${assessmentRequest.assessmentName || '수행평가'} 안내`, sections: [
            { id: 'cover-subject', type: 'subject', label: '과목', content: '', visible: true, order: 1 },
            { id: 'cover-transfer', type: 'transfer-goal', label: '전이 목표', content: '', visible: true, order: 2 },
            { id: 'cover-standards', type: 'standards', label: '성취기준', content: '', visible: true, order: 3 },
            { id: 'cover-grasps', type: 'grasps', label: '수행과제 맥락', content: '', visible: true, order: 4 },
            { id: 'cover-submission', type: 'submission', label: '제출 안내', content: '', visible: true, order: 5 },
            { id: 'cover-checkpoints', type: 'checkpoints', label: '수행 과정', content: '', visible: true, order: 6 },
            { id: 'cover-rubric', type: 'rubric', label: '평가 기준', content: '', visible: true, order: 7 },
            { id: 'cover-self-checklist', type: 'self-checklist', label: '제출 전 확인', content: '성취기준에 맞는 증거를 제시했는가?', visible: true, order: 8 },
        ] },
        rubric: { levels, criteria: rubricCriteria },
        scoring: { includeProcessInScore: assessmentRequest.includeProcessInScore, processWeightPercent: assessmentRequest.processWeightPercent, processTargetPoints },
        totalPoints: assessmentRequest.totalPoints,
        visualAnalysisRequired: assessmentRequest.visualAnalysisRequired,
        includeStudentCover: assessmentRequest.includeStudentCover,
        generationSettings: { outputTypes: assessmentRequest.outputTypes, answerTypes: assessmentRequest.answerTypes, stages: assessmentRequest.stages, additionalRequirements: assessmentRequest.additionalRequirements, assessmentApproachId: approach.id },
    };
}
