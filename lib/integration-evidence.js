export function integrationSubjectGroups(lessonPlan) {
    if (lessonPlan.instructionModel?.id !== 'integrated') return [];
    const standardsBySubject = new Map();
    for (const standard of lessonPlan.standards) {
        const subject = standard.subject?.trim() || lessonPlan.subject;
        const standards = standardsBySubject.get(subject) ?? [];
        standards.push(standard);
        standardsBySubject.set(subject, standards);
    }
    return [...standardsBySubject].map(([subject, standards]) => ({ subject, standards, codes: standards.map(standard => standard.code) }));
}

export function integrationEvidenceIssues(lessonPlan, evidenceItems) {
    const groups = integrationSubjectGroups(lessonPlan);
    if (groups.length === 0) return [];
    if (groups.length !== 2) return [{ kind: 'subject-groups', subjects: groups.map(group => group.subject) }];
    const normalizedItems = evidenceItems.map(item => new Set(item.standardCodes ?? []));
    const issues = groups.flatMap(group => {
        const groupCodes = new Set(group.codes);
        const hasDisciplinaryEvidence = normalizedItems.some(codes => codes.size > 0 && [...codes].every(code => groupCodes.has(code)));
        return hasDisciplinaryEvidence ? [] : [{ kind: 'disciplinary', subject: group.subject }];
    });
    const hasIntegratedEvidence = normalizedItems.some(codes => groups.every(group => group.codes.some(code => codes.has(code))));
    if (!hasIntegratedEvidence) issues.push({ kind: 'integration', subjects: groups.map(group => group.subject) });
    return issues;
}
