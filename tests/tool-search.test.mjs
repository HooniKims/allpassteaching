import { expect, test } from 'vitest';
import { decodeDuckDuckGoUrl, decodeHtmlText, normalizeToolQuery, parseDuckDuckGoResults, searchTeachingTool, summarizeResults, TOOL_SEARCH_LIMITS, TOOL_SEARCH_SOURCES } from '@/lib/tool-search';

const duckDuckGoHtml = `
<div class="result results_links">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsnorkl.app%2F&amp;rut=abc">Snorkl &amp; 학생 설명 녹화</a>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsnorkl.app%2F">Snorkl lets students <b>explain</b> their thinking with voice and drawing.</a>
</div>
<div class="result results_links">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.edu%2Fsnorkl">스노클 수업 활용</a>
  <a class="result__snippet" href="#">학생이 말로 설명한 내용을 교사가 한눈에 확인합니다.</a>
</div>`;

const okResponse = body => ({ ok: true, text: async () => body, json: async () => body });

test('normalizes and caps a teacher-typed tool query', () => {
    expect(normalizeToolQuery('  스노클(Snorkl)   사용  ')).toBe('스노클(Snorkl) 사용');
    expect(normalizeToolQuery('가'.repeat(400))).toHaveLength(TOOL_SEARCH_LIMITS.query);
    expect(normalizeToolQuery(undefined)).toBe('');
});

test('decodes entities and strips markup from search snippets', () => {
    expect(decodeHtmlText('Snorkl <b>&amp;</b> 학생&#39;s 설명&nbsp;녹화')).toBe("Snorkl & 학생's 설명 녹화");
});

test('unwraps the DuckDuckGo redirect link into the real destination', () => {
    expect(decodeDuckDuckGoUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fsnorkl.app%2F&amp;rut=abc')).toBe('https://snorkl.app/');
    expect(decodeDuckDuckGoUrl('/relative/only')).toBe('');
});

test('pairs each DuckDuckGo title with its snippet', () => {
    const results = parseDuckDuckGoResults(duckDuckGoHtml);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
        title: 'Snorkl & 학생 설명 녹화',
        url: 'https://snorkl.app/',
        content: 'Snorkl lets students explain their thinking with voice and drawing.',
    });
    expect(results[1].url).toBe('https://example.edu/snorkl');
});

test('summarizes results within the prompt budget', () => {
    const summary = summarizeResults([{ title: '가'.repeat(500), content: '나'.repeat(500) }]);
    expect(summary).toHaveLength(TOOL_SEARCH_LIMITS.summary);
});

test('uses Tavily when a key is configured', async () => {
    const calls = [];
    const fetchImpl = async url => {
        calls.push(url);
        return okResponse({ results: [{ title: 'Snorkl', url: 'https://snorkl.app', content: '학생이 말로 설명하는 도구' }] });
    };
    const result = await searchTeachingTool('스노클', { fetchImpl, apiKey: 'test-key' });
    expect(calls).toEqual(['https://api.tavily.com/search']);
    expect(result.source).toBe(TOOL_SEARCH_SOURCES.tavily);
    expect(result.verified).toBe(true);
    expect(result.summary).toContain('학생이 말로 설명하는 도구');
});

test('falls back to DuckDuckGo when no key is configured', async () => {
    const calls = [];
    const fetchImpl = async url => {
        calls.push(String(url));
        return okResponse(duckDuckGoHtml);
    };
    const result = await searchTeachingTool('스노클', { fetchImpl, apiKey: '' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('html.duckduckgo.com');
    expect(result.source).toBe(TOOL_SEARCH_SOURCES.duckduckgo);
    expect(result.verified).toBe(true);
});

test('falls back to DuckDuckGo when Tavily fails', async () => {
    const calls = [];
    const fetchImpl = async url => {
        calls.push(String(url));
        if (String(url).includes('tavily')) throw new Error('network down');
        return okResponse(duckDuckGoHtml);
    };
    const result = await searchTeachingTool('스노클', { fetchImpl, apiKey: 'test-key' });
    expect(calls).toHaveLength(2);
    expect(result.source).toBe(TOOL_SEARCH_SOURCES.duckduckgo);
});

test('reports unverified instead of throwing when every search path fails', async () => {
    const fetchImpl = async () => { throw new Error('blocked'); };
    const result = await searchTeachingTool('스노클', { fetchImpl, apiKey: 'test-key' });
    expect(result).toEqual({ query: '스노클', source: TOOL_SEARCH_SOURCES.unverified, verified: false, summary: '', results: [] });
});

test('reports unverified for an empty query without calling the network', async () => {
    const fetchImpl = async () => { throw new Error('should not be called'); };
    const result = await searchTeachingTool('   ', { fetchImpl, apiKey: 'test-key' });
    expect(result.verified).toBe(false);
    expect(result.query).toBe('');
});

test('treats an empty Tavily result set as a miss and tries the fallback', async () => {
    const calls = [];
    const fetchImpl = async url => {
        calls.push(String(url));
        return String(url).includes('tavily') ? okResponse({ results: [] }) : okResponse(duckDuckGoHtml);
    };
    const result = await searchTeachingTool('없는도구', { fetchImpl, apiKey: 'test-key' });
    expect(calls).toHaveLength(2);
    expect(result.source).toBe(TOOL_SEARCH_SOURCES.duckduckgo);
});
