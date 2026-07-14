const normalized = value => String(value || '').replace(/\s+/g, ' ').trim();

export const withoutLeadingStepNumber = value => String(value || '').replace(/^\s*\d+\s*[.)]\s*/, '').trim();
export const numberedStep = (value, index) => `${index + 1}. ${withoutLeadingStepNumber(value)}`;

export function coverSectionContentIsRedundant(assessment, section) {
    const task = assessment.task;
    const candidates = {
        subject: [assessment.subject, `과목 · ${assessment.subject}`],
        'transfer-goal': [assessment.backwardDesign.transferGoal],
        standards: [
            task.standards.map(standard => `${standard.code}: ${standard.text}`).join(' / '),
            task.standards.map(standard => `[${standard.code}] ${standard.text}`).join(' / '),
        ],
        grasps: [task.goal, task.role, task.audience, task.situation, task.product, task.successCriteria],
        task: [task.product, ...task.procedure],
        procedure: [task.procedure.join('\n'), task.procedure.join(' → '), ...task.procedure],
        submission: [task.conditions.join(', '), task.materials.join(', '), task.cautions.join(', ')],
    }[section.type] || [];
    const content = normalized(section.content);
    return content !== '' && candidates.some(candidate => normalized(candidate) === content);
}
