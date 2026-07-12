import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import { makeGeneratedPlan } from '../tests/fixtures/lesson-plan.mjs';
import { makeAssessment, makeWorksheet } from '../tests/fixtures/workflow.mjs';

const grading = {
    criteria: [
        { criterionId: 'criterion-1', score: 35, evidence: '뿌리에 가는 털이 있다', feedback: '관찰 근거를 구체적으로 기록했습니다.' },
        { criterionId: 'criterion-2', score: 35, evidence: '뿌리는 물을 흡수한다', feedback: '구조와 기능을 근거로 연결했습니다.' },
        { criterionId: 'criterion-3', score: 15, evidence: '관찰 결과', feedback: '피드백 반영과 수정 이유를 확인했습니다.' },
    ],
    totalScore: 85,
    summary: '관찰한 사실을 기능 설명의 근거로 활용했습니다.',
    nextSteps: '줄기와 잎도 같은 방식으로 설명해보세요.',
};
const recordText = '관찰한 식물 기관의 특징을 구체적으로 기록하고 뿌리의 가는 털과 물 흡수 기능을 근거로 연결하여 설명함. 관찰 사실에서 결론을 이끌어내는 교과 탐구 과정이 드러났으며 다른 기관에도 같은 설명 방식을 적용하려는 학습 방향을 보임.';
const studentRoster = [
    { id: 'student-a', grade: '2', className: '3', number: 1, name: '김학생' },
    { id: 'student-b', grade: '2', className: '3', number: 2, name: '이학생' },
];

function makeVisualAssessment() {
    return { ...makeAssessment(), visualAnalysisRequired: true };
}

async function combinedSubmissionPdf() {
    const document = await PDFDocument.create();
    for (let index = 0; index < 4; index += 1) document.addPage([300, 400]);
    return Buffer.from(await document.save());
}

function uploadedPdf(request) {
    const body = request.postDataBuffer();
    const start = body.indexOf(Buffer.from('%PDF-'));
    const eof = body.indexOf(Buffer.from('%%EOF'), start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(eof).toBeGreaterThan(start);
    return body.subarray(start, eof + 5);
}

function uploadedFormValue(request, name) {
    const body = request.postDataBuffer().toString('latin1');
    const marker = `name="${name}"\r\n\r\n`;
    const start = body.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);
    const valueStart = start + marker.length;
    const end = body.indexOf('\r\n', valueStart);
    expect(end).toBeGreaterThan(valueStart);
    return body.slice(valueStart, end);
}

test.beforeEach(async ({ page }) => {
    const plan = makeGeneratedPlan();
    const assessment = makeVisualAssessment();
    const assessmentRequest = {
        assessmentName: assessment.assessmentName, teacherIntent: assessment.backwardDesign.teacherIntent,
        totalPoints: assessment.totalPoints, levelCount: assessment.rubric.levels.length,
        includeProcessInScore: assessment.scoring.includeProcessInScore, processWeightPercent: assessment.scoring.processWeightPercent,
        outputTypes: assessment.generationSettings.outputTypes, answerTypes: assessment.generationSettings.answerTypes,
        stages: assessment.generationSettings.stages, visualAnalysisRequired: assessment.visualAnalysisRequired,
        includeStudentCover: assessment.includeStudentCover, additionalRequirements: assessment.generationSettings.additionalRequirements,
    };
    await page.addInitScript(({ lessonPlan, storedAssessmentRequest, storedStudents }) => {
        sessionStorage.clear();
        sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 2, data: { step: 4, maxReached: 4, basics: { schoolLevel: lessonPlan.schoolLevel, grade: lessonPlan.grade, subject: lessonPlan.subject, subjectMode: 'official', displaySubject: lessonPlan.subject, mappedSubjects: [lessonPlan.subject], mode: 'single', sessions: 1, intent: lessonPlan.title, studentNeeds: '', metadata: lessonPlan.metadata }, standards: lessonPlan.standards, instructionModel: { ...lessonPlan.instructionModel, stages: [] }, plan: lessonPlan, originalPlan: lessonPlan } }));
        sessionStorage.setItem('allpass.teaching-workflow', JSON.stringify({ version: 2, data: { activeProcess: 'lesson', lessonSnapshot: { plan: lessonPlan }, worksheet: null, assessmentRequest: storedAssessmentRequest, assessment: null, students: storedStudents, submissions: [], records: [] } }));
    }, { lessonPlan: plan, storedAssessmentRequest: assessmentRequest, storedStudents: studentRoster });
});

test('지도안에서 세특까지 두 학생의 5단계 흐름을 완주한다', async ({ page }, testInfo) => {
    let ocrCalls = 0;
    const uploadedPageCounts = [];
    const uploadedVisualModes = [];
    await page.route('**/api/generate-worksheet', route => route.fulfill({ json: { worksheet: makeWorksheet() } }));
    await page.route('**/api/generate-assessment', route => route.fulfill({ json: { assessment: makeVisualAssessment() } }));
    await page.route('**/api/ocr', async route => {
        uploadedPageCounts.push((await PDFDocument.load(uploadedPdf(route.request()))).getPageCount());
        uploadedVisualModes.push(uploadedFormValue(route.request(), 'visualAnalysis'));
        ocrCalls += 1;
        if (ocrCalls === 2) return route.fulfill({ status: 422, json: { message: '첫 시도에서 문서를 읽지 못했습니다.' } });
        return route.fulfill({ json: { extractedText: '관찰 결과 뿌리에 가는 털이 있다. 뿌리는 물을 흡수한다. 줄기는 물질을 운반한다.', elements: [{ id: 'root-evidence', category: 'paragraph', page: 1, text: '뿌리에 가는 털이 있다', confidence: .98, coordinates: [{ x: .12, y: .2 }, { x: .72, y: .35 }] }], ocrModel: 'document-parse', pageCount: 1 } });
    });
    await page.route('**/api/grade-submission', route => route.fulfill({ json: { grading } }));
    await page.route('**/api/generate-record', route => route.fulfill({ json: { record: { text: recordText } } }));

    await page.goto('/');
    await page.getByRole('tab', { name: /학습지/ }).click();
    await page.getByRole('button', { name: '학습지 생성하기' }).click();
    await expect(page.getByLabel('학습지 제목')).toHaveValue('식물의 구조와 기능 탐구 학습지');

    await page.getByRole('tab', { name: /수행평가/ }).click();
    await page.getByLabel('이 평가를 마친 학생이 무엇을 이해하고, 스스로 해낼 수 있길 바라나요?').fill('식물 기관의 구조와 기능을 관찰 근거로 설명한다.');
    await page.getByLabel('평가 이름').fill('식물 기관 탐구 수행평가');
    await page.getByRole('button', { name: '수행평가 생성하기' }).click();
    await expect(page.getByLabel('과제명')).toHaveValue('식물 기관 탐구 보고서 만들기');
    await page.getByRole('button', { name: '수행평가·루브릭 확인 완료' }).click();

    await page.getByRole('tab', { name: /OCR·채점/ }).click();
    await page.getByRole('radio', { name: '명단 순서 합본 PDF' }).click();
    await page.getByRole('checkbox', { name: '각 학생 묶음 첫 페이지가 수행평가 안내 표지' }).click();
    await page.getByLabel('명단 순서 합본 PDF 파일').setInputFiles({ name: '2반-수행평가.pdf', mimeType: 'application/pdf', buffer: await combinedSubmissionPdf() });
    await expect(page.getByText('예상 4쪽 · 실제 4쪽')).toBeVisible();
    await page.getByRole('button', { name: '학생별 PDF 묶음 만들기' }).click();
    await page.getByRole('button', { name: '연결한 답안 PDF OCR 시작' }).click();
    await expect(page.getByText('첫 시도에서 문서를 읽지 못했습니다.')).toBeVisible();
    await page.getByRole('button', { name: /OCR 다시 시도/ }).click();
    await expect(page.getByLabel('OCR 추출 원문')).toHaveCount(2);
    expect(uploadedPageCounts).toEqual([1, 1, 1]);
    expect(uploadedVisualModes).toEqual(['true', 'true', 'true']);

    for (const studentName of ['김학생', '이학생']) {
        await page.getByRole('button', { name: `${studentName} 채점하기` }).click();
        const submission = page.locator('.submission-item').filter({ has: page.getByRole('button', { name: `${studentName} 삭제` }) });
        await expect(submission.getByRole('spinbutton', { name: 'PDF 페이지' })).toHaveValue('2');
        if (testInfo.project.name === 'mobile') await submission.getByRole('tab', { name: '채점 결과' }).click();
        await submission.getByRole('button', { name: '뿌리에 가는 털이 있다 원본에서 보기' }).click();
        await expect(submission.getByTestId('evidence-highlight')).toBeVisible();
        await submission.getByRole('button', { name: '이전 페이지' }).click();
        await expect(submission.getByTestId('evidence-highlight')).toHaveCount(0);
        await submission.getByRole('spinbutton', { name: 'PDF 페이지' }).fill('2');
        await expect(submission.getByTestId('evidence-highlight')).toHaveCount(0);
        if (testInfo.project.name === 'mobile') await submission.getByRole('tab', { name: '채점 결과' }).click();
        await expect(submission.getByRole('button', { name: `${studentName} 채점 승인` })).toBeDisabled();
        await submission.getByLabel(`${studentName} 원본 답안 확인 완료`).check();
        await expect(submission.getByRole('button', { name: `${studentName} 채점 승인` })).toBeEnabled();
        await submission.getByRole('button', { name: `${studentName} 채점 승인` }).click();
    }

    await page.getByRole('tab', { name: /세특/ }).click();
    await page.getByRole('button', { name: '미생성 학생 전체 생성' }).click();
    await expect(page.getByLabel('세특 초안')).toHaveCount(2);
    await expect(page.getByText(`${recordText.length}자 / 500자`)).toHaveCount(2);

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.map(item => item.id)).toEqual([]);
});
