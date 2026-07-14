import { instructionModelGuide } from './instruction-model-guides.js';

function sessionStageEvidence(session) {
    return session.stages.map(stage => stage.learningElement ?? '');
}

function stageActivityEvidence(stage, key) {
    return (stage[key] ?? []).filter(Boolean).join('\n');
}

function sessionDesignEvidence(session) {
    return session.stages.flatMap(stage => [
        stage.learningElement,
        ...(stage.teacherActivities ?? []),
        ...(stage.studentActivities ?? []),
        ...(stage.expectedStudentResponses ?? []),
        ...(stage.materialsAndNotes ?? []),
    ]).filter(Boolean).join('\n');
}

function sessionDesignNotes(session) {
    return session.stages.flatMap(stage => stage.materialsAndNotes ?? []).filter(Boolean).join('\n');
}

function sessionActivityEvidence(session) {
    return session.stages.flatMap(stage => [
        ...(stage.teacherActivities ?? []),
        ...(stage.studentActivities ?? []),
        ...(stage.expectedStudentResponses ?? []),
    ]).filter(Boolean).join('\n');
}

function labelActivities(items, requiredStages) {
    const labeled = [...items];
    requiredStages.forEach((requiredStage, index) => {
        if (labeled.some(item => item.includes(requiredStage))) return;
        const itemIndex = Math.min(index, labeled.length - 1);
        labeled[itemIndex] = `${requiredStage}: ${labeled[itemIndex]}`;
    });
    return labeled;
}

export function labelInstructionModelActivities(plan, model) {
    const guide = instructionModelGuide(model.id);
    if (guide.applicationMode === 'design-check') return structuredClone(plan);
    const labeledPlan = structuredClone(plan);
    for (const session of labeledPlan.sessions) {
        for (const stage of session.stages) {
            stage.learningElement = [...new Set(stage.learningElement.split(' · ').map(item => item.trim()).filter(Boolean))].join(' · ');
            const requiredStages = guide.stages.filter(requiredStage => stage.learningElement.includes(requiredStage));
            stage.teacherActivities = labelActivities(stage.teacherActivities, requiredStages);
            stage.studentActivities = labelActivities(stage.studentActivities, requiredStages);
        }
    }
    return labeledPlan;
}

export function validateInstructionModelAlignment(plan, model) {
    const guide = instructionModelGuide(model.id);
    const requiredStages = guide.stages;
    const missingStages = new Set();
    for (const session of plan.sessions) {
        if (guide.applicationMode === 'design-check') {
            if (guide.designCheckMode === 'select-one') {
                const notes = sessionDesignNotes(session);
                const selectedStage = requiredStages.find(requiredStage => notes.includes(requiredStage));
                if (!selectedStage) missingStages.add('SAMR 수준');
                if (!notes.includes('선택 이유:')) missingStages.add('SAMR 선택 이유');
                if (!notes.includes('과제 변화:')) missingStages.add('SAMR 과제 변화');
                if (selectedStage && !sessionActivityEvidence(session).includes(selectedStage)) missingStages.add('SAMR 수준 활동 근거');
                continue;
            }
            const evidence = sessionDesignEvidence(session);
            const activityEvidence = sessionActivityEvidence(session);
            for (const requiredStage of requiredStages) {
                if (!evidence.includes(requiredStage)) missingStages.add(requiredStage);
                else if (!activityEvidence.includes(requiredStage)) missingStages.add(`${requiredStage} 활동 근거`);
            }
            continue;
        }
        const evidence = sessionStageEvidence(session);
        let lastIndex = -1;
        for (const requiredStage of requiredStages) {
            const index = evidence.findIndex((value, evidenceIndex) => evidenceIndex >= lastIndex && value.includes(requiredStage));
            if (index === -1 || index < lastIndex) {
                missingStages.add(requiredStage);
                continue;
            }
            lastIndex = index;
            const matchedStage = session.stages[index];
            if (!stageActivityEvidence(matchedStage, 'teacherActivities').includes(requiredStage)) missingStages.add(`${requiredStage} 교사 활동`);
            if (!stageActivityEvidence(matchedStage, 'studentActivities').includes(requiredStage)) missingStages.add(`${requiredStage} 학생 활동`);
        }
    }
    return missingStages.size
        ? { success: false, missingStages: [...missingStages] }
        : { success: true, missingStages: [] };
}

export function validateIntegrationAlignment(plan, integration) {
    if (!integration) return { success: false, missingEvidence: ['융합 교과 정보'] };
    const activityEvidence = [
        ...plan.sessions.flatMap(session => session.stages.flatMap(stage => [
            ...(stage.teacherActivities ?? []),
            ...(stage.studentActivities ?? []),
            ...(stage.expectedStudentResponses ?? []),
            ...(stage.materialsAndNotes ?? []),
        ])),
        ...(plan.assessment ?? []).flatMap(item => [item.element, item.method, item.evidence]),
        plan.detailedPlan?.teachingStrategy,
    ].filter(Boolean).join('\n');
    const missingEvidence = [];
    for (const subject of [integration.primarySubject, integration.secondarySubject]) {
        if (!activityEvidence.includes(subject)) missingEvidence.push(`${subject} 관점·활동`);
    }
    if (!/(융합|통합)/.test(activityEvidence)) missingEvidence.push('두 교과 관점 통합');
    if (!/(산출물|결과물|보고서|발표|설명|모델|모형|포스터|제안|해결안)/.test(activityEvidence)) missingEvidence.push('공동 산출물');
    return missingEvidence.length
        ? { success: false, missingEvidence }
        : { success: true, missingEvidence: [] };
}
