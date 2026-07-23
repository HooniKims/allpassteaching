import { expect, test } from 'vitest';
import {
    DEFAULT_RECORD_TARGET_BYTES,
    MAX_RECORD_TARGET_BYTES,
    MIN_RECORD_TARGET_BYTES,
    normalizeRecordTargetBytes,
    recordUtf8ByteLength,
} from '@/lib/record-length';

test('measures Korean subject record text by UTF-8 bytes', () => {
    expect(recordUtf8ByteLength('가나다')).toBe(9);
    expect(recordUtf8ByteLength('가 A')).toBe(5);
});

test('normalizes teacher-selected record byte limits without changing the 1000byte default', () => {
    expect(DEFAULT_RECORD_TARGET_BYTES).toBe(1000);
    expect(normalizeRecordTargetBytes('850')).toBe(850);
    expect(normalizeRecordTargetBytes('')).toBe(DEFAULT_RECORD_TARGET_BYTES);
    expect(normalizeRecordTargetBytes(1)).toBe(MIN_RECORD_TARGET_BYTES);
    expect(normalizeRecordTargetBytes(99999)).toBe(MAX_RECORD_TARGET_BYTES);
});
