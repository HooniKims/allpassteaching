import { expect, test } from 'vitest';
import { downloadFilename } from '@/lib/download-filename';

test('replaces an isolated surrogate before assigning a browser download filename', () => {
    expect(downloadFilename('\uD800unsafe', '학생용', 'hwpx')).toBe('�unsafe-학생용.hwpx');
});

test('creates a readable filename while removing unsafe control, path, and bidi characters', () => {
    expect(downloadFilename('  빛/의\u0000\u202Efdp 수업:지도안  ', '학생용', 'PDF')).toBe('빛 의 fdp 수업 지도안-학생용.pdf');
});

test('uses a stable fallback and a safe extension for empty or invalid input', () => {
    expect(downloadFilename(' . ', '\u0000', '../HWPX')).toBe('allpass-document.hwpx');
});
