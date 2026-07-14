import { normalizeLessonPlan } from '../lesson-plan-normalize.js';
import { formatLessonTiming } from '../lesson-input.js';
import { instructionModelTypeLabel } from '../../data/instruction-models.js';

const freezeColumns = columns => Object.freeze(columns.map(column => Object.freeze(column)));

export const PROCESS_COLUMNS = freezeColumns([
    { key: 'phase', label: '단계' },
    { key: 'learningElement', label: '학습 요소' },
    { key: 'teacherActivity', label: '교사 활동' },
    { key: 'studentActivity', label: '학생 활동' },
    { key: 'minutes', label: '시간' },
    { key: 'notes', label: '자료·유의점' },
    { key: 'remarks', label: '비고' },
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
    const subjects = [...new Set(plan.standards.map(item => item.subject).filter(Boolean))];
    return {
        rows: [
            { key: 'date', label: '일시', value: formatLessonTiming(plan.metadata) },
            { key: 'place', label: '장소', value: plan.metadata.place },
            { key: 'className', label: '대상 학급', value: plan.metadata.className },
            { key: 'teacherName', label: '수업자', value: plan.metadata.teacherName },
            { key: 'schoolGrade', label: '학교급·학년', value: `${schoolLevelLabels[plan.schoolLevel]} ${plan.grade}학년` },
            { key: 'subject', label: '과목', value: subjects.length > 1 ? subjects.join(' · ') : plan.subject },
            { key: 'unitTitle', label: '단원/주제', value: plan.unitTitle },
            { key: 'lessonTitle', label: '수업 제목', value: plan.title },
            { key: 'session', label: '차시', value: `${session.order}/${plan.sessions.length}` },
            { key: 'instructionModel', label: instructionModelTypeLabel(plan.instructionModel), value: plan.instructionModel.name },
            { key: 'standards', label: '성취기준', value: plan.standards.map(({ code, text, subject }) => ({ code, text, subject })) },
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
        remarks: [
            { key: 'remarks', label: '비고', items: [...stage.remarks] },
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

export function buildDocumentModel(input, { variant = 'brief' } = {}) {
    const plan = normalizeLessonPlan(input);
    const documentTitle = '교수·학습 과정안';
    return {
        documentTitle,
        title: documentTitle,
        lessonTitle: plan.title,
        variant,
        detail: variant === 'detailed' ? {
            teacherIntent: plan.detailedPlan.teacherIntent,
            unitOverview: plan.detailedPlan.unitOverview,
            unitGoals: [...plan.detailedPlan.unitGoals],
            learnerAnalysis: plan.detailedPlan.learnerAnalysis,
            teachingStrategy: plan.detailedPlan.teachingStrategy,
            unitSequence: plan.detailedPlan.unitSequence.map(item => ({ ...item })),
            boardPlan: [...plan.detailedPlan.boardPlan],
            references: [...plan.detailedPlan.references],
        } : null,
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

export function lessonPlanLines(input, { variant = 'brief' } = {}) {
    const plan = normalizeLessonPlan(input);
    const lines = [plan.title, `${plan.grade}학년 ${plan.subject} · ${plan.instructionModel.name}`];
    if (variant === 'detailed') lines.push('', '수업자 의도 및 지도 중점', plan.detailedPlan.teacherIntent, '', '단원 개관', plan.detailedPlan.unitOverview, '', '단원 목표', ...plan.detailedPlan.unitGoals.map((item, index) => `${index + 1}. ${item}`), '', '학습자 분석 및 지도 대책', plan.detailedPlan.learnerAnalysis, '', '수업 모형·설계 틀 적용 전략', plan.detailedPlan.teachingStrategy, '', '단원 지도 계획', ...plan.detailedPlan.unitSequence.map(item => `${item.session} · ${item.topic} · ${item.learningGoal} · ${item.focus}`), '', '판서·화면 및 자료 활용 계획', ...plan.detailedPlan.boardPlan, '', '참고 자료', ...plan.detailedPlan.references);
    lines.push('', '성취기준', ...plan.standards.map(item => `${item.subject ? `[${item.subject}] ` : ''}[${item.code}] ${item.text}`), '', '학습 목표', ...plan.learningGoals.map((item, index) => `${index + 1}. ${item}`), '', `준비물: ${plan.materials.join(', ') || '없음'}`);
    for (const session of plan.sessions) {
        lines.push('', `${session.order}차시 · ${session.title} (${session.sessionMinutes}분)`);
        for (const stage of session.stages) {
            lines.push(`${stage.phase} (${stage.minutes}분)`, `교사 활동: ${stage.teacherActivities.join(' / ')}`, `학생 활동: ${stage.studentActivities.join(' / ')}`);
            if (stage.materialsAndNotes.length) lines.push(`자료 및 유의점: ${stage.materialsAndNotes.join(' / ')}`);
            if (stage.remarks.length) lines.push(`비고: ${stage.remarks.join(' / ')}`);
        }
    }
    lines.push('', '과정중심평가');
    for (const item of plan.assessment) lines.push(`${item.element} · ${item.evidence}`, `피드백: ${item.feedback}`);
    lines.push('', '개별화·지원 전략', ...plan.supportStrategies.map(item => `• ${item}`), '', '수업 후 성찰', plan.reflectionPrompt);
    return lines;
}
