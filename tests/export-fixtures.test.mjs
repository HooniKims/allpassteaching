import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';

const execFileAsync = promisify(execFile);

test('creates two-session HWPX, DOCX, and PDF export fixtures', async () => {
    // Given an isolated fixture output directory
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'allpass-export-fixtures-'));

    // When the fixture creation script runs through every real exporter
    await execFileAsync(process.execPath, ['scripts/create-export-fixtures.mjs', '--output', outputDirectory], { cwd: process.cwd() });

    // Then all three standard lesson-plan artifacts have their expected package signatures
    const [hwpx, docx, pdf] = await Promise.all(['hwpx', 'docx', 'pdf'].map(extension => readFile(path.join(outputDirectory, `standard-lesson-plan.${extension}`))));
    expect(hwpx.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(docx.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
});
