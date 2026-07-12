import { createHmac, timingSafeEqual } from 'node:crypto';
import { gradingApprovalPayload, gradingOriginPayload } from './grading-evidence.js';
import { canonicalJson } from './source-hash.js';

function integritySecret() {
    return process.env.GRADING_INTEGRITY_SECRET || '';
}

export function gradingIntegrityAvailable() {
    return Buffer.byteLength(integritySecret(), 'utf8') >= 32;
}

export function createGradingOriginToken(assessment, extractedText, elements, provenance, reviewOrigins) {
    if (!gradingIntegrityAvailable()) throw new Error('Grading integrity secret is not configured.');
    return createHmac('sha256', integritySecret())
        .update('grading-origin:v1\0')
        .update(canonicalJson(gradingOriginPayload(assessment, extractedText, elements, provenance, reviewOrigins)))
        .digest('hex');
}

export function createGradingApprovalToken(assessment, extractedText, elements, provenance, grading, review) {
    if (!gradingIntegrityAvailable()) throw new Error('Grading integrity secret is not configured.');
    return createHmac('sha256', integritySecret())
        .update('grading-approval:v1\0')
        .update(canonicalJson(gradingApprovalPayload(assessment, extractedText, elements, provenance, grading, review)))
        .digest('hex');
}

export function verifyGradingApprovalToken(token, assessment, extractedText, elements, provenance, grading, review) {
    if (!gradingIntegrityAvailable() || !/^[a-f0-9]{64}$/.test(token ?? '')) return false;
    const expected = createGradingApprovalToken(assessment, extractedText, elements, provenance, grading, review);
    return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
}

export function verifyGradingOriginToken(token, assessment, extractedText, elements, provenance, reviewOrigins) {
    if (!gradingIntegrityAvailable() || !/^[a-f0-9]{64}$/.test(token ?? '')) return false;
    const expected = createGradingOriginToken(assessment, extractedText, elements, provenance, reviewOrigins);
    return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
}
