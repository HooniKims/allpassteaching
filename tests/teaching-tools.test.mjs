import { afterEach, expect, test, vi } from 'vitest';
import { POST as searchTool } from '@/app/api/search-tool/route';
import { POST as recommendTools } from '@/app/api/recommend-tools/route';
import { lessonPlanMessages } from '@/lib/upstage/prompts';
import { createGenerationSnapshot, hasGenerationInputChanged } from '@/lib/lesson-input';
import { sanitizeLessonSnapshot } from '@/lib/workflow-storage-allowlist';
import { generationDraft } from './fixtures/lesson-plan.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.TAVILY_API_KEY; delete process.env.UPSTAGE_API_KEY; });

const jsonRequest = (path, body) => new Request(`http://localhost${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const tavilyResponse = () => new Response(JSON.stringify({ results: [{ title: 'Snorkl', url: 'https://snorkl.app', content: '학생이 말과 그림으로 설명한 내용을 녹화하고 AI 피드백을 받는 도구' }] }), { status: 200 });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

test('returns the searched tool evidence for a teacher-typed tool', async () => {
    process.env.TAVILY_API_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(tavilyResponse());
    const response = await searchTool(jsonRequest('/api/search-tool', { query: '스노클(Snorkl)' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tool.verified).toBe(true);
    expect(body.tool.source).toBe('tavily');
    expect(body.tool.summary).toContain('AI 피드백');
});

test('reports unverified instead of failing when every search path is blocked', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('blocked'));
    const response = await searchTool(jsonRequest('/api/search-tool', { query: '없는도구' }));
    expect(response.status).toBe(200);
    expect((await response.json()).tool).toMatchObject({ verified: false, source: 'unverified' });
});

test('rejects an empty tool query', async () => {
    const response = await searchTool(jsonRequest('/api/search-tool', { query: '   ' }));
    expect(response.status).toBe(400);
});

test('verifies every recommended tool with a search so invented names are visible', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    process.env.TAVILY_API_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
        if (String(url).includes('upstage')) return completion({ tools: [{ name: 'Snorkl', reason: '학생이 설명한 내용을 녹화해 확인합니다.' }, { name: '없는도구', reason: '지어낸 도구입니다.' }] });
        if (String(url).includes('tavily')) return tavilyResponse();
        throw new Error('blocked');
    });
    const response = await recommendTools(jsonRequest('/api/recommend-tools', { lessonIntent: '식물이 자라는 조건을 실험으로 확인한다.', schoolLevel: 'elementary', grade: '4', subject: '과학' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tools).toHaveLength(2);
    expect(body.tools[0]).toMatchObject({ name: 'Snorkl' });
    expect(body.tools[0].search.verified).toBe(true);
});

test('marks a recommended tool unverified when no search path confirms it', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
        if (String(url).includes('upstage')) return completion({ tools: [{ name: '지어낸도구', reason: '실재하지 않습니다.' }] });
        throw new Error('blocked');
    });
    const response = await recommendTools(jsonRequest('/api/recommend-tools', { lessonIntent: '식물이 자라는 조건을 실험으로 확인한다.', schoolLevel: 'elementary', grade: '4', subject: '과학' }));
    const body = await response.json();
    expect(body.tools[0].search).toMatchObject({ verified: false, source: 'unverified' });
});

test('sends the tool text and its search evidence to the lesson plan model', () => {
    const draft = { ...generationDraft, basics: { ...generationDraft.basics, teachingTools: '스노클(Snorkl)', toolEvidence: { query: '스노클(Snorkl)', source: 'tavily', verified: true, summary: '학생 설명 녹화 도구' } } };
    const [system, user] = lessonPlanMessages(draft);
    expect(system.content).toContain('basics.teachingTools');
    expect(system.content).toContain('basics.toolEvidence.summary');
    const sent = JSON.parse(user.content);
    expect(sent.basics.teachingTools).toBe('스노클(Snorkl)');
    expect(sent.basics.toolEvidence.summary).toBe('학생 설명 녹화 도구');
});

test('instructs the model to write support strategies as sentences instead of category labels', () => {
    const [system] = lessonPlanMessages(generationDraft);
    expect(system.content).toContain('supportStrategies에는');
    expect(system.content).toContain("'개별화 지원'처럼 범주 이름만 나열하지 마세요");
});

test('treats a changed tool as new generation input', () => {
    const draft = { ...generationDraft, basics: { ...generationDraft.basics, teachingTools: '' } };
    const snapshot = createGenerationSnapshot(draft);
    const withTool = { ...draft, basics: { ...draft.basics, teachingTools: '스노클(Snorkl)' } };
    expect(hasGenerationInputChanged(withTool, draft)).toBe(true);
    expect(createGenerationSnapshot(withTool)).not.toEqual(snapshot);
});

test('keeps the tool text and evidence when restoring a saved draft', () => {
    const stored = sanitizeLessonSnapshot({ step: 1, basics: { teachingTools: '스노클(Snorkl)', toolEvidence: { query: '스노클(Snorkl)', source: 'duckduckgo', verified: true, summary: '학생 설명 녹화' } } });
    expect(stored.basics.teachingTools).toBe('스노클(Snorkl)');
    expect(stored.basics.toolEvidence).toEqual({ query: '스노클(Snorkl)', source: 'duckduckgo', verified: true, summary: '학생 설명 녹화' });
});
