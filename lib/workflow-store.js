export const WORKFLOW_VERSION = 2;
export const WORKFLOW_KEY = 'allpass.teaching-workflow';

const processIds = new Set(['lesson', 'worksheet', 'assessment', 'grading', 'records']);

export function createEmptyWorkflow() {
    return { activeProcess: 'lesson', lessonSnapshot: null, worksheet: null, assessment: null, submissions: [], records: [] };
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
    for (const key of ['id', 'studentName', 'fileName', 'status', 'extractedText', 'ocrModel', 'pageCount', 'grading', 'approved', 'sourceHash', 'error']) {
        if (value?.[key] !== undefined) safe[key] = jsonValue(value[key], value[key]);
    }
    return safe;
}

export function sanitizeWorkflow(value = {}) {
    const empty = createEmptyWorkflow();
    const activeProcess = processIds.has(value.activeProcess) ? value.activeProcess : empty.activeProcess;
    return {
        activeProcess,
        lessonSnapshot: jsonValue(value.lessonSnapshot),
        worksheet: jsonValue(value.worksheet),
        assessment: jsonValue(value.assessment),
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
        if (!stored || ![0, 1, WORKFLOW_VERSION].includes(stored.version)) return null;
        const data = stored.version === 0 ? { ...stored.data, activeProcess: stored.data?.activeProcess ?? stored.data?.activeStage } : stored.data;
        const sanitized = sanitizeWorkflow(data);
        window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: WORKFLOW_VERSION, savedAt: new Date().toISOString(), data: sanitized }));
        return sanitized;
    } catch {
        return null;
    }
}
