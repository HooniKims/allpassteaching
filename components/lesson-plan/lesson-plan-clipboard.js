import { buildDocumentModel } from '@/lib/export/document-model.js';

function overviewText(value) {
    if (!Array.isArray(value)) return String(value ?? '');
    return value.map(item => typeof item === 'string' ? item : `${item.subject ? `[${item.subject}] ` : ''}[${item.code}] ${item.text}`).join(' / ');
}

export function lessonPlanClipboardText(plan, variant = 'brief') {
    const document = buildDocumentModel(plan, { variant });
    const lines = [document.documentTitle];

    if (document.detail) {
        lines.push('', '수업자 의도 및 지도 중점', document.detail.teacherIntent, '', '단원 개관', document.detail.unitOverview, '', '단원 목표', ...document.detail.unitGoals, '', '학습자 분석 및 지도 대책', document.detail.learnerAnalysis, '', '수업 모형·설계 틀 적용 전략', document.detail.teachingStrategy, '', '단원 지도 계획');
        for (const item of document.detail.unitSequence) lines.push(`${item.session} · ${item.topic} · ${item.learningGoal} · ${item.focus}`);
        lines.push('', '판서·화면 및 자료 활용 계획', ...document.detail.boardPlan, '', '참고 자료', ...document.detail.references);
    }

    for (const session of document.sessions) {
        lines.push('', `${session.order}차시: ${session.title}`, '수업 개요');
        for (const row of session.overview.rows) lines.push(`${row.label}: ${overviewText(row.value)}`);

        lines.push('', '교수·학습 과정');
        for (const row of session.process.rows) {
            lines.push(`단계: ${row.phase}`, `학습 요소: ${row.learningElement}`, `시간: ${row.minutes}분`);
            for (const block of [...row.teacherActivity, ...row.studentActivity, ...row.notes, ...row.remarks]) {
                lines.push(`${block.label}: ${block.items.join(' / ')}`);
            }
        }

        lines.push('', '과정중심평가');
        for (const row of session.assessment.rows) {
            lines.push(`평가 요소: ${row.element}`, `평가 방법: ${row.method}`, `관찰 증거: ${row.evidence}`, `공통 피드백: ${row.feedback}`);
            for (const feedback of row.levelFeedback) lines.push(`${feedback.label} 피드백: ${feedback.text}`);
        }

        lines.push('', '개별화·지원 전략', ...session.supportStrategies, '', '수업 후 성찰', session.reflectionPrompt, '', session.connectionLabel, session.nextSessionConnection);
    }

    return lines.join('\n');
}
