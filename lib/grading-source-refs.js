function searchable(value) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR') : '';
}

function sourceReference(element) {
    return { elementId: element.id, page: element.page, text: element.text, coordinates: normalizeEvidenceCoordinates(element.coordinates) };
}

export function linkGradingSources(grading, elements = []) {
    const candidates = elements.filter(element => element?.id && Number.isInteger(element.page) && element.page >= 1 && searchable(element.text).length >= 2);
    return {
        ...grading,
        criteria: grading.criteria.map(criterion => {
            const evidence = searchable(criterion.evidence);
            const matches = evidence ? candidates.filter(element => {
                const text = searchable(element.text);
                return evidence.includes(text) || text.includes(evidence);
            }).slice(0, 3) : [];
            return { ...criterion, sourceRefs: matches.map(sourceReference) };
        }),
    };
}
import { normalizeEvidenceCoordinates } from './evidence-coordinates.js';
