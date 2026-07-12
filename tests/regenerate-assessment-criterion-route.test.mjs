import { afterEach, expect, test, vi } from 'vitest';
import { makeAssessment } from './fixtures/workflow.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

test('Given a selected criterion When AI regenerates its wording Then identity, allocation, and score ladder remain unchanged', async () => {
    const { POST } = await import('@/app/api/regenerate-assessment-criterion/route');
    const assessment = makeAssessment();
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion({
        name: '관찰 증거의 정확성', description: '관찰 사실을 구체적이고 정확하게 제시한다.', standardCodes: ['6과11-02'], kind: 'outcome', evidence: '기관별 관찰 기록',
        levels: assessment.rubric.criteria[0].levels.map(item => ({ levelId: item.levelId, description: `${item.description} 새 설명` })),
    })));
    const request = new Request('http://localhost/api/regenerate-assessment-criterion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assessment, criterionId: 'criterion-1' }) });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.criterion).toMatchObject({ id: 'criterion-1', name: '관찰 증거의 정확성', maxPoints: 40, intervalPoints: 5 });
    expect(body.criterion.levels.map(item => [item.levelId, item.score])).toEqual(assessment.rubric.criteria[0].levels.map(item => [item.levelId, item.score]));
});
