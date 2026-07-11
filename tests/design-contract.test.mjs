import { readFile } from 'node:fs/promises';
import { test, expect } from 'vitest';

test('uses local Paperlogy and approved green action token', async () => {
    const css = await readFile('app/globals.css', 'utf8');
    expect(css).toContain("font-family: 'Paperlogy'");
    expect(css).toContain('--color-action: #176f5b');
    expect(css).not.toMatch(/#6366f1|#8b5cf6|linear-gradient/i);
});
