import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJson } from './source-hash.js';

const VERSION = 1;
const TTL_MS = 5 * 60_000;
const MAX_FUTURE_SKEW_MS = 30_000;

function secret() {
    return process.env.GRADING_INTEGRITY_SECRET || '';
}

function digest(value) {
    return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function rosterSnapshot(students) {
    return [...students].map(({ id, grade, className, number, name }) => ({ id, grade, className, number, name }))
        .sort((left, right) => left.id.localeCompare(right.id));
}

function approvalLineage(submission) {
    return {
        id: submission.id,
        studentId: submission.studentId,
        sourceHash: submission.sourceHash,
        gradingRevision: submission.gradingRevision,
        gradingSourceHash: submission.grading?.sourceHash,
        originToken: submission.grading?.originToken,
        approvalToken: submission.grading?.approvalToken,
    };
}

function approvalSnapshot(submissions) {
    return [...submissions].map(approvalLineage).sort((left, right) => left.id.localeCompare(right.id));
}

function tokenFor(payload) {
    if (Buffer.byteLength(secret(), 'utf8') < 32) throw new Error('Record integrity secret is not configured.');
    return createHmac('sha256', secret()).update('record-context:v1\0').update(canonicalJson(payload)).digest('hex');
}

export function createRecordContext({ lessonPlan, assessment, students, submissions }, now = Date.now()) {
    const roster = rosterSnapshot(students);
    const approvalLineages = approvalSnapshot(submissions);
    const state = { lessonPlan, assessment, roster, approvalLineages };
    const payload = {
        version: VERSION,
        lessonDigest: digest(lessonPlan),
        assessmentDigest: digest(assessment),
        rosterDigest: digest(roster),
        rosterStudentIds: roster.map(student => student.id),
        approvalLineages,
        projectRevision: digest(state),
        issuedAt: now,
        expiresAt: now + TTL_MS,
    };
    return { payload, token: tokenFor(payload) };
}

export function verifyRecordContext(context, { lessonPlan, assessment, students }, now = Date.now()) {
    try {
        if (!context?.payload || !/^[a-f0-9]{64}$/.test(context?.token ?? '') || Buffer.byteLength(secret(), 'utf8') < 32) return false;
        const { payload } = context;
        if (payload.version !== VERSION || !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt)) return false;
        if (payload.issuedAt > now + MAX_FUTURE_SKEW_MS || payload.expiresAt <= now || payload.expiresAt - payload.issuedAt !== TTL_MS) return false;
        const expected = tokenFor(payload);
        if (!timingSafeEqual(Buffer.from(context.token, 'hex'), Buffer.from(expected, 'hex'))) return false;
        const roster = rosterSnapshot(students);
        const expectedState = { lessonPlan, assessment, roster, approvalLineages: payload.approvalLineages };
        return payload.lessonDigest === digest(lessonPlan)
            && payload.assessmentDigest === digest(assessment)
            && payload.rosterDigest === digest(roster)
            && canonicalJson(payload.rosterStudentIds) === canonicalJson(roster.map(student => student.id))
            && payload.projectRevision === digest(expectedState);
    } catch {
        return false;
    }
}

export function recordContextIncludesSubmission(context, submission) {
    return (context?.payload?.approvalLineages ?? [])
        .some(lineage => canonicalJson(lineage) === canonicalJson(approvalLineage(submission)));
}
