import { expect, test } from 'vitest';
import {
    OPERATION_PHASES,
    advanceOperation,
    cancelOperation,
    createOperation,
    estimateOperationDuration,
    formatRemainingSeconds,
    getOperationTiming,
    recordOperationDuration,
} from '@/lib/operation-state';

test('publishes the approved fixed boundaries for estimated phases', () => {
    // Given
    const approvedGeneratingRange = [50, 80];

    // When
    const generatingRange = OPERATION_PHASES.generating;

    // Then
    expect(generatingRange).toEqual(approvedGeneratingRange);
});

test('reports actual batch counts when completed students include successes and failures', () => {
    // Given
    const operation = createOperation({
        id: 'ocr-class-1',
        kind: 'ocr',
        label: '학생 답안 분석',
        totalItems: 20,
        startedAt: 1_000,
    });

    // When
    const advanced = advanceOperation(operation, {
        successItems: 4,
        failureItems: 1,
        currentItem: { id: 'student-6', label: '홍길동' },
        phase: 'upstageWaiting',
    });

    // Then
    expect(advanced).toMatchObject({
        completedItems: 5,
        failureItems: 1,
        pendingItems: 15,
        progress: 25,
        progressKind: 'actual',
        successItems: 4,
        currentItem: { id: 'student-6', label: '홍길동' },
    });
});

test('keeps an opaque Upstage request indeterminate without inventing a percent', () => {
    // Given
    const operation = createOperation({ kind: 'ocr', label: '답안 분석', startedAt: 1_000 });

    // When
    const waiting = advanceOperation(operation, { phase: 'upstageWaiting' });

    // Then
    expect(waiting).toMatchObject({
        phase: 'upstageWaiting',
        phaseLabel: 'AI가 생성 중입니다.',
        progress: null,
        progressKind: 'indeterminate',
    });
});

test('ignores measured progress while an opaque Upstage request is waiting', () => {
    // Given
    const operation = createOperation({ kind: 'ocr', label: '답안 분석', startedAt: 1_000 });

    // When
    const waiting = advanceOperation(operation, { measuredProgress: 70, phase: 'upstageWaiting' });

    // Then
    expect(waiting).toMatchObject({ progress: null, progressKind: 'indeterminate' });
});

test('ignores measured progress outside an explicitly measurable upload', () => {
    // Given
    const operation = createOperation({ kind: 'generate', label: '세특 생성', startedAt: 1_000 });

    // When
    const generating = advanceOperation(operation, { measuredProgress: 70, phase: 'generating' });

    // Then
    expect(generating).toMatchObject({ progress: 50, progressKind: 'estimated' });
});

test('keeps upload indeterminate until measured byte progress is supplied', () => {
    // Given
    const operation = createOperation({ kind: 'upload', label: 'PDF 업로드', startedAt: 1_000 });

    // When
    const unmeasured = advanceOperation(operation, { phase: 'uploading' });
    const measured = advanceOperation(unmeasured, { measuredProgress: 40 });

    // Then
    expect(unmeasured).toMatchObject({ progress: null, progressKind: 'indeterminate' });
    expect(measured).toMatchObject({ progress: 40, progressKind: 'actual' });
});

test('uses a fixed phase boundary for a non-opaque single operation', () => {
    // Given
    const operation = createOperation({ kind: 'generate', label: '세특 생성', startedAt: 1_000 });

    // When
    const generating = advanceOperation(operation, { phase: 'generating' });

    // Then
    expect(generating).toMatchObject({ progress: 50, progressKind: 'estimated' });
});

test('derives duration estimates from matching session moving averages', () => {
    // Given
    const profile = { kind: 'ocr', model: 'document-parse', pages: 10, items: 2 };
    const first = recordOperationDuration({}, profile, 40);
    const second = recordOperationDuration(first, profile, 60);

    // When
    const estimate = estimateOperationDuration(second, profile, [90, 150]);

    // Then
    expect(estimate).toEqual({
        averageSeconds: 50,
        rangeSeconds: [40, 60],
        sampleCount: 2,
        source: 'session-average',
    });
});

test('labels remaining time as approximate', () => {
    // Given
    const operation = createOperation({
        kind: 'upload',
        label: '답안 업로드',
        startedAt: 0,
        estimate: { averageSeconds: 100, rangeSeconds: [80, 120], sampleCount: 2, source: 'session-average' },
    });
    const advanced = advanceOperation(operation, { measuredProgress: 25, phase: 'uploading' });

    // When
    const timing = getOperationTiming(advanced, 20_000);

    // Then
    expect(timing).toMatchObject({
        estimatedRemainingSeconds: [60, 90],
        timingKind: 'remaining',
    });
    expect(timing.label.startsWith('약 ')).toBe(true);
    expect(formatRemainingSeconds(75)).toBe('약 1~2분 남음');
});

test('collapses a rounded short ETA range into one natural time label', () => {
    // Given
    const operation = createOperation({
        kind: 'generate',
        label: '지도안 생성',
        phase: 'upstageWaiting',
        startedAt: 0,
        estimate: { averageSeconds: 5, rangeSeconds: [4, 5], sampleCount: 1, source: 'session-average' },
    });

    // When
    const timing = getOperationTiming(operation, 0);

    // Then
    expect(timing.label).toBe('약 5초 남음');
});

test('keeps an approximate ETA range on operation state as actual batch progress advances', () => {
    // Given
    const operation = createOperation({
        kind: 'ocr',
        label: '학급 OCR',
        totalItems: 4,
        startedAt: 0,
        estimateSeconds: 120,
    });

    // When
    const advanced = advanceOperation(operation, { completedItems: 1 });

    // Then
    expect(advanced).toMatchObject({
        estimatedRemainingSeconds: [90, 90],
        etaLabel: '약 1~2분 남음',
    });
});

test('switches to elapsed overrun state after the estimate is exceeded', () => {
    // Given
    const operation = createOperation({
        kind: 'generate',
        label: '세특 생성',
        startedAt: 0,
        estimateSeconds: 120,
    });

    // When
    const timing = getOperationTiming(operation, 130_000);

    // Then
    expect(timing).toMatchObject({ elapsedSeconds: 130, estimatedRemainingSeconds: null, overrun: true, timingKind: 'overrun' });
    expect(timing.label).toContain('예상 시간을 넘겨');
});

test('cancellation preserves completed results and is idempotent', () => {
    // Given
    const operation = advanceOperation(
        createOperation({ kind: 'grade', label: '일괄 채점', totalItems: 3, startedAt: 1_000 }),
        {
            completedResults: [{ itemId: 'student-1', status: 'fulfilled', value: { score: 90 } }],
            successItems: 1,
        },
    );

    // When
    const cancelled = cancelOperation(operation, 5_000);
    const cancelledAgain = cancelOperation(cancelled, 9_000);

    // Then
    expect(cancelled).toMatchObject({
        cancelledAt: 5_000,
        completedItems: 1,
        pendingItems: 2,
        status: 'cancelled',
    });
    expect(cancelled.completedResults).toEqual([{ itemId: 'student-1', status: 'fulfilled', value: { score: 90 } }]);
    expect(cancelledAgain).toBe(cancelled);
});

test('advancing a state deep-copies existing completed results', () => {
    // Given
    const operation = advanceOperation(
        createOperation({ kind: 'grade', label: '일괄 채점', totalItems: 2, startedAt: 1_000 }),
        { completedResults: [{ itemId: 'student-1', value: { score: 90 } }], successItems: 1 },
    );

    // When
    const advanced = advanceOperation(operation, { currentItem: { id: 'student-2' } });
    advanced.completedResults[0].value.score = 0;

    // Then
    expect(advanced.completedResults).not.toBe(operation.completedResults);
    expect(advanced.completedResults[0].value).not.toBe(operation.completedResults[0].value);
    expect(operation.completedResults[0].value.score).toBe(90);
});

test('cancelling a state deep-copies completed results', () => {
    // Given
    const operation = advanceOperation(
        createOperation({ kind: 'grade', label: '일괄 채점', totalItems: 2, startedAt: 1_000 }),
        { completedResults: [{ itemId: 'student-1', value: { evidence: { page: 3 } } }], successItems: 1 },
    );

    // When
    const cancelled = cancelOperation(operation, 5_000);
    cancelled.completedResults[0].value.evidence.page = 99;

    // Then
    expect(cancelled.completedResults).not.toBe(operation.completedResults);
    expect(cancelled.completedResults[0].value).not.toBe(operation.completedResults[0].value);
    expect(operation.completedResults[0].value.evidence.page).toBe(3);
});

test.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -10])(
    'uses a stable Korean fallback for invalid remaining seconds: %s',
    invalidSeconds => {
        // Given
        const fallback = '남은 시간 계산 중';

        // When
        const label = formatRemainingSeconds(invalidSeconds);

        // Then
        expect(label).toBe(fallback);
    },
);

test('normalizes zero and invalid batch counts without exceeding one hundred percent', () => {
    // Given
    const operation = createOperation({ kind: 'ocr', label: '학급 OCR', totalItems: Number.NaN, startedAt: 1_000 });

    // When
    const advanced = advanceOperation(operation, { successItems: 9, failureItems: -3, completedItems: 99 });

    // Then
    expect(advanced).toMatchObject({
        completedItems: 0,
        failureItems: 0,
        pendingItems: 0,
        progress: 0,
        progressKind: 'actual',
        successItems: 0,
        totalItems: 0,
    });
});

test('ignores late completion after cancellation', () => {
    // Given
    const operation = advanceOperation(
        createOperation({ kind: 'ocr', label: '학급 OCR', totalItems: 2, startedAt: 1_000 }),
        { successItems: 1 },
    );
    const cancelled = cancelOperation(operation, 5_000);

    // When
    const lateCompletion = advanceOperation(cancelled, {
        completedResults: [
            ...cancelled.completedResults,
            { itemId: 'student-2', status: 'fulfilled', value: { text: '늦은 결과' } },
        ],
        successItems: 2,
        status: 'completed',
    });

    // Then
    expect(lateCompletion).toBe(cancelled);
});
