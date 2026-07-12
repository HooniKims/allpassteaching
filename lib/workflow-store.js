import { createDefaultAssessmentRequest } from './assessment-request.js';
import {
    sanitizeAssessment,
    sanitizeAssessmentRequest,
    sanitizeLessonSnapshot,
    sanitizeRecord,
    sanitizeStudent,
    sanitizeSubmission,
    sanitizeWorksheet,
} from './workflow-storage-allowlist.js';

export const WORKFLOW_VERSION = 2;
export const WORKFLOW_KEY = 'allpass.teaching-workflow';

const processIds = new Set(['lesson', 'worksheet', 'assessment', 'grading', 'records']);

export function createEmptyWorkflow() {
    return { activeProcess: 'lesson', lessonSnapshot: null, worksheet: null, assessmentRequest: createDefaultAssessmentRequest(), assessment: null, students: [], submissions: [], records: [] };
}

export function sanitizeWorkflow(value = {}) {
    const empty = createEmptyWorkflow();
    const activeProcess = processIds.has(value.activeProcess) ? value.activeProcess : empty.activeProcess;
    return {
        activeProcess,
        lessonSnapshot: value.lessonSnapshot == null ? null : sanitizeLessonSnapshot(value.lessonSnapshot) ?? null,
        worksheet: value.worksheet == null ? null : sanitizeWorksheet(value.worksheet) ?? null,
        assessmentRequest: sanitizeAssessmentRequest(value.assessmentRequest) ?? empty.assessmentRequest,
        assessment: value.assessment == null ? null : sanitizeAssessment(value.assessment) ?? null,
        students: Array.isArray(value.students) ? value.students.map(sanitizeStudent).filter(Boolean).slice(0, 50) : [],
        submissions: Array.isArray(value.submissions) ? value.submissions.map(sanitizeSubmission).filter(Boolean) : [],
        records: Array.isArray(value.records) ? value.records.map(sanitizeRecord).filter(Boolean) : [],
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
        if (!stored || ![0, 1, WORKFLOW_VERSION].includes(stored.version)) return null;
        const data = stored.version === 0 ? { ...stored.data, activeProcess: stored.data?.activeProcess ?? stored.data?.activeStage } : stored.data;
        const sanitized = sanitizeWorkflow(data);
        window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: WORKFLOW_VERSION, savedAt: new Date().toISOString(), data: sanitized }));
        return sanitized;
    } catch {
        return null;
    }
}
