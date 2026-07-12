import { evidenceCoordinatesUsable } from './evidence-coordinates.js';
import { canonicalJson, sourceHash } from './source-hash.js';

const SAFE_TEXT_CATEGORIES = new Set(['text', 'paragraph', 'heading', 'list']);

export const GLOBAL_GRADING_RISKS = Object.freeze({
    elementsTruncated: '__elements_truncated__',
    autoScoreDisabled: '__auto_score_disabled__',
    visualAnalysisUnavailable: '__visual_analysis_unavailable__',
    visualReviewRequired: '__visual_review_required__',
});

export function gradingEvidenceRiskIds(provenance = {}, elements = []) {
    const ids = [];
    if (provenance.elementsTruncated === true) ids.push(GLOBAL_GRADING_RISKS.elementsTruncated);
    if (provenance.autoScoreAllowed === false) ids.push(GLOBAL_GRADING_RISKS.autoScoreDisabled);
    if (['enhanced_unavailable', 'enhanced_failed'].includes(provenance.visualAnalysisStatus)) ids.push(GLOBAL_GRADING_RISKS.visualAnalysisUnavailable);
    if (provenance.requiresVisualReview === true) ids.push(GLOBAL_GRADING_RISKS.visualReviewRequired);
    for (const element of elements) if (ocrElementNeedsTeacherReview(element)) ids.push(element.id);
    return [...new Set(ids)];
}

export function ocrElementNeedsTeacherReview(element) {
    return !SAFE_TEXT_CATEGORIES.has(element?.category)
        || (Number.isFinite(element?.confidence) && element.confidence < 0.85)
        || !evidenceCoordinatesUsable(element?.coordinates);
}

export function canonicalGradingElement(element) {
    return {
        id: String(element?.id ?? '').trim(),
        text: String(element?.text ?? '').trim(),
        category: String(element?.category ?? '').trim(),
        page: element?.page,
        coordinates: (element?.coordinates ?? []).map(point => ({ x: point.x, y: point.y })),
        confidence: Number.isFinite(element?.confidence) ? element.confidence : null,
        teacherReviewRequired: ocrElementNeedsTeacherReview(element),
    };
}

export function gradingElementHash(element) {
    return sourceHash(canonicalGradingElement(element));
}

export function canonicalGradingSourceRef(element) {
    const canonical = canonicalGradingElement(element);
    return {
        elementId: canonical.id,
        elementHash: gradingElementHash(canonical),
        page: canonical.page,
        text: canonical.text,
        category: canonical.category,
        coordinates: canonical.coordinates,
        confidence: canonical.confidence,
        teacherReviewRequired: canonical.teacherReviewRequired,
    };
}

export function gradingSourceRefMatchesElement(sourceRef, element) {
    if (!element) return false;
    const canonical = canonicalGradingSourceRef(element);
    return sourceRef.elementId === canonical.elementId
        && sourceRef.elementHash === canonical.elementHash
        && sourceRef.page === canonical.page
        && sourceRef.text === canonical.text
        && sourceRef.category === canonical.category
        && JSON.stringify(sourceRef.coordinates) === JSON.stringify(canonical.coordinates)
        && sourceRef.confidence === canonical.confidence
        && sourceRef.teacherReviewRequired === canonical.teacherReviewRequired;
}

export function gradingEvidenceMatchesElements(evidence, elements = []) {
    const expected = String(evidence ?? '').trim();
    return expected.length > 0 && elements.length > 0 && elements.every(element => {
        const actual = String(element?.text ?? '').trim();
        return actual.length > 0 && (actual.includes(expected) || expected.includes(actual));
    });
}

export function canonicalGradingProvenance(value = {}) {
    return {
        submissionId: String(value.submissionId ?? value.id ?? '').trim(),
        studentId: value.studentId == null ? null : String(value.studentId).trim(),
        studentName: String(value.studentName ?? '').trim(),
        originalRevision: Number.isInteger(value.originalRevision) ? value.originalRevision : 0,
        elementsTruncated: value.elementsTruncated === true,
        visualAnalysisStatus: value.visualAnalysisStatus ?? 'not_requested',
        autoScoreAllowed: value.autoScoreAllowed !== false,
        requiresVisualReview: value.requiresVisualReview === true,
    };
}

export function gradingEvidenceLineage(elements = [], criteria = [], provenance = {}) {
    const normalizedElements = elements.map(canonicalGradingElement).sort((left, right) => `${left.page}:${left.id}`.localeCompare(`${right.page}:${right.id}`));
    const decisions = criteria.map(criterion => ({
        criterionId: criterion.criterionId,
        reviewRequired: criterion.reviewRequired === true,
        sourceRefs: (criterion.sourceRefs ?? []).map(sourceRef => ({
            elementId: sourceRef.elementId,
            elementHash: sourceRef.elementHash ?? null,
            page: sourceRef.page,
            text: sourceRef.text ?? null,
            category: sourceRef.category ?? null,
            coordinates: sourceRef.coordinates ?? null,
            confidence: sourceRef.confidence ?? null,
            teacherReviewRequired: sourceRef.teacherReviewRequired ?? null,
        })),
    }));
    return { elements: normalizedElements, decisions, provenance: canonicalGradingProvenance(provenance) };
}

export function canonicalGradingOrigin(criterion) {
    return {
        criterionId: criterion.criterionId,
        reviewRequired: criterion.reviewRequired === true,
        status: criterion.status,
        selectedLevelId: criterion.selectedLevelId,
        score: criterion.score,
        evidence: criterion.evidence,
        confidence: criterion.confidence,
        sourceRefs: criterion.sourceRefs,
    };
}

export function gradingDecisionMatchesOrigin(criterion, origin) {
    return canonicalJson(canonicalGradingOrigin(criterion)) === canonicalJson(origin);
}

export function gradingOriginPayload(assessment, extractedText, elements, provenance, reviewOrigins) {
    return {
        assessment,
        extractedText,
        elements: elements.map(canonicalGradingElement).sort((left, right) => `${left.page}:${left.id}`.localeCompare(`${right.page}:${right.id}`)),
        provenance: canonicalGradingProvenance(provenance),
        reviewOrigins,
    };
}

export function gradingApprovalPayload(assessment, extractedText, elements, provenance, grading, review) {
    const { approvalToken: _approvalToken, ...unsignedGrading } = grading;
    return {
        assessment,
        extractedText,
        elements: elements.map(canonicalGradingElement).sort((left, right) => `${left.page}:${left.id}`.localeCompare(`${right.page}:${right.id}`)),
        provenance: canonicalGradingProvenance(provenance),
        grading: unsignedGrading,
        review: {
            originalAttached: review.originalAttached === true,
            originalReviewedAt: review.originalReviewedAt,
            reviewedOriginalRevision: review.reviewedOriginalRevision,
            confirmedElementIds: [...(review.confirmedElementIds ?? [])].sort(),
        },
    };
}
