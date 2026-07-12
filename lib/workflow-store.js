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

export const WORKFLOW_VERSION = 3;
export const WORKFLOW_KEY = 'allpass.teaching-workflow';

const processIds = new Set(['lesson', 'worksheet', 'assessment', 'grading', 'records']);
const readableVersions = new Set([0, 1, 2, WORKFLOW_VERSION]);

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

function plainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function migrateFixedRubricAssessment(assessment) {
    const criteria = assessment?.rubric?.criteria;
    if (!Array.isArray(criteria) || !criteria.some(item => plainObject(item?.levels))) return { assessment, changed: false };
    const levelIds = Array.isArray(assessment.rubric.levels)
        ? assessment.rubric.levels.map(level => level?.id).filter(id => typeof id === 'string')
        : [];
    const migratedCriteria = criteria.map(criterion => {
        if (!plainObject(criterion?.levels)) return criterion;
        const ids = levelIds.length ? levelIds : Object.keys(criterion.levels).sort();
        const levels = ids
            .filter(levelId => typeof criterion.levels[levelId] === 'string')
            .map(levelId => ({ levelId, description: criterion.levels[levelId] }));
        return { ...criterion, levels };
    });
    return {
        changed: true,
        assessment: {
            ...assessment,
            approved: false,
            requiresAssessmentRegeneration: true,
            rubric: { ...assessment.rubric, criteria: migratedCriteria },
        },
    };
}

function migrateWorkflow(value, version) {
    const activeStageData = version === 0
        ? { ...value, activeProcess: value?.activeProcess ?? value?.activeStage }
        : value;
    if (version >= WORKFLOW_VERSION) return activeStageData;
    const { assessment, changed } = migrateFixedRubricAssessment(activeStageData?.assessment);
    if (!changed) return { ...activeStageData, assessment };
    return {
        ...activeStageData,
        assessment,
        submissions: Array.isArray(activeStageData?.submissions)
            ? activeStageData.submissions.map(submission => ({ ...submission, approved: false, approvalRevoked: true }))
            : [],
        records: Array.isArray(activeStageData?.records)
            ? activeStageData.records.map(record => ({ ...record, approved: false }))
            : [],
    };
}

function storedEnvelope(raw) {
    if (!raw) return null;
    try {
        const stored = JSON.parse(raw);
        return stored && readableVersions.has(stored.version) && plainObject(stored.data) ? stored : null;
    } catch {
        return null;
    }
}

function storageValue(storage) {
    try {
        return storage.getItem(WORKFLOW_KEY);
    } catch {
        return null;
    }
}

function writeCurrentWorkflow(data) {
    try {
        window.sessionStorage.setItem(WORKFLOW_KEY, JSON.stringify({ version: WORKFLOW_VERSION, savedAt: new Date().toISOString(), data }));
        return true;
    } catch {
        return false;
    }
}

function removeLegacyWorkflow() {
    try {
        window.localStorage.removeItem(WORKFLOW_KEY);
    } catch {
        // A current-tab copy already exists; keep using it when legacy cleanup is unavailable.
    }
}

export function saveWorkflow(value) {
    const data = sanitizeWorkflow(value);
    const saved = writeCurrentWorkflow(data);
    if (saved) removeLegacyWorkflow();
    return saved;
}

export function loadWorkflow() {
    const stored = storedEnvelope(storageValue(window.sessionStorage))
        ?? storedEnvelope(storageValue(window.localStorage));
    if (!stored) return null;
    const sanitized = sanitizeWorkflow(migrateWorkflow(stored.data, stored.version));
    if (writeCurrentWorkflow(sanitized)) removeLegacyWorkflow();
    return sanitized;
}
