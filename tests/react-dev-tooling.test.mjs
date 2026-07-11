import { readFile } from 'node:fs/promises';
import { test, expect } from 'vitest';

test('loads React inspection tools only in development with an opt-out flag', async () => {
    const source = await readFile('app/layout.js', 'utf8');

    expect(source).toContain("process.env.NODE_ENV === 'development'");
    expect(source).toContain("process.env.NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS !== '1'");
    expect(source).toContain('react-grab/dist/index.global.js');
    expect(source).toContain('react-scan/dist/auto.global.js');
});
