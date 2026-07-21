export function subjectAreaFromCode(code) {
    if (/^9사\(지리\)/.test(code)) return '지리';
    if (/^9사\(일사\)/.test(code)) return '일반사회';
    if (/^9역/.test(code)) return '역사';
    return undefined;
}

export function subjectAreasForSelection({ schoolLevel, subject }) {
    if (schoolLevel !== 'middle') return [];
    if (subject === '사회') return ['지리', '일반사회'];
    if (subject === '역사') return ['역사'];
    return [];
}
