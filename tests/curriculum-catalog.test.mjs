import { readFile } from 'node:fs/promises';
import { test, expect } from 'vitest';

test('generated catalog contains unique, source-linked general-school standards', async () => {
    const catalog = JSON.parse(await readFile('data/curriculum.json', 'utf8'));
    const keys = catalog.map(item => `${item.subject}:${item.code}`);
    expect(catalog.length).toBeGreaterThan(1000);
    expect(new Set(keys).size).toBe(keys.length);
    expect(catalog.every(item => item.text && item.sourceFile && item.sourcePage > 0)).toBe(true);
    expect(Math.max(...catalog.map(item => item.text.length))).toBeLessThan(500);
    expect(catalog.every(item => ['elementary', 'middle', 'high'].includes(item.schoolLevel))).toBe(true);
    expect(catalog.some(item => item.subject.includes('전문'))).toBe(false);
});

test('build script reads the renamed curriculum source folder', async () => {
    const source = await readFile('scripts/build-curriculum.mjs', 'utf8');

    expect(source).toContain("const SOURCE_ROOT = '2022_Revised_National_Curriculum';");
    expect(source).not.toContain('복사본');
});
