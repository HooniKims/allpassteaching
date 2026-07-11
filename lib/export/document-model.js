import { normalizeLessonPlan } from '../lesson-plan-normalize.js';

const freezeColumns = columns => Object.freeze(columns.map(column => Object.freeze(column)));

export const PROCESS_COLUMNS = freezeColumns([
    { key: 'phase', label: '단계' },
    { key: 'learningElement', label: '학습 요소' },
    { key: 'teacherActivity', label: '교사 활동' },
    { key: 'studentActivity', label: '학생 활동' },
    { key: 'minutes', label: '시간' },
    { key: 'notes', label: '자료·유의점' },
]);

export const ASSESSMENT_COLUMNS = freezeColumns([
    { key: 'element', label: '평가 요소' },
    { key: 'method', label: '평가 방법' },
    { key: 'evidence', label: '관찰 증거' },
    { key: 'levelFeedback', label: '수준별 피드백' },
]);

const schoolLevelLabels = {
    elementary: '초등학교',
    middle: '중학교',
    high: '고등학교',
};

function buildOverview(plan, session) {
    return {
        rows: [
            { key: 'date', label: '일시', value: plan.metadata.date },
            { key: 'place', label: '장소', value: plan.metadata.place },
            { key: 'className', label: '대상 학급', value: plan.metadata.className },
            { key: 'teacherName', label: '수업자', value: plan.metadata.teacherName },
            { key: 'schoolGrade', label: '학교급·학년', value: `${schoolLevelLabels[plan.schoolLevel]} ${plan.grade}학년` },
            { key: 'subject', label: '과목', value: plan.subject },
            { key: 'unitTitle', label: '단원/주제', value: plan.unitTitle },
            { key: 'lessonTitle', label: '수업 제목', value: plan.title },
            { key: 'session', label: '차시', value: `${session.order}/${plan.sessions.length}` },
            { key: 'instructionModel', label: '수업 모형', value: plan.instructionModel.name },
            { key: 'standards', label: '성취기준', value: plan.standards.map(({ code, text }) => ({ code, text })) },
            { key: 'learningGoals', label: '학습 목표', value: [...plan.learningGoals] },
            { key: 'essentialQuestion', label: '핵심 질문', value: plan.essentialQuestion },
            { key: 'materials', label: '준비물', value: [...plan.materials] },
        ],
    };
}

function buildProcessRow(stage) {
    return {
        phase: stage.phase,
        learningElement: stage.learningElement,
        teacherActivity: [
            { key: 'teacherActivities', label: '교사 활동', items: [...stage.teacherActivities] },
            { key: 'teacherQuestions', label: '주요 발문', items: [...stage.teacherQuestions] },
        ],
        studentActivity: [
            { key: 'studentActivities', label: '학생 활동', items: [...stage.studentActivities] },
            { key: 'expectedStudentResponses', label: '예상 학생 반응', items: [...stage.expectedStudentResponses] },
        ],
        minutes: stage.minutes,
        notes: [
            { key: 'materialsAndNotes', label: '자료·유의점', items: [...stage.materialsAndNotes] },
            { key: 'supportNotes', label: '지원', items: [...stage.supportNotes] },
        ],
    };
}

function buildAssessmentRow(item) {
    return {
        element: item.element,
        method: item.method,
        evidence: item.evidence,
        feedback: item.feedback,
        levelFeedback: [
            { key: 'needsSupport', label: '도움 필요', text: item.levelFeedback.needsSupport },
            { key: 'meets', label: '기준 도달', text: item.levelFeedback.meets },
            { key: 'exceeds', label: '기준 초과', text: item.levelFeedback.exceeds },
        ],
    };
}

export function buildDocumentModel(input) {
    const plan = normalizeLessonPlan(input);
    const documentTitle = '교수·학습 과정안';
    return {
        documentTitle,
        title: documentTitle,
        lessonTitle: plan.title,
        sessions: plan.sessions.map((session, index) => ({
            id: session.id,
            pageBreakBefore: index > 0,
            metadata: { ...plan.metadata },
            order: session.order,
            title: session.title,
            sessionMinutes: session.sessionMinutes,
            overview: buildOverview(plan, session),
            process: {
                columns: PROCESS_COLUMNS.map(column => ({ ...column })),
                rows: session.stages.map(buildProcessRow),
            },
            assessment: {
                columns: ASSESSMENT_COLUMNS.map(column => ({ ...column })),
                rows: plan.assessment.map(buildAssessmentRow),
            },
            supportStrategies: [...plan.supportStrategies],
            reflectionPrompt: plan.reflectionPrompt,
            connectionLabel: index === plan.sessions.length - 1 ? '후속 학습 및 정리' : '다음 차시 연결',
            nextSessionConnection: session.nextSessionConnection,
        })),
    };
}

export function lessonPlanLines(input) {
    const plan = normalizeLessonPlan(input);
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
