function tokenize(value) {
    return [...new Set(value.toLowerCase().split(/[^가-힣a-z0-9]+/).filter(token => token.length > 1))];
}

export function searchStandards(catalog, scope, limit = 30) {
    const tokens = tokenize(scope.query);
    const subjects = new Set(scope.subjects?.length ? scope.subjects : [scope.subject]);
    const subjectAreas = new Set(scope.subjectAreas ?? []);
    return catalog
        .filter(item => item.schoolLevel === scope.schoolLevel
            && item.gradeBand === scope.gradeBand
            && subjects.has(item.subject)
            && (!subjectAreas.size || subjectAreas.has(item.subjectArea)))
        .map(item => {
            const searchableText = `${item.code} ${item.subject} ${item.text}`.toLowerCase();
            return { ...item, lexicalScore: tokens.reduce((score, token) => score + (searchableText.includes(token) ? 1 : 0), 0) };
        })
        .sort((a, b) => b.lexicalScore - a.lexicalScore || a.code.localeCompare(b.code, 'ko'))
        .slice(0, limit);
}
