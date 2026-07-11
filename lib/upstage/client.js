export class UpstageError extends Error {
    constructor(code, status, message = code) {
        super(message);
        this.name = 'UpstageError'; this.code = code; this.status = status;
    }
}

export async function chatContent({ messages, timeoutMs = 30000, model = process.env.UPSTAGE_MODEL || 'solar-pro3' }) {
    if (!process.env.UPSTAGE_API_KEY) throw new UpstageError('missing_key', 503, 'Upstage API 키가 설정되지 않았습니다.');
    let response;
    try {
        response = await fetch('https://api.upstage.ai/v1/chat/completions', {
            method: 'POST', signal: AbortSignal.timeout(timeoutMs),
            headers: { Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages, response_format: { type: 'json_object' }, temperature: 0 }),
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

export async function chatJson({ messages, schema, timeoutMs = 30000, model = process.env.UPSTAGE_MODEL || 'solar-pro3' }) {
    return parseChatJson(await chatContent({ messages, timeoutMs, model }), schema);
}
