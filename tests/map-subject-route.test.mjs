import { afterEach, test, expect, vi } from 'vitest';
import { POST } from '@/app/api/map-subject/route';

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.UPSTAGE_API_KEY;
});

const request = body => new Request('http://localhost/api/map-subject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

test('returns only same-school official subject mappings from Upstage', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ mappings: [
        { subject: '과학', score: 95, reason: '환경 탐구와 연결됩니다.' },
        { subject: '교양', score: 99, reason: '범위 밖입니다.' },
    ] }) } }] }), { status: 200 })));

    const response = await POST(request({ schoolLevel: 'elementary', gradeBand: '5-6', displaySubject: '환경', lessonIntent: '우리 동네 생태 환경을 조사한다.' }));

    expect(response.status).toBe(200);
    expect((await response.json()).mappings.map(item => item.subject)).toEqual(['과학']);
});

test('returns the official subject fallback list when the API key is missing', async () => {
    const response = await POST(request({ schoolLevel: 'elementary', gradeBand: '5-6', displaySubject: '환경', lessonIntent: '우리 동네 생태 환경을 조사한다.' }));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe('missing_key');
    expect(body.directCandidates).toContain('과학');
    expect(body.directCandidates).not.toContain('교양');
});
