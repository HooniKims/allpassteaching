export const OPERATION_PHASES = Object.freeze({
    preparing: Object.freeze([0, 10]),
    uploading: Object.freeze([10, 20]),
    parsing: Object.freeze([20, 50]),
    generating: Object.freeze([50, 80]),
    validating: Object.freeze([80, 95]),
    applying: Object.freeze([95, 100]),
});

const PHASE_LABELS = Object.freeze({
    preparing: '입력 검증·자료 준비',
    uploading: '업로드',
    parsing: 'OCR·구조 분석',
    upstageWaiting: 'AI가 생성 중입니다.',
    serverWaiting: '서버 응답 대기',
    generating: 'AI 분석·생성',
    validating: '스키마 검증·보정',
    applying: '저장·화면 반영',
});

const OPAQUE_PHASES = new Set(['uploading', 'upstageWaiting', 'serverWaiting']);
const SAMPLE_LIMIT = 5;
const DEFAULT_ESTIMATE_RANGE = Object.freeze([30, 90]);

function normalizeCount(value) {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normalizeProgress(value) {
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}

function normalizeRange(range = DEFAULT_ESTIMATE_RANGE) {
    const first = Number.isFinite(range[0]) ? Math.max(0, range[0]) : DEFAULT_ESTIMATE_RANGE[0];
    const second = Number.isFinite(range[1]) ? Math.max(first, range[1]) : Math.max(first, DEFAULT_ESTIMATE_RANGE[1]);
    return [Math.round(first), Math.round(second)];
}

function normalizeEstimate(input) {
    if (input.estimate) {
        const rangeSeconds = normalizeRange(input.estimate.rangeSeconds);
        return {
            averageSeconds: Number.isFinite(input.estimate.averageSeconds)
                ? Math.max(0, Math.round(input.estimate.averageSeconds))
                : Math.round((rangeSeconds[0] + rangeSeconds[1]) / 2),
            rangeSeconds,
            sampleCount: normalizeCount(input.estimate.sampleCount),
            source: input.estimate.source === 'session-average' ? 'session-average' : 'fallback',
        };
    }
    if (Number.isFinite(input.estimateSeconds)) {
        const seconds = Math.max(0, Math.round(input.estimateSeconds));
        return { averageSeconds: seconds, rangeSeconds: [seconds, seconds], sampleCount: 0, source: 'fallback' };
    }
    const rangeSeconds = [...DEFAULT_ESTIMATE_RANGE];
    return {
        averageSeconds: Math.round((rangeSeconds[0] + rangeSeconds[1]) / 2),
        rangeSeconds,
        sampleCount: 0,
        source: 'fallback',
    };
}

function resolvePhase(phase) {
    return Object.hasOwn(PHASE_LABELS, phase) ? phase : 'preparing';
}

function resolveProgress(operation, phase, measuredProgress) {
    if (operation.isBatch) {
        return {
            progress: operation.totalItems === 0 ? 0 : (operation.completedItems / operation.totalItems) * 100,
            progressKind: 'actual',
            progressLabel: '실제 진행률',
        };
    }
    const canMeasure = operation.kind === 'upload' && phase === 'uploading';
    const measured = canMeasure ? normalizeProgress(measuredProgress) : null;
    if (measured !== null) return { progress: measured, progressKind: 'actual', progressLabel: '실제 진행률' };
    if (OPAQUE_PHASES.has(phase)) return { progress: null, progressKind: 'indeterminate', progressLabel: null };
    return { progress: OPERATION_PHASES[phase][0], progressKind: 'estimated', progressLabel: '예상 진행률' };
}

function copyCompletedResults(results) {
    return structuredClone(results);
}

function withProgressAndEta(operation, measuredProgress) {
    const progressState = resolveProgress(operation, operation.phase, measuredProgress);
    const remainingRatio = progressState.progress === null ? 1 : Math.max(0, 1 - progressState.progress / 100);
    const estimatedRemainingSeconds = operation.estimate.rangeSeconds.map(value => Math.round(value * remainingRatio));
    return {
        ...operation,
        ...progressState,
        estimatedRemainingSeconds,
        etaLabel: formatRemainingRange(estimatedRemainingSeconds),
    };
}

function operationProfileKey(profile) {
    return JSON.stringify([
        profile.kind || 'unknown',
        profile.model || 'default',
        normalizeCount(profile.pages),
        normalizeCount(profile.items),
    ]);
}

export function recordOperationDuration(session, profile, durationSeconds) {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) return session;
    const key = operationProfileKey(profile);
    const samples = [...(session[key] || []), durationSeconds].slice(-SAMPLE_LIMIT);
    return { ...session, [key]: samples };
}

export function estimateOperationDuration(session, profile, fallbackRangeSeconds = DEFAULT_ESTIMATE_RANGE) {
    const samples = session[operationProfileKey(profile)] || [];
    if (samples.length === 0) {
        const rangeSeconds = normalizeRange(fallbackRangeSeconds);
        return {
            averageSeconds: Math.round((rangeSeconds[0] + rangeSeconds[1]) / 2),
            rangeSeconds,
            sampleCount: 0,
            source: 'fallback',
        };
    }
    const averageSeconds = Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
    const rangeSeconds = samples.length === 1
        ? [Math.round(averageSeconds * 0.8), Math.round(averageSeconds * 1.2)]
        : [Math.round(Math.min(...samples)), Math.round(Math.max(...samples))];
    return { averageSeconds, rangeSeconds, sampleCount: samples.length, source: 'session-average' };
}

export function createOperation(input) {
    const isBatch = Object.hasOwn(input, 'totalItems');
    const totalItems = isBatch ? normalizeCount(input.totalItems) : 0;
    const phase = resolvePhase(input.phase);
    const operation = {
        id: input.id || `${input.kind}-${normalizeCount(input.startedAt)}`,
        kind: input.kind,
        label: input.label,
        phase,
        phaseLabel: PHASE_LABELS[phase],
        completedItems: 0,
        successItems: 0,
        failureItems: 0,
        pendingItems: totalItems,
        totalItems,
        currentItem: null,
        completedResults: copyCompletedResults(input.completedResults || []),
        startedAt: normalizeCount(input.startedAt),
        cancelledAt: null,
        cancelable: input.cancelable !== false,
        status: 'running',
        error: null,
        isBatch,
        estimate: normalizeEstimate(input),
    };
    return withProgressAndEta(operation, input.measuredProgress);
}

export function advanceOperation(operation, update) {
    if (operation.status === 'cancelled') return operation;
    const phase = resolvePhase(update.phase || operation.phase);
    const successCandidate = Object.hasOwn(update, 'successItems') ? normalizeCount(update.successItems) : operation.successItems;
    const successItems = Math.min(operation.totalItems, successCandidate);
    const failureCandidate = Object.hasOwn(update, 'failureItems') ? normalizeCount(update.failureItems) : operation.failureItems;
    let failureItems = Math.min(operation.totalItems - successItems, failureCandidate);
    let normalizedSuccessItems = successItems;
    if (Object.hasOwn(update, 'completedItems') && !Object.hasOwn(update, 'successItems')) {
        const completedItems = Math.min(operation.totalItems, normalizeCount(update.completedItems));
        failureItems = Math.min(failureItems, completedItems);
        normalizedSuccessItems = completedItems - failureItems;
    }
    const completedItems = normalizedSuccessItems + failureItems;
    const next = {
        ...operation,
        phase,
        phaseLabel: PHASE_LABELS[phase],
        completedItems,
        successItems: normalizedSuccessItems,
        failureItems,
        pendingItems: operation.totalItems - completedItems,
        currentItem: Object.hasOwn(update, 'currentItem') ? update.currentItem : operation.currentItem,
        completedResults: Object.hasOwn(update, 'completedResults')
            ? copyCompletedResults(update.completedResults)
            : copyCompletedResults(operation.completedResults),
        status: update.status || (operation.totalItems > 0 && completedItems === operation.totalItems ? 'completed' : operation.status),
        error: Object.hasOwn(update, 'error') ? update.error : operation.error,
    };
    const measuredProgress = Object.hasOwn(update, 'measuredProgress')
        ? update.measuredProgress
        : (phase === operation.phase && operation.progressKind === 'actual' && !operation.isBatch ? operation.progress : undefined);
    return withProgressAndEta(next, measuredProgress);
}

export function cancelOperation(operation, cancelledAt) {
    if (operation.status !== 'running' || !operation.cancelable) return operation;
    return {
        ...operation,
        completedResults: copyCompletedResults(operation.completedResults),
        status: 'cancelled',
        cancelledAt: normalizeCount(cancelledAt),
        currentItem: null,
    };
}

export function formatRemainingSeconds(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '남은 시간 계산 중';
    const normalized = Math.max(0, Math.round(seconds));
    if (normalized < 60) return `약 ${Math.max(5, Math.round(normalized / 5) * 5)}초 남음`;
    const lowerMinutes = Math.floor(normalized / 60);
    const upperMinutes = Math.ceil(normalized / 60);
    return lowerMinutes === upperMinutes
        ? `약 ${lowerMinutes}분 남음`
        : `약 ${lowerMinutes}~${upperMinutes}분 남음`;
}

function formatRemainingRange(rangeSeconds) {
    if (rangeSeconds[0] === rangeSeconds[1]) return formatRemainingSeconds(rangeSeconds[0]);
    const lowerMinutes = Math.max(1, Math.floor(rangeSeconds[0] / 60));
    const upperMinutes = Math.max(lowerMinutes, Math.ceil(rangeSeconds[1] / 60));
    if (upperMinutes === 1 && rangeSeconds[1] < 60) {
        const lowerSeconds = Math.max(5, Math.round(rangeSeconds[0] / 5) * 5);
        const upperSeconds = Math.max(5, Math.round(rangeSeconds[1] / 5) * 5);
        return lowerSeconds === upperSeconds ? `약 ${lowerSeconds}초 남음` : `약 ${lowerSeconds}~${upperSeconds}초 남음`;
    }
    return lowerMinutes === upperMinutes ? `약 ${lowerMinutes}분 남음` : `약 ${lowerMinutes}~${upperMinutes}분 남음`;
}

function formatElapsedSeconds(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes === 0 ? `${remainder}초` : `${minutes}분 ${remainder}초`;
}

export function getOperationTiming(operation, now) {
    const effectiveNow = operation.status === 'cancelled' ? operation.cancelledAt : normalizeCount(now);
    const elapsedSeconds = Math.max(0, Math.floor((effectiveNow - operation.startedAt) / 1_000));
    if (operation.status === 'cancelled') {
        return { elapsedSeconds, estimatedRemainingSeconds: null, label: '작업이 취소되었습니다', overrun: false, timingKind: 'cancelled' };
    }
    if (operation.status === 'completed') {
        return { elapsedSeconds, estimatedRemainingSeconds: [0, 0], label: '완료', overrun: false, timingKind: 'completed' };
    }
    const [estimateLow, estimateHigh] = operation.estimate.rangeSeconds;
    if (elapsedSeconds > estimateHigh) {
        return {
            elapsedSeconds,
            estimatedRemainingSeconds: null,
            label: `예상 시간을 넘겨 ${formatElapsedSeconds(elapsedSeconds)}째 처리 중`,
            overrun: true,
            timingKind: 'overrun',
        };
    }
    const remainingRatio = operation.progress === null ? 1 : Math.max(0, 1 - operation.progress / 100);
    const estimatedRemainingSeconds = [Math.round(estimateLow * remainingRatio), Math.round(estimateHigh * remainingRatio)];
    return {
        elapsedSeconds,
        estimatedRemainingSeconds,
        label: formatRemainingRange(estimatedRemainingSeconds),
        overrun: false,
        timingKind: 'remaining',
    };
}
