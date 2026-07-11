import { instructionModelGuide } from './instruction-model-guides.js';

function sessionStageEvidence(session) {
    return session.stages.map(stage => stage.learningElement ?? '');
}

export function validateInstructionModelAlignment(plan, model) {
    const requiredStages = instructionModelGuide(model.id).stages;
    const missingStages = new Set();
    for (const session of plan.sessions) {
        const evidence = sessionStageEvidence(session);
        let lastIndex = -1;
        for (const requiredStage of requiredStages) {
            const index = evidence.findIndex((value, evidenceIndex) => evidenceIndex >= lastIndex && value.includes(requiredStage));
            if (index === -1 || index < lastIndex) {
                missingStages.add(requiredStage);
                continue;
            }
            lastIndex = index;
        }
    }
    return missingStages.size
        ? { success: false, missingStages: [...missingStages] }
        : { success: true, missingStages: [] };
}
