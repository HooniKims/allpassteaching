import { buildDocumentModel } from '@/lib/export/document-model.js';

function overviewText(value) {
    if (!Array.isArray(value)) return String(value ?? '');
    return value.map(item => typeof item === 'string' ? item : `[${item.code}] ${item.text}`).join(' / ');
}

export function lessonPlanClipboardText(plan) {
    const document = buildDocumentModel(plan);
    const lines = [document.title, `지도안 제목: ${plan.title ?? ''}`];

    for (const session of document.sessions) {
        lines.push('', `${session.order}차시: ${session.title}`, '수업 개요');
        for (const row of session.overview.rows) lines.push(`${row.label}: ${overviewText(row.value)}`);

        lines.push('', '교수·학습 과정');
        for (const row of session.process.rows) {
            lines.push(`단계: ${row.phase}`, `학습 요소: ${row.learningElement}`, `시간: ${row.minutes}분`);
            for (const block of [...row.teacherActivity, ...row.studentActivity, ...row.notes]) {
                lines.push(`${block.label}: ${block.items.join(' / ')}`);
            }
        }

        lines.push('', '과정중심평가');
        for (const row of session.assessment.rows) {
            lines.push(`평가 요소: ${row.element}`, `평가 방법: ${row.method}`, `관찰 증거: ${row.evidence}`, `공통 피드백: ${row.feedback}`);
            for (const feedback of row.levelFeedback) lines.push(`${feedback.label} 피드백: ${feedback.text}`);
        }

        lines.push('', '개별화·지원 전략', ...session.supportStrategies, '', '수업 후 성찰', session.reflectionPrompt, '', '다음 학습 연결', session.nextSessionConnection);
    }

    return lines.join('\n');
}
