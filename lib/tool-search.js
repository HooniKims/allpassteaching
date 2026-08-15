const TAVILY_URL = 'https://api.tavily.com/search';
const DUCKDUCKGO_URL = 'https://html.duckduckgo.com/html/';
const DUCKDUCKGO_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 8000;

export const TOOL_SEARCH_LIMITS = Object.freeze({
    query: 200,
    results: 3,
    snippet: 400,
    summary: 900,
});

// 검색 근거의 출처. unverified는 검색이 불가능해 교사에게 미검증으로 알려야 하는 상태입니다.
export const TOOL_SEARCH_SOURCES = Object.freeze({
    tavily: 'tavily',
    duckduckgo: 'duckduckgo',
    unverified: 'unverified',
});

export function normalizeToolQuery(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, TOOL_SEARCH_LIMITS.query);
}

const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ' };

export function decodeHtmlText(value) {
    return String(value ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
            if (HTML_ENTITIES[entity]) return HTML_ENTITIES[entity];
            const numeric = /^#x/i.test(entity) ? Number.parseInt(entity.slice(2), 16) : /^#/.test(entity) ? Number.parseInt(entity.slice(1), 10) : NaN;
            return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : match;
        })
        .replace(/\s+/g, ' ')
        .trim();
}

// DuckDuckGo HTML 결과의 링크는 /l/?uddg=<인코딩된 실제 주소> 형태로 감싸여 있습니다.
export function decodeDuckDuckGoUrl(href) {
    const raw = decodeHtmlText(href);
    if (!raw) return '';
    const wrapped = /[?&]uddg=([^&]+)/.exec(raw);
    const target = wrapped ? decodeURIComponent(wrapped[1]) : raw;
    const absolute = target.startsWith('//') ? `https:${target}` : target;
    return /^https?:\/\//.test(absolute) ? absolute : '';
}

export function parseDuckDuckGoResults(html) {
    const text = String(html ?? '');
    const titles = [...text.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const snippets = [...text.matchAll(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g)];
    return titles
        .map((match, index) => ({
            title: decodeHtmlText(match[2]),
            url: decodeDuckDuckGoUrl(match[1]),
            content: decodeHtmlText(snippets[index]?.[1] ?? '').slice(0, TOOL_SEARCH_LIMITS.snippet),
        }))
        .filter(item => item.title && item.url)
        .slice(0, TOOL_SEARCH_LIMITS.results);
}

export function summarizeResults(results) {
    return results
        .map(item => `${item.title}${item.content ? ` — ${item.content}` : ''}`)
        .join('\n')
        .slice(0, TOOL_SEARCH_LIMITS.summary);
}

function unverifiedResult(query) {
    return { query, source: TOOL_SEARCH_SOURCES.unverified, verified: false, summary: '', results: [] };
}

async function searchWithTavily(query, { fetchImpl, timeoutMs, apiKey }) {
    const response = await fetchImpl(TAVILY_URL, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, max_results: TOOL_SEARCH_LIMITS.results, search_depth: 'basic' }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const results = (payload?.results ?? [])
        .map(item => ({
            title: decodeHtmlText(item?.title),
            url: String(item?.url ?? ''),
            content: decodeHtmlText(item?.content).slice(0, TOOL_SEARCH_LIMITS.snippet),
        }))
        .filter(item => item.title && item.url)
        .slice(0, TOOL_SEARCH_LIMITS.results);
    if (!results.length) return null;
    return { query, source: TOOL_SEARCH_SOURCES.tavily, verified: true, summary: summarizeResults(results), results };
}

async function searchWithDuckDuckGo(query, { fetchImpl, timeoutMs }) {
    const response = await fetchImpl(`${DUCKDUCKGO_URL}?q=${encodeURIComponent(query)}`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': DUCKDUCKGO_USER_AGENT, Accept: 'text/html' },
    });
    if (!response.ok) return null;
    const results = parseDuckDuckGoResults(await response.text());
    if (!results.length) return null;
    return { query, source: TOOL_SEARCH_SOURCES.duckduckgo, verified: true, summary: summarizeResults(results), results };
}

/**
 * 수업 도구를 3단으로 확인합니다. Tavily 키가 있으면 Tavily, 없거나 실패하면 키가 필요 없는
 * DuckDuckGo, 그것도 실패하면 미검증으로 돌려보내 교사가 직접 확인하도록 표시합니다.
 */
export async function searchTeachingTool(rawQuery, {
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    apiKey = process.env.TAVILY_API_KEY,
} = {}) {
    const query = normalizeToolQuery(rawQuery);
    if (!query) return unverifiedResult('');
    const attempts = [
        ...(apiKey ? [() => searchWithTavily(query, { fetchImpl, timeoutMs, apiKey })] : []),
        () => searchWithDuckDuckGo(query, { fetchImpl, timeoutMs }),
    ];
    for (const attempt of attempts) {
        try {
            const result = await attempt();
            if (result) return result;
        } catch {
            // 한 경로가 막혀도 다음 경로로 넘어갑니다.
        }
    }
    return unverifiedResult(query);
}
