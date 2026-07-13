function text(value) {
    if (typeof value !== 'string') return undefined;
    const candidate = value.trim();
    if (/^(blob|data):/i.test(candidate)) return undefined;
    return value;
}

function number(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boolean(value) {
    return typeof value === 'boolean' ? value : undefined;
}

function plainObject(value) {
    if (!value || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function object(fields) {
    return value => {
        if (!plainObject(value)) return undefined;
        const safe = {};
        for (const [key, sanitize] of Object.entries(fields)) {
            const sanitized = sanitize(value[key]);
            if (sanitized !== undefined) safe[key] = sanitized;
        }
        return safe;
    };
}

function array(item) {
    return value => Array.isArray(value) ? value.map(item).filter(entry => entry !== undefined) : undefined;
}

function nullable(item) {
    return value => value === null ? null : item(value);
}

const textArray = array(text);
const numberArray = array(number);
const standard = object({ code: text, text });
const metadata = object({ date: text, period: text, place: text, className: text, teacherName: text });
const instructionModel = object({ id: text, name: text, reason: text, stages: textArray });
const lessonBasics = object({
    schoolLevel: text, grade: text, subject: text, subjectMode: text, displaySubject: text, mappedSubjects: textArray,
    mode: text, sessions: number, sessionMinutes: number, intent: text, studentNeeds: text, metadata, error: text,
});
const generationSnapshot = object({ basics: lessonBasics, standards: array(standard), instructionModel: nullable(instructionModel) });
const lessonStage = object({
    phase: text, learningElement: text, teacherActivities: textArray, studentActivities: textArray,
    teacherQuestions: textArray, expectedStudentResponses: textArray, supportNotes: textArray,
    minutes: number, materialsAndNotes: textArray,
});
const lessonSession = object({
    id: text, order: number, title: text, sessionMinutes: number, nextSessionConnection: text, stages: array(lessonStage),
});
const levelFeedback = object({ needsSupport: text, meets: text, exceeds: text });
const lessonAssessment = object({ element: text, method: text, evidence: text, feedback: text, levelFeedback });
const lessonPlan = object({
    metadata, title: text, schoolLevel: text, grade: text, subject: text, unitTitle: text, essentialQuestion: text,
    standards: array(standard), learningGoals: textArray, materials: textArray, instructionModel,
    sessions: array(lessonSession), assessment: array(lessonAssessment), supportStrategies: textArray, reflectionPrompt: text,
});

export const sanitizeLessonSnapshot = object({
    step: number, maxReached: number, basics: lessonBasics, standards: array(standard), instructionModel,
    plan: lessonPlan, originalPlan: lessonPlan, generatedFrom: generationSnapshot,
});

const worksheetQuestion = object({
    id: text, type: text, prompt: text, standardCodes: textArray,
    choices: textArray, responseLines: number, responseAreaHeight: number,
});
const worksheetSection = object({ id: text, title: text, purpose: text, questions: array(worksheetQuestion) });
const worksheetAnswer = object({ questionId: text, answer: text });
const worksheetGenerationRequest = object({ additionalRequirements: text, questionTypes: textArray });
export const sanitizeWorksheet = object({
    title: text, formatId: text, formatName: text, selectionReason: text,
    standards: array(standard), generationRequest: worksheetGenerationRequest,
    document: object({ title: text, instructions: text, studentFields: textArray, sections: array(worksheetSection) }),
    teacherKey: object({ answers: array(worksheetAnswer) }), sourceHash: text,
});

const stages = object({ draft: boolean, checkpoint: boolean, revision: boolean, final: boolean });
const teacherIntent = object({ desiredResult: text, evidenceOfSuccess: text, growthProcess: text });
export const sanitizeAssessmentRequest = object({
    assessmentApproachId: text, assessmentName: text, teacherIntent, totalPoints: number, levelCount: number, includeProcessInScore: boolean,
    processWeightPercent: number, outputTypes: textArray, answerTypes: textArray, stages,
    visualAnalysisRequired: boolean, includeStudentCover: boolean, additionalRequirements: text,
});

const evidenceMap = object({
    standardCode: text, taskEvidenceTypes: textArray, criterionIds: textArray, evidenceTypes: textArray, scoreBasis: text,
});
const checkpoint = object({ id: text, phase: text, title: text, evidence: text, feedbackPurpose: text, order: number });
const supportPlan = object({ id: text, order: number, title: text, purpose: text, teacherAction: text, studentEvidence: text });
const alignmentIssue = object({ id: text, severity: text, code: text, message: text, repairAction: text, resolved: boolean });
const backwardDesign = object({
    teacherIntent, transferGoal: text, enduringUnderstanding: text, essentialQuestions: textArray,
    knowledge: textArray, skills: textArray, evidenceMap: array(evidenceMap), checkpoints: array(checkpoint),
    supportPlan: array(supportPlan), alignmentIssues: array(alignmentIssue),
});
const assessmentTask = object({
    title: text, standards: array(standard), situation: text, role: text, audience: text, product: text,
    procedure: textArray, conditions: textArray, materials: textArray, cautions: textArray,
});
const coverSection = object({ id: text, type: text, label: text, content: text, visible: boolean, order: number });
const criterionLevel = object({ levelId: text, score: number, description: text });
const criterion = object({
    id: text, name: text, description: text, standardCodes: textArray, kind: text,
    maxPoints: number, intervalPoints: number, evidence: text, levels: array(criterionLevel),
});
const rubric = object({ levels: array(object({ id: text, label: text })), criteria: array(criterion) });
const scoring = object({ includeProcessInScore: boolean, processWeightPercent: number, processTargetPoints: number });
const generationSettings = object({ outputTypes: textArray, answerTypes: textArray, stages, additionalRequirements: text, assessmentApproachId: text });
export const sanitizeAssessment = object({
    title: text, assessmentName: text, subject: text, backwardDesign, task: assessmentTask,
    cover: object({ title: text, sections: array(coverSection) }), rubric, scoring, totalPoints: number,
    visualAnalysisRequired: boolean, includeStudentCover: boolean, generationSettings,
    sourceHash: text, approved: boolean, requiresAssessmentRegeneration: boolean,
});

const coordinate = object({ x: number, y: number });
const documentElement = object({
    id: text, category: text, page: number, text, coordinates: array(coordinate), confidence: number,
});
const sourceRef = object({ elementId: text, elementHash: text, page: number, text, category: text, coordinates: array(coordinate), confidence: nullable(number), teacherReviewRequired: boolean });
const reviewOrigin = object({ criterionId: text, reviewRequired: boolean, status: text, selectedLevelId: nullable(text), score: nullable(number), evidence: text, confidence: number, sourceRefs: array(sourceRef) });
const gradingCriterion = object({
    criterionId: text, decisionSource: text, selectedLevelId: nullable(text), score: nullable(number), evidence: text, reason: text,
    feedback: text, confidence: number, sourceRefs: array(sourceRef), teacherConfirmed: boolean,
    status: text, reviewReason: text, reviewRequired: boolean,
    revisionEvidence: object({ checkpointId: text, beforeEvidence: text, beforeSourceRef: sourceRef, afterEvidence: text, afterSourceRef: sourceRef, changeReason: text, teacherConfirmed: boolean }),
});
const grading = object({
    criteria: array(gradingCriterion), totalScore: nullable(number), provisionalTotal: number,
    summary: text, nextSteps: text, sourceHash: text, reviewOrigins: array(reviewOrigin), originToken: text, approvalToken: text,
});
const submission = object({
    id: text, studentName: text, studentId: nullable(text), needsStudentLink: boolean, fileName: text,
    packetPages: numberArray, answerPages: numberArray, coverPages: numberArray,
    status: text, extractedText: text, elements: array(documentElement), elementsTruncated: boolean,
    ocrModel: text, ocrMode: text, pageCount: number, requiresVisualReview: boolean, visualAnalysisStatus: text, autoScoreAllowed: boolean,
    originalAttached: boolean, originalReviewedAt: nullable(text), originalRevision: number, gradingRevision: number, reviewedOriginalRevision: nullable(number), confirmedElementIds: textArray,
    grading: nullable(grading), approved: boolean, approvalRevoked: boolean, sourceHash: text, error: text,
});

export function sanitizeSubmission(value) {
    const safe = submission(value);
    if (!safe) return undefined;
    if (!safe.studentId) safe.studentId = null;
    safe.needsStudentLink = safe.studentId == null;
    if (!Number.isInteger(safe.gradingRevision) || safe.gradingRevision < 0) safe.gradingRevision = 0;
    return safe;
}

export function sanitizeStudent(value) {
    if (!plainObject(value)) return undefined;
    const id = text(value.id);
    if (!id) return undefined;
    const grade = text(typeof value.grade === 'number' ? String(value.grade) : value.grade ?? '') ?? '';
    const className = text(typeof value.className === 'number' ? String(value.className) : value.className ?? '') ?? '';
    const name = text(value.name ?? '') ?? '';
    const numberValue = ['number', 'string'].includes(typeof value.number) ? Number(value.number) : Number.NaN;
    return {
        id,
        grade: grade.trim(),
        className: className.trim(),
        number: Number.isFinite(numberValue) ? numberValue : null,
        name: name.trim(),
    };
}

const recordClaim = object({
    text, kind: text, criterionIds: textArray,
    evidenceQuotes: array(object({ criterionId: text, stage: text, quote: text })),
    sourceRefs: array(object({ criterionId: text, elementId: text, page: number })),
});
const record = object({
    submissionId: text, studentId: nullable(text), studentName: text, sourceHash: text,
    status: text, regenerationStatus: text, text, previousText: text, candidateText: text,
    claims: array(recordClaim), evidenceCriterionIds: textArray,
    candidateClaims: array(recordClaim), candidateEvidenceCriterionIds: textArray,
    candidateSourceHash: text, candidateTargetLength: number, candidateInvalidCode: text, candidateInvalidMessage: text, error: text, approved: boolean,
});

export function sanitizeRecord(value) {
    const safe = record(value);
    if (!safe) return undefined;
    if (safe.status === 'generating') {
        safe.status = 'error';
        safe.error = '이전 생성 작업이 중단되었습니다. 다시 시도해주세요.';
    }
    if (safe.regenerationStatus === 'generating') {
        safe.status = 'done';
        safe.regenerationStatus = 'error';
        safe.error = '이전 재생성 작업이 중단되었습니다. 다시 시도해주세요.';
    }
    if (!safe.candidateText) {
        delete safe.previousText;
        delete safe.candidateText;
        delete safe.candidateSourceHash;
        delete safe.candidateTargetLength;
        delete safe.candidateClaims;
        delete safe.candidateEvidenceCriterionIds;
        delete safe.candidateInvalidCode;
        delete safe.candidateInvalidMessage;
    }
    return safe;
}
