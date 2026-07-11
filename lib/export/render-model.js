export function lessonPlanLines(plan) {
    const lines = [plan.title, `${plan.grade}학년 ${plan.subject} · ${plan.instructionModel.name}`, '', '성취기준', ...plan.standards.map(item => `[${item.code}] ${item.text}`), '', '학습 목표', ...plan.learningGoals.map((item, index) => `${index + 1}. ${item}`), '', `준비물: ${plan.materials.join(', ') || '없음'}`];
    for (const session of plan.sessions) {
        lines.push('', `${session.order}차시 · ${session.title} (${session.sessionMinutes}분)`);
        for (const stage of session.stages) {
            lines.push(`${stage.phase} (${stage.minutes}분)`, `교사 활동: ${stage.teacherActivities.join(' / ')}`, `학생 활동: ${stage.studentActivities.join(' / ')}`);
            if (stage.materialsAndNotes.length) lines.push(`자료 및 유의점: ${stage.materialsAndNotes.join(' / ')}`);
        }
    }
    lines.push('', '과정중심평가');
    for (const item of plan.assessment) lines.push(`${item.element} · ${item.evidence}`, `피드백: ${item.feedback}`);
    lines.push('', '개별화·지원 전략', ...plan.supportStrategies.map(item => `• ${item}`), '', '수업 후 성찰', plan.reflectionPrompt);
    return lines;
}
