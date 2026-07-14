export const emptyLessonMetadata = Object.freeze({
    date: '',
    period: '',
    place: '',
    className: '',
    teacherName: '',
});

export function normalizeLessonMetadata(value = {}) {
    const date = String(value.date ?? '').split('T')[0];
    const period = String(value.period ?? '').trim().replace(/\s*교시$/, '');
    return {
        ...emptyLessonMetadata,
        ...value,
        date,
        period,
    };
}

export function formatLessonTiming(value = {}) {
    const metadata = normalizeLessonMetadata(value);
    const [year, month, day] = metadata.date.split('-').map(Number);
    const date = year && month && day ? `${year}. ${month}. ${day}.` : metadata.date;
    const period = metadata.period ? `${metadata.period}교시` : '';
    return [date, period].filter(Boolean).join(' / ');
}

export function buildLessonPlanGenerationRequest(draft = {}) {
    const basics = draft.basics ?? {};
    const primarySubject = basics.displaySubject || basics.subject || '';
    const primaryStandards = (draft.standards ?? []).map(item => ({
        ...item,
        subject: primarySubject,
    }));
    const isIntegrated = draft.instructionModel?.id === 'integrated';
    const secondarySubject = isIntegrated ? draft.instructionModel.integrationSubject ?? '' : '';
    const secondaryStandards = isIntegrated
        ? (draft.instructionModel.integrationStandards ?? []).map(item => ({
            ...item,
            subject: secondarySubject,
        }))
        : [];

    return {
        basics: {
            ...basics,
            sessionMinutes: basics.sessionMinutes ?? (basics.schoolLevel === 'elementary' ? 40 : 45),
        },
        standards: [...primaryStandards, ...secondaryStandards],
        instructionModel: draft.instructionModel,
        ...(isIntegrated ? {
            integration: {
                primarySubject,
                secondarySubject,
                primaryStandards,
                secondaryStandards,
            },
        } : {}),
    };
}

function sortedStandards(standards = []) {
    return standards
        .map(({ code, text, subject = '' }) => ({ code, text, subject }))
        .sort((a, b) => a.subject.localeCompare(b.subject, 'ko') || a.code.localeCompare(b.code, 'ko') || a.text.localeCompare(b.text, 'ko'));
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
            integrationSubject: draft.instructionModel.integrationSubject ?? '',
            integrationStandards: sortedStandards(draft.instructionModel.integrationStandards),
        } : null,
    };
}

export function hasGenerationInputChanged(draft, generatedFrom) {
    if (!generatedFrom) return false;
    return JSON.stringify(createGenerationSnapshot(draft)) !== JSON.stringify(createGenerationSnapshot(generatedFrom));
}
