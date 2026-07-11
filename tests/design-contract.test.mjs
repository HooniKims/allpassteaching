import { readFile } from 'node:fs/promises';
import { test, expect } from 'vitest';

test('uses local Paperlogy and approved green action token', async () => {
    const css = await readFile('app/globals.css', 'utf8');
    expect(css).toContain("font-family: 'Paperlogy'");
    expect(css).toContain('--color-action: #176f5b');
    expect(css).not.toMatch(/#6366f1|#8b5cf6|linear-gradient/i);
});

test('change log records KST time and categorized requests', async () => {
    const log = await readFile('docs/change-log/2026/07/2026-07-11.md', 'utf8');
    expect(log).toMatch(/## \d{2}:\d{2} KST · 화면·사용성/);
    expect(log).toContain('직접 입력 과목');
    expect(log).toContain('HWPX');
    expect(log).toContain('상태:');
    expect(log).toContain('검증:');
});
