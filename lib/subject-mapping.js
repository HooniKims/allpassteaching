export function officialSubjects(catalog, schoolLevel) {
    return [...new Set(catalog
        .filter(item => item.schoolLevel === schoolLevel)
        .map(item => item.subject))]
        .sort((a, b) => a.localeCompare(b, 'ko'));
}

export function filterSubjectMappings(catalog, schoolLevel, mappings) {
    const allowed = new Set(officialSubjects(catalog, schoolLevel));
    return mappings.filter(item => allowed.has(item.subject)).slice(0, 3);
}
