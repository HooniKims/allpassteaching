export const MAX_JSON_REQUEST_BYTES = 1_000_000;
export const MAX_PUBLIC_VALIDATION_ISSUES = 20;

const DEFAULT_STRUCTURE_LIMITS = {
    maxDepth: 64,
    maxNodes: 100_000,
    maxArrayItems: 2_500,
    maxObjectKeys: 200,
};
const PUBLIC_ISSUE_MESSAGE = '입력값의 형식 또는 상태를 확인해주세요.';
const MAX_ISSUE_PATH_LENGTH = 20;

export async function readBoundedRequestBytes(request, maxBytes) {
    const declared = request.headers?.get?.('content-length');
    if (declared !== null && declared !== undefined && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
        return { ok: false, reason: 'too_large' };
    }
    const reader = request.body?.getReader?.();
    if (!reader) return { ok: true, bytes: new Uint8Array() };
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) return { ok: false, reason: 'too_large' };
            chunks.push(value);
        }
    } catch {
        return { ok: false, reason: 'invalid_body' };
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { ok: true, bytes };
}

export function jsonStructureTooLarge(value, limits = DEFAULT_STRUCTURE_LIMITS) {
    const pending = [{ value, depth: 0 }];
    let visited = 0;
    while (pending.length) {
        const current = pending.pop();
        visited += 1;
        if (current.depth > limits.maxDepth || visited > limits.maxNodes) return true;
        if (Array.isArray(current.value)) {
            if (current.value.length > limits.maxArrayItems) return true;
            for (const child of current.value) pending.push({ value: child, depth: current.depth + 1 });
        } else if (current.value && typeof current.value === 'object') {
            const values = Object.values(current.value);
            if (values.length > limits.maxObjectKeys) return true;
            for (const child of values) pending.push({ value: child, depth: current.depth + 1 });
        }
    }
    return false;
}

export async function parseBoundedJsonRequest(request, maxBytes = MAX_JSON_REQUEST_BYTES) {
    const read = await readBoundedRequestBytes(request, maxBytes);
    if (!read.ok) return read;
    try {
        const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(read.bytes));
        if (jsonStructureTooLarge(value)) return { ok: false, reason: 'too_complex' };
        return { ok: true, value };
    } catch {
        return { ok: false, reason: 'invalid_json' };
    }
}

export function requestBoundaryError(reason) {
    if (reason === 'too_large') {
        return {
            status: 413,
            body: { code: 'request_too_large', message: '요청 내용이 너무 큽니다. 내용을 줄인 뒤 다시 시도해주세요.' },
        };
    }
    if (reason === 'too_complex') {
        return {
            status: 400,
            body: { code: 'invalid_request', message: '요청 구조가 너무 복잡합니다. 항목 수를 줄여주세요.' },
        };
    }
    return {
        status: 400,
        body: { code: 'invalid_request', message: '요청 본문이 올바른 JSON이 아닙니다.' },
    };
}

export function publicValidationIssues(issues) {
    return issues.slice(0, MAX_PUBLIC_VALIDATION_ISSUES).map(issue => ({
        path: (Array.isArray(issue.path) ? issue.path : []).slice(0, MAX_ISSUE_PATH_LENGTH).map(segment => (
            typeof segment === 'number' ? segment : 'field'
        )),
        message: PUBLIC_ISSUE_MESSAGE.slice(0, 300),
    }));
}
