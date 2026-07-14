export class UpstageError extends Error {
    constructor(code, status, message = code) {
        super(message);
        this.name = 'UpstageError'; this.code = code; this.status = status;
    }
}

const UPSTAGE_CHAT_URL = 'https://api.upstage.ai/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_TEMPERATURE = 0;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;
const MIN_MAX_TOKENS = 128;
const MAX_MAX_TOKENS = 16384;

function boundedNumber(value, { min, max, fallback, integer = false }) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) return fallback;
    return parsed;
}

function configuredTemperature() {
    return boundedNumber(process.env.UPSTAGE_TEMPERATURE, { min: 0, max: 2, fallback: DEFAULT_TEMPERATURE });
}

function configuredMaxTokens() {
    return boundedNumber(process.env.UPSTAGE_MAX_TOKENS, { min: MIN_MAX_TOKENS, max: MAX_MAX_TOKENS, fallback: undefined, integer: true });
}

function configuredTimeoutMs() {
    return boundedNumber(process.env.UPSTAGE_TIMEOUT_MS, { min: MIN_TIMEOUT_MS, max: MAX_TIMEOUT_MS, fallback: undefined, integer: true });
}

function effectiveTimeoutMs(timeoutMs) {
    const configured = configuredTimeoutMs();
    if (configured !== undefined) return configured;
    return boundedNumber(timeoutMs, { min: MIN_TIMEOUT_MS, max: MAX_TIMEOUT_MS, fallback: DEFAULT_TIMEOUT_MS, integer: true });
}

export async function chatContent({ messages, timeoutMs, model = process.env.UPSTAGE_MODEL || 'solar-pro3' }) {
    if (!process.env.UPSTAGE_API_KEY) throw new UpstageError('missing_key', 503, 'Upstage API 키가 설정되지 않았습니다.');
    const maxTokens = configuredMaxTokens();
    const requestBody = {
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: configuredTemperature(),
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
    };
    let response;
    try {
        response = await fetch(UPSTAGE_CHAT_URL, {
            method: 'POST', signal: AbortSignal.timeout(effectiveTimeoutMs(timeoutMs)),
            headers: { Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') throw new UpstageError('timeout', 504, 'Upstage 응답 시간이 초과되었습니다.');
        throw error;
    }
    if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new UpstageError(details.error?.code || 'upstream_error', response.status, details.error?.message || 'Upstage 요청에 실패했습니다.');
    }
    const payload = await response.json();
    return payload.choices[0].message.content;
}

export function parseChatJson(content, schema) {
    try {
        return schema.parse(JSON.parse(content));
    } catch (error) {
        throw new UpstageError('invalid_response', 502, error instanceof Error ? error.message : 'Upstage JSON 응답이 올바르지 않습니다.');
    }
}

export async function chatJson({ messages, schema, timeoutMs, model = process.env.UPSTAGE_MODEL || 'solar-pro3' }) {
    return parseChatJson(await chatContent({ messages, timeoutMs, model }), schema);
}
