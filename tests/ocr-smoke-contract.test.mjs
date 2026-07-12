import { expect, test } from 'vitest';
import { smokeContractsPassed, summarizeSmokeResult } from '@/lib/upstage/smoke-contract';

const sentinel = 'SYNTHETIC SCIENCE EVIDENCE';
const result = overrides => ({
    extractedText: `${sentinel}\nEquation: x^2 = 4`,
    elements: [{ category: 'equation', coordinates: [{ x: .1, y: .1 }, { x: .2, y: .2 }] }],
    ocrModel: 'document-parse', ocrMode: 'standard', visualAnalysisStatus: 'not_requested',
    pageCount: 1, elementsTruncated: false, requiresVisualReview: true, reviewState: 'teacher_review',
    ...overrides,
});

test('accepts Standard and a genuinely used Enhanced contract', () => {
    const standard = summarizeSmokeResult(result({}), { elapsedMs: 10, sentinel });
    const enhanced = summarizeSmokeResult(result({ ocrModel: 'configured-enhanced', ocrMode: 'enhanced', visualAnalysisStatus: 'enhanced_used' }), { elapsedMs: 20, sentinel });

    expect(smokeContractsPassed({ standard, enhancedConfigured: true, enhanced })).toBe(true);
});

test('rejects an Enhanced failure that fell back to Standard reference output', () => {
    const standard = summarizeSmokeResult(result({}), { elapsedMs: 10, sentinel });
    const enhanced = summarizeSmokeResult(result({ ocrMode: 'standard_reference', visualAnalysisStatus: 'enhanced_failed' }), { elapsedMs: 20, sentinel });

    expect(smokeContractsPassed({ standard, enhancedConfigured: true, enhanced })).toBe(false);
});

test('rejects a Standard result that is not held for equation review', () => {
    const standard = summarizeSmokeResult(result({ reviewState: 'ready_for_rubric_review', requiresVisualReview: false }), { elapsedMs: 10, sentinel });

    expect(smokeContractsPassed({ standard, enhancedConfigured: false, enhanced: { status: 'not_configured' } })).toBe(false);
});
