import JSZip from 'jszip';
import { test, expect } from 'vitest';
import { buildHwpx } from '@/lib/export/hwpx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

test('builds HWPX with required files and lesson text', async () => {
    const zip = await JSZip.loadAsync(await buildHwpx(makeGeneratedPlan()));
    expect(await zip.file('mimetype').async('string')).toBe('application/hwp+zip');
    expect(zip.file('Contents/header.xml')).toBeTruthy(); expect(zip.file('Contents/section0.xml')).toBeTruthy();
    expect(await zip.file('Contents/section0.xml').async('string')).toContain('식물의 구조와 기능');
});
