import { test, expect } from 'vitest';
import { instructionModels } from '@/data/instruction-models';
import { validateInstructionModelAlignment, validateIntegrationAlignment } from '@/lib/instruction-model-alignment';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

const inquiry = instructionModels.find(model => model.id === 'inquiry');
const tpack = instructionModels.find(model => model.id === 'tpack');
const samr = instructionModels.find(model => model.id === 'samr');

test('rejects an inquiry plan that only copies the model name', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages.forEach(stage => { stage.learningElement = stage.phase; });

    expect(validateInstructionModelAlignment(plan, inquiry)).toEqual({
        success: false,
        missingStages: ['문제 인식', '가설 설정', '탐구 수행', '결론'],
    });
});

test('accepts ordered inquiry evidence across the formal lesson phases', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages[0].learningElement = '문제 인식 · 가설 설정';
    plan.sessions[0].stages[1].learningElement = '탐구 수행';
    plan.sessions[0].stages[2].learningElement = '결론';
    plan.sessions[0].stages[0].teacherActivities = ['문제 인식: 관찰할 문제를 제시한다.', '가설 설정: 예상 근거를 질문한다.'];
    plan.sessions[0].stages[0].studentActivities = ['문제 인식: 관찰할 문제를 확인한다.', '가설 설정: 예상과 근거를 기록한다.'];
    plan.sessions[0].stages[1].teacherActivities = ['탐구 수행: 관찰 절차를 안내한다.'];
    plan.sessions[0].stages[1].studentActivities = ['탐구 수행: 관찰하고 결과를 기록한다.'];
    plan.sessions[0].stages[2].teacherActivities = ['결론: 증거에 근거한 설명을 지원한다.'];
    plan.sessions[0].stages[2].studentActivities = ['결론: 관찰 증거로 설명한다.'];

    expect(validateInstructionModelAlignment(plan, inquiry)).toEqual({ success: true, missingStages: [] });
});

test('단계명만 맞고 교사·학생 활동에 모형 단계 근거가 없으면 거부한다', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages[0].learningElement = '문제 인식 · 가설 설정';
    plan.sessions[0].stages[1].learningElement = '탐구 수행';
    plan.sessions[0].stages[2].learningElement = '결론';
    plan.sessions[0].stages.forEach(stage => {
        stage.teacherActivities = ['일반적인 안내를 한다.'];
        stage.studentActivities = ['일반적인 활동을 한다.'];
    });

    expect(validateInstructionModelAlignment(plan, inquiry)).toEqual({
        success: false,
        missingStages: [
            '문제 인식 교사 활동', '문제 인식 학생 활동',
            '가설 설정 교사 활동', '가설 설정 학생 활동',
            '탐구 수행 교사 활동', '탐구 수행 학생 활동',
            '결론 교사 활동', '결론 학생 활동',
        ],
    });
});

test('rejects model evidence that appears out of order', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages[0].learningElement = '결론';
    plan.sessions[0].stages[1].learningElement = '탐구 수행';
    plan.sessions[0].stages[2].learningElement = '문제 인식 · 가설 설정';

    expect(validateInstructionModelAlignment(plan, inquiry).success).toBe(false);
});

test('accepts TPACK design checks without forcing them into lesson-phase order', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages[0].materialsAndNotes = ['설계 점검: 기술 적합성 검토 · 내용·목표 확인'];
    plan.sessions[0].stages[1].materialsAndNotes = ['설계 점검: 통합·맥락 점검 · 교수법 선택'];
    plan.sessions[0].stages[0].teacherActivities = ['내용·목표 확인: 성취기준과 목표를 확인한다.', '기술 적합성 검토: 접근성과 대체 수단을 확인한다.'];
    plan.sessions[0].stages[1].studentActivities = ['교수법 선택: 협력 탐구로 내용을 설명한다.', '통합·맥락 점검: 기술 활용의 효과를 성찰한다.'];

    expect(validateInstructionModelAlignment(plan, tpack)).toEqual({ success: true, missingStages: [] });
});

test('rejects a TPACK plan that omits a design check', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages[0].materialsAndNotes = ['설계 점검: 내용·목표 확인 · 교수법 선택 · 기술 적합성 검토'];

    expect(validateInstructionModelAlignment(plan, tpack)).toEqual({
        success: false,
        missingStages: ['내용·목표 확인 활동 근거', '교수법 선택 활동 근거', '기술 적합성 검토 활동 근거', '통합·맥락 점검'],
    });
});

test('accepts one SAMR level when the lesson explains its selection and task change', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages[1].materialsAndNotes = ['설계 점검: 수정(Modification) · 선택 이유: 공동 편집과 즉시 피드백이 목표 달성에 필요함 · 과제 변화: 개인 보고서를 공동 근거 지도 제작으로 재설계함'];
    plan.sessions[0].stages[1].studentActivities = ['수정(Modification): 공동 근거 지도를 편집하고 상호 피드백한다.'];

    expect(validateInstructionModelAlignment(plan, samr)).toEqual({ success: true, missingStages: [] });
});

test('rejects SAMR level names copied without a selection reason and task change', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages[0].materialsAndNotes = ['설계 점검: 대체(Substitution) · 증강(Augmentation) · 수정(Modification) · 재정의(Redefinition)'];

    expect(validateInstructionModelAlignment(plan, samr)).toEqual({
        success: false,
        missingStages: ['SAMR 선택 이유', 'SAMR 과제 변화', 'SAMR 수준 활동 근거'],
    });
});

test('융합수업은 두 교과 관점, 관점의 연결, 공동 산출물이 실제 활동에 있어야 통과한다', () => {
    const plan = makeGeneratedPlan();
    plan.sessions[0].stages[1].teacherActivities = ['과학 관찰 자료와 수학 그래프를 비교하며 두 관점을 연결하도록 안내한다.', '공동 문제 해결을 지원한다.'];
    plan.sessions[0].stages[1].studentActivities = ['과학의 관찰 근거와 수학의 그래프 해석을 통합한다.', '두 교과를 융합한 설명 산출물을 만든다.'];
    const integration = { primarySubject: '과학', secondarySubject: '수학' };

    expect(validateIntegrationAlignment(plan, integration)).toEqual({ success: true, missingEvidence: [] });
});

test('융합수업 활동이 한 교과에만 머물면 누락된 교과와 통합 산출물을 알려준다', () => {
    const plan = makeGeneratedPlan();
    const integration = { primarySubject: '과학', secondarySubject: '수학' };

    expect(validateIntegrationAlignment(plan, integration)).toEqual({
        success: false,
        missingEvidence: ['과학 관점·활동', '수학 관점·활동', '두 교과 관점 통합'],
    });
});
