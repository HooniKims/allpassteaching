export function summarizeSmokeResult(result, { elapsedMs, sentinel }) {
    const categoryCounts = Object.fromEntries([...new Set(result.elements.map(element => element.category))]
        .sort()
        .map(category => [category, result.elements.filter(element => element.category === category).length]));
    const normalizedText = result.extractedText.replace(/\s+/g, '').replace(/²/g, '^2');
    const criticalSymbolsMatched = normalizedText.includes('x^2=4');
    const equationDecision = !criticalSymbolsMatched || result.reviewState === 'teacher_review'
        ? 'teacher_review'
        : 'eligible_for_teacher_rubric_review';
    return {
        status: result.extractedText.includes(sentinel) ? 'passed' : 'sentinel_missing',
        fixture: 'synthetic_non_student',
        ocrModel: result.ocrModel,
        ocrMode: result.ocrMode,
        visualAnalysisStatus: result.visualAnalysisStatus,
        elapsedMs,
        pageCount: result.pageCount,
        textLength: result.extractedText.length,
        elementCount: result.elements.length,
        categoryCounts,
        coordinateElementCount: result.elements.filter(element => element.coordinates.length > 0).length,
        confidenceElementCount: result.elements.filter(element => Number.isFinite(element.confidence)).length,
        elementsTruncated: result.elementsTruncated,
        requiresVisualReview: result.requiresVisualReview,
        reviewState: result.reviewState,
        sentinelMatched: result.extractedText.includes(sentinel),
        criticalSymbolsMatched,
        equationDecision,
    };
}

export function smokeContractsPassed({ standard, enhancedConfigured, enhanced }) {
    const standardPassed = standard.sentinelMatched && standard.ocrMode === 'standard'
        && standard.requiresVisualReview === true && standard.reviewState === 'teacher_review'
        && standard.equationDecision === 'teacher_review';
    const enhancedPassed = !enhancedConfigured || (enhanced.sentinelMatched && enhanced.ocrMode === 'enhanced'
        && enhanced.visualAnalysisStatus === 'enhanced_used' && enhanced.requiresVisualReview === true
        && enhanced.reviewState === 'teacher_review' && enhanced.equationDecision === 'teacher_review');
    return standardPassed && enhancedPassed;
}
