const UNSAFE_FILENAME_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069<>:"/\\|?*]/g;
const MAX_TITLE_LENGTH = 120;

function safePart(value) {
    return String(value ?? '').toWellFormed()
        .replace(UNSAFE_FILENAME_CHARACTERS, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '')
        .slice(0, MAX_TITLE_LENGTH)
        .replace(/[. ]+$/g, '');
}

export function downloadFilename(title, suffix, format) {
    const safeTitle = safePart(title) || 'allpass-document';
    const safeSuffix = safePart(suffix);
    const safeFormat = String(format ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'file';
    return `${safeTitle}${safeSuffix ? `-${safeSuffix}` : ''}.${safeFormat}`;
}
