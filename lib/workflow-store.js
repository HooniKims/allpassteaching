import { createDefaultAssessmentRequest } from './assessment-request.js';

export const WORKFLOW_VERSION = 3;
export const WORKFLOW_KEY = 'allpass.teaching-workflow';

const processIds = new Set(['lesson', 'worksheet', 'assessment', 'grading', 'records']);

export function createEmptyWorkflow() {
    return { activeProcess: 'lesson', lessonSnapshot: null, worksheet: null, assessmentRequest: createDefaultAssessmentRequest(), assessment: null, students: [], submissions: [], records: [] };
}

function jsonValue(value, fallback = null) {
    try {
        return value == null ? fallback : structuredClone(value);
    } catch {
        return fallback;
    }
}

function sanitizeSubmission(value) {
    const safe = {};
    for (const key of ['id', 'studentName', 'studentId', 'needsStudentLink', 'fileName', 'status', 'extractedText', 'ocrModel', 'pageCount', 'grading', 'approved', 'sourceHash', 'error']) {
        if (value?.[key] !== undefined) safe[key] = jsonValue(value[key], value[key]);
    }
    if (typeof safe.studentId !== 'string' || !safe.studentId) safe.studentId = null;
    safe.needsStudentLink = safe.studentId == null;
    return safe;
}

function sanitizeStudent(value) {
    if (!value || typeof value.id !== 'string' || !value.id) return null;
    return {
        id: value.id,
        grade: String(value.grade ?? '').trim(),
        className: String(value.className ?? '').trim(),
        number: Number(value.number),
        name: String(value.name ?? '').trim(),
    };
}

export function sanitizeWorkflow(value = {}) {
    const empty = createEmptyWorkflow();
    const activeProcess = processIds.has(value.activeProcess) ? value.activeProcess : empty.activeProcess;
    return {
        activeProcess,
        lessonSnapshot: jsonValue(value.lessonSnapshot),
        worksheet: jsonValue(value.worksheet),
        assessmentRequest: jsonValue(value.assessmentRequest, empty.assessmentRequest),
        assessment: jsonValue(value.assessment),
        students: Array.isArray(value.students) ? value.students.map(sanitizeStudent).filter(Boolean).slice(0, 50) : [],
        submissions: Array.isArray(value.submissions) ? value.submissions.map(sanitizeSubmission) : [],
        records: Array.isArray(value.records) ? jsonValue(value.records, []) : [],
    };
}

export function saveWorkflow(value) {
    const data = sanitizeWorkflow(value);
    window.localStorage.removeItem(WORKFLOW_KEY);
    window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: WORKFLOW_VERSION, savedAt: new Date().toISOString(), data }));
}

export function loadWorkflow() {
    try {
        const legacy = window.localStorage.getItem(WORKFLOW_KEY);
        window.localStorage.removeItem(WORKFLOW_KEY);
        const stored = JSON.parse(window.sessionStorage.getItem(WORKFLOW_KEY) || legacy || 'null');
        if (!stored || ![0, 1, 2, WORKFLOW_VERSION].includes(stored.version)) return null;
        const data = stored.version === 0 ? { ...stored.data, activeProcess: stored.data?.activeProcess ?? stored.data?.activeStage } : stored.data;
        const sanitized = sanitizeWorkflow(data);
        window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: WORKFLOW_VERSION, savedAt: new Date().toISOString(), data: sanitized }));
        return sanitized;
    } catch {
        return null;
    }
}
