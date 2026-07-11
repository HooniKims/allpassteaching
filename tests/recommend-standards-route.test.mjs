import { afterEach, test, expect, vi } from 'vitest';
import { POST } from '@/app/api/recommend-standards/route';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });

function request(body) { return new Request('http://localhost/api/recommend-standards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

test('removes model-returned codes outside the server allow-list', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ recommendations: [
        { code: '6과11-02', score: 92, reason: '식물 기관 관찰과 연결됨', keyPhrase: '식물의 각 기관' },
        { code: '9수01-01', score: 99, reason: '범위 밖', keyPhrase: '수학' },
    ] }) } }] }), { status: 200 })));
    const response = await POST(request({ schoolLevel: 'elementary', gradeBand: '5-6', subject: '과학', query: '식물의 구조와 성장 관찰' }));
    expect(response.status).toBe(200);
    expect((await response.json()).recommendations.map(item => item.code)).toEqual(['6과11-02']);
});

test('keeps direct candidates available when the key is missing', async () => {
    const response = await POST(request({ schoolLevel: 'elementary', gradeBand: '5-6', subject: '과학', query: '식물 관찰' }));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe('missing_key');
    expect(body.directCandidates.length).toBeGreaterThan(0);
});

test('allows recommendations from the confirmed union of official subjects', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ recommendations: [
        { code: '6과11-02', score: 92, reason: '과학 탐구와 연결됨', keyPhrase: '식물의 각 기관' },
        { code: '6사02-01', score: 90, reason: '사회 환경과 연결됨', keyPhrase: '기후변화' },
    ] }) } }] }), { status: 200 })));

    const response = await POST(request({ schoolLevel: 'elementary', gradeBand: '5-6', subjects: ['과학', '사회'], query: '식물 기후변화' }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recommendations).toHaveLength(2);
    expect(body.recommendations.every(item => ['과학', '사회'].includes(item.subject))).toBe(true);
});
