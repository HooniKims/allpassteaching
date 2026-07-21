export function extractAssessmentDesign(assessment) {
    const { studentSheet, cover, sourceHash, designHash, approved, requiresAssessmentRegeneration, ...design } = assessment;
    return design;
}

export function assessmentRequestFromDesign(design) {
    return {
        assessmentName: design.assessmentName,
        teacherIntent: design.backwardDesign.teacherIntent,
        totalPoints: design.totalPoints,
        levelCount: design.rubric.levels.length,
        includeProcessInScore: design.scoring.includeProcessInScore,
        processWeightPercent: design.scoring.processWeightPercent,
        outputTypes: design.generationSettings.outputTypes,
        answerTypes: design.generationSettings.answerTypes,
        stages: design.generationSettings.stages,
        visualAnalysisRequired: design.visualAnalysisRequired,
        includeStudentCover: design.includeStudentCover,
        additionalRequirements: design.generationSettings.additionalRequirements,
        assessmentApproachId: design.generationSettings.assessmentApproachId,
    };
}

export function assessmentSupplementFrom(assessment) {
    return { studentSheet: assessment.studentSheet, cover: assessment.cover };
}
