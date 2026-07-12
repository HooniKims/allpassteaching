import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

test('OCR smoke script reports metrics without printing the key or extracted text', async () => {
    const [source, packageJson] = await Promise.all([readFile('scripts/check-upstage-ocr.mjs', 'utf8'), readFile('package.json', 'utf8').then(JSON.parse)]);

    expect(packageJson.scripts['check:upstage-ocr']).toContain('--env-file=.env');
    expect(source).toContain('result.ocrModel');
    expect(source).toContain('sentinelMatched');
    expect(source).toContain('categoryCounts');
    expect(source).toContain('requiresVisualReview');
    expect(source).toContain('PDFDocument.create()');
    expect(source).toContain('SYNTHETIC SCIENCE EVIDENCE');
    expect(source).not.toContain('console.log(result.extractedText)');
    expect(source).not.toContain('UPSTAGE_API_KEY)');
    expect(source).not.toContain('studentName');
});
