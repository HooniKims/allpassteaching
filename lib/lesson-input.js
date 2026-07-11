export const emptyLessonMetadata = Object.freeze({
    date: '',
    period: '',
    place: '',
    className: '',
    teacherName: '',
});

export function normalizeLessonMetadata(value = {}) {
    const date = String(value.date ?? '').split('T')[0];
    return {
        ...emptyLessonMetadata,
        ...value,
        date,
        period: String(value.period ?? ''),
    };
}

export function formatLessonTiming(value = {}) {
    const metadata = normalizeLessonMetadata(value);
    const [year, month, day] = metadata.date.split('-').map(Number);
    const date = year && month && day ? `${year}. ${month}. ${day}.` : metadata.date;
    const period = metadata.period ? `${metadata.period}교시` : '';
    return [date, period].filter(Boolean).join(' / ');
}

function sortedStandards(standards = []) {
    return standards
        .map(({ code, text }) => ({ code, text }))
        .sort((a, b) => a.code.localeCompare(b.code, 'ko') || a.text.localeCompare(b.text, 'ko'));
}

export function createGenerationSnapshot(draft = {}) {
    const basics = draft.basics ?? {};
    return {
        basics: {
            schoolLevel: basics.schoolLevel ?? '',
            grade: basics.grade ?? '',
            subject: basics.subject ?? '',
            subjectMode: basics.subjectMode ?? 'official',
            displaySubject: basics.displaySubject ?? basics.subject ?? '',
            mappedSubjects: [...(basics.mappedSubjects?.length ? basics.mappedSubjects : basics.subject ? [basics.subject] : [])].sort((a, b) => a.localeCompare(b, 'ko')),
            mode: basics.mode ?? 'single',
            sessions: basics.sessions ?? 1,
            sessionMinutes: basics.sessionMinutes ?? (basics.schoolLevel ? basics.schoolLevel === 'elementary' ? 40 : 45 : undefined),
            intent: basics.intent ?? '',
            studentNeeds: basics.studentNeeds ?? '',
            metadata: normalizeLessonMetadata(basics.metadata),
        },
        standards: sortedStandards(draft.standards),
        instructionModel: draft.instructionModel ? {
            id: draft.instructionModel.id,
            name: draft.instructionModel.name,
            stages: [...(draft.instructionModel.stages ?? [])],
        } : null,
    };
}

export function hasGenerationInputChanged(draft, generatedFrom) {
    if (!generatedFrom) return false;
    return JSON.stringify(createGenerationSnapshot(draft)) !== JSON.stringify(createGenerationSnapshot(generatedFrom));
}
