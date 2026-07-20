import { afterEach, expect, test, vi } from 'vitest';
import { POST } from '@/app/api/generate-worksheet/route';
import { makeGeneratedPlan, makeLanguageScienceIntegratedPlan } from './fixtures/lesson-plan.mjs';
import { makeWorksheet } from './fixtures/workflow.mjs';

afterEach(() => { vi.restoreAllMocks(); delete process.env.UPSTAGE_API_KEY; });
const request = body => new Request('http://localhost/api/generate-worksheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const completion = value => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

test('returns a validated worksheet in the teacher-selected format', async () => {
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(completion(makeWorksheet())));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), selectedFormatId: 'inquiry-experiment', generationRequest: makeWorksheet().generationRequest }));

    expect(response.status).toBe(200);
    expect((await response.json()).worksheet.formatId).toBe('inquiry-experiment');
    expect(fetch).toHaveBeenCalledOnce();
});

test('repairs a worksheet that ignores the teacher-selected format', async () => {
    const invalid = makeWorksheet(); invalid.formatId = 'project'; invalid.formatName = '프로젝트 계획지';
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(invalid)).mockResolvedValueOnce(completion(makeWorksheet())));

    const response = await POST(request({ lessonPlan: makeGeneratedPlan(), selectedFormatId: 'inquiry-experiment', generationRequest: makeWorksheet().generationRequest }));

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('repairs generated output that omits a requested type or changes canonical standards', async () => {
    const invalid = makeWorksheet();
    invalid.generationRequest.questionTypes = ['descriptive'];
    invalid.standards[0].text = 'AI가 바꾼 성취기준';
    const repaired = makeWorksheet();
    repaired.generationRequest = { additionalRequirements: '5지 선다형 포함', questionTypes: ['multiple-choice-5'] };
    repaired.document.sections[0].questions[0] = {
        id: 'q-choice', type: 'multiple-choice-5', prompt: '옳은 것을 고르세요.', responseLines: 1,
        choices: ['1', '2', '3', '4', '5'], standardCodes: ['6과11-02'],
    };
    repaired.teacherKey.answers[0].questionId = 'q-choice';
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(completion(invalid)).mockResolvedValueOnce(completion(repaired)));

    const response = await POST(request({
        lessonPlan: makeGeneratedPlan(), selectedFormatId: 'inquiry-experiment',
        generationRequest: repaired.generationRequest,
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.worksheet.standards).toEqual(makeGeneratedPlan().standards);
    expect(body.worksheet.document.sections.flatMap(section => section.questions).map(question => question.type)).toContain('multiple-choice-5');
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('국어와 과학 융합 학습지는 각 교과 문항과 두 근거를 연결하는 문항을 모두 제공한다', async () => {
    const lessonPlan = makeLanguageScienceIntegratedPlan();
    const generationRequest = { additionalRequirements: '', questionTypes: ['table-chart', 'descriptive', 'self-assessment'] };
    const generated = makeWorksheet();
    generated.formatId = 'integrated-connections';
    generated.formatName = '융합 연결·적용지';
    generated.standards = lessonPlan.standards;
    generated.generationRequest = generationRequest;
    generated.document.sections = [{
        id: 'section-1', title: '교과별 근거', purpose: '각 교과의 근거를 확인한다.', questions: [
            { id: 'q-language', type: 'descriptive', prompt: '주장과 근거를 정리하세요.', responseLines: 4, standardCodes: ['6국03-04'] },
            { id: 'q-science', type: 'descriptive', prompt: '생태계 관계를 설명하세요.', responseLines: 4, standardCodes: ['6과16-01'] },
        ],
    }];
    generated.teacherKey.answers = [
        { questionId: 'q-language', answer: '주장과 근거의 연결을 확인한다.' },
        { questionId: 'q-science', answer: '생태계 구성 요소의 관계를 확인한다.' },
    ];
    process.env.UPSTAGE_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(completion(generated))));

    const response = await POST(request({ lessonPlan, selectedFormatId: 'integrated-connections', generationRequest }));
    const body = await response.json();
    const questions = body.worksheet.document.sections.flatMap(section => section.questions);

    expect(response.status).toBe(200);
    expect(questions.some(question => question.standardCodes.includes('6국03-04') && question.standardCodes.includes('6과16-01'))).toBe(true);
    expect(questions.find(question => question.standardCodes.includes('6국03-04') && question.standardCodes.includes('6과16-01')).type).toBe('descriptive');
});
