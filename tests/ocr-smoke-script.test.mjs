import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

test('OCR smoke script reports metrics without printing the key or extracted text', async () => {
    const [source, contractSource, packageJson] = await Promise.all([readFile('scripts/check-upstage-ocr.mjs', 'utf8'), readFile('lib/upstage/smoke-contract.js', 'utf8'), readFile('package.json', 'utf8').then(JSON.parse)]);

    expect(packageJson.scripts['check:upstage-ocr']).toContain('--env-file=.env');
    expect(contractSource).toContain('result.ocrModel');
    expect(contractSource).toContain('sentinelMatched');
    expect(contractSource).toContain('categoryCounts');
    expect(contractSource).toContain('requiresVisualReview');
    expect(contractSource).toContain("? 'teacher_review'");
    expect(contractSource).toContain('criticalSymbolsMatched');
    expect(source).toContain("status: 'not_configured'");
    expect(source).toContain('visualAnalysis: true');
    expect(source).toContain('smokeContractsPassed');
    expect(source).toContain('PDFDocument.create()');
    expect(source).toContain('SYNTHETIC SCIENCE EVIDENCE');
    expect(source + contractSource).not.toContain('console.log(result.extractedText)');
    expect(source + contractSource).not.toContain('UPSTAGE_API_KEY)');
    expect(source + contractSource).not.toContain('studentName');
});
