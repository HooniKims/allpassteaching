export const DEFAULT_RECORD_TARGET_BYTES = 1000;
export const MIN_RECORD_TARGET_BYTES = 300;
export const MAX_RECORD_TARGET_BYTES = 1500;
export const RECORD_TARGET_BYTE_PRESETS = Object.freeze([500, 700, DEFAULT_RECORD_TARGET_BYTES, MAX_RECORD_TARGET_BYTES]);

export function recordUtf8ByteLength(value) {
    return new TextEncoder().encode(String(value ?? '')).byteLength;
}

export function normalizeRecordTargetBytes(value) {
    if (String(value ?? '').trim() === '') return DEFAULT_RECORD_TARGET_BYTES;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return DEFAULT_RECORD_TARGET_BYTES;
    return Math.min(MAX_RECORD_TARGET_BYTES, Math.max(MIN_RECORD_TARGET_BYTES, Math.floor(parsed)));
}

export function recordTargetCharacterGuide(targetBytes) {
    return Math.floor(normalizeRecordTargetBytes(targetBytes) / 3);
}
