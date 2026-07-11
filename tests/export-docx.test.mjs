import JSZip from 'jszip';
import { test, expect } from 'vitest';
import { buildDocx } from '@/lib/export/docx';
import { makeGeneratedPlan } from './fixtures/lesson-plan.mjs';

test('builds a DOCX containing the title and standard', async () => {
    const zip = await JSZip.loadAsync(await buildDocx(makeGeneratedPlan()));
    const xml = await zip.file('word/document.xml').async('string');
    expect(xml).toContain('식물의 구조와 기능'); expect(xml).toContain('6과11-02');
});
