export const splitEditorLines = value => value.replace(/\r/g, '').split('\n');

export const normalizeEditorLines = value => splitEditorLines(value).filter(item => item.trim().length > 0);
