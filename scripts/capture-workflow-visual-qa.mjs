import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { makeGeneratedPlan } from '../tests/fixtures/lesson-plan.mjs';
import { makeAssessment, makeWorksheet } from '../tests/fixtures/workflow.mjs';
import { sourceHash } from '../lib/source-hash.js';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3210';
const outputDirectory = path.resolve(process.env.VISUAL_QA_OUTPUT_DIR || 'test-results/visual-qa/five-stage');
const viewports = [{ name: 'mobile', width: 375, height: 812 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1280, height: 900 }];
const processes = ['lesson', 'worksheet', 'assessment', 'grading', 'records'];
await mkdir(outputDirectory, { recursive: true });

const lessonPlan = makeGeneratedPlan();
const lessonSourceHash = sourceHash(lessonPlan);
const worksheet = { ...makeWorksheet(), sourceHash: lessonSourceHash };
const assessment = { ...makeAssessment(), sourceHash: lessonSourceHash, approved: true };
const assessmentRequest = {
    assessmentName: assessment.assessmentName,
    teacherIntent: assessment.backwardDesign.teacherIntent,
    totalPoints: assessment.totalPoints,
    levelCount: assessment.rubric.levels.length,
    includeProcessInScore: assessment.scoring.includeProcessInScore,
    processWeightPercent: assessment.scoring.processWeightPercent,
    outputTypes: assessment.generationSettings.outputTypes,
    answerTypes: assessment.generationSettings.answerTypes,
    stages: assessment.generationSettings.stages,
    visualAnalysisRequired: assessment.visualAnalysisRequired,
    includeStudentCover: assessment.includeStudentCover,
    additionalRequirements: assessment.generationSettings.additionalRequirements,
};
const grading = {
    criteria: [
        { criterionId: 'criterion-1', score: 35, evidence: '뿌리에 가는 털이 있다', feedback: '관찰 근거가 구체적입니다.' },
        { criterionId: 'criterion-2', score: 35, evidence: '뿌리는 물을 흡수한다', feedback: '구조와 기능을 연결했습니다.' },
        { criterionId: 'criterion-3', score: 15, evidence: '관찰 결과', feedback: '수정 이유를 구체적으로 적었습니다.' },
    ], totalScore: 85, summary: '관찰 사실을 기능 설명에 활용했습니다.', nextSteps: '다른 기관도 같은 방식으로 설명해보세요.',
};
const submissions = ['김학생', '이학생'].map((studentName, index) => ({
    id: `student-${index + 1}`, studentName, fileName: `${studentName}.pdf`, status: 'approved',
    extractedText: '관찰 결과 뿌리에 가는 털이 있다. 뿌리는 물을 흡수한다. 줄기는 물질을 운반한다.',
    ocrModel: 'document-parse', pageCount: 1, grading, approved: true,
}));
const recordText = '관찰한 식물 기관의 특징을 구체적으로 기록하고 뿌리의 가는 털과 물 흡수 기능을 근거로 연결하여 설명함. 관찰 사실에서 결론을 이끌어내는 교과 탐구 과정이 드러났으며 다른 기관에도 같은 설명 방식을 적용하려는 학습 방향을 보임.';
const records = submissions.map(submission => ({ submissionId: submission.id, studentName: submission.studentName, sourceHash: sourceHash({ assessment, grading: submission.grading }), status: 'done', text: recordText, approved: true }));
const workflow = { activeProcess: 'lesson', lessonSnapshot: { plan: lessonPlan }, worksheet: null, assessmentRequest, assessment: null, submissions: [], records: [] };
const lessonDraft = { step: 4, maxReached: 4, basics: { schoolLevel: lessonPlan.schoolLevel, grade: lessonPlan.grade, subject: lessonPlan.subject, subjectMode: 'official', displaySubject: lessonPlan.subject, mappedSubjects: [lessonPlan.subject], mode: 'single', sessions: 1, intent: lessonPlan.title, studentNeeds: '', metadata: lessonPlan.metadata }, standards: lessonPlan.standards, instructionModel: lessonPlan.instructionModel, plan: lessonPlan, originalPlan: lessonPlan };

const browser = await chromium.launch();
const evidence = [];
for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    let ocrCalls = 0;
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.addInitScript(({ storedWorkflow, storedLesson }) => {
        sessionStorage.clear();
        sessionStorage.setItem('allpass.teaching-workflow', JSON.stringify({ version: 2, data: storedWorkflow }));
        sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 2, data: storedLesson }));
    }, { storedWorkflow: workflow, storedLesson: lessonDraft });
    await page.route('**/api/generate-worksheet', route => route.fulfill({ json: { worksheet } }));
    await page.route('**/api/generate-assessment', route => route.fulfill({ json: { assessment } }));
    await page.route('**/api/ocr', route => {
        ocrCalls += 1;
        if (ocrCalls > 2) return route.fulfill({ status: 422, json: { message: '문서를 읽지 못했습니다. 아래 버튼으로 재시도하세요.' } });
        return route.fulfill({ json: { extractedText: submissions[0].extractedText, ocrModel: 'document-parse', pageCount: 1 } });
    });
    await page.route('**/api/grade-submission', route => route.fulfill({ json: { grading } }));
    await page.route('**/api/generate-record', route => route.fulfill({ json: { record: { text: recordText } } }));
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.locator('#process-tab-worksheet').click();
    await page.getByRole('button', { name: '학습지 생성하기' }).click();
    await page.getByLabel('학습지 제목').waitFor();
    await page.locator('#process-tab-assessment').click();
    await page.getByRole('button', { name: '수행평가 생성하기' }).click();
    await page.getByLabel('과제명').waitFor();
    await page.getByRole('button', { name: '수행평가·루브릭 확인 완료' }).click();
    await page.locator('#process-tab-grading').click();
    await page.getByLabel('학생 PDF 파일').setInputFiles([
        { name: '김학생.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 student 1') },
        { name: '이학생.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 student 2') },
    ]);
    await page.getByRole('button', { name: '선택한 PDF OCR 시작' }).click();
    await page.getByLabel('OCR 추출 원문').nth(1).waitFor();
    for (const studentName of ['김학생', '이학생']) {
        await page.getByRole('button', { name: `${studentName} 채점하기` }).click();
        await page.getByRole('button', { name: `${studentName} 채점 승인` }).click();
    }
    await page.locator('#process-tab-records').click();
    await page.getByRole('button', { name: '미생성 학생 전체 생성' }).click();
    await page.getByLabel('세특 초안').nth(1).waitFor();

    const capture = async (process, name = process) => {
        await page.locator(`#process-tab-${process}`).click();
        await page.waitForTimeout(120);
        const artifactPath = path.join(outputDirectory, `${viewport.name}-${name}.png`);
        await page.screenshot({ path: artifactPath, fullPage: true });
        const axeViolations = process === 'assessment'
            ? (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, html: node.html })) }))
            : [];
        const metrics = await page.evaluate(() => {
            const visibleControls = [...document.querySelectorAll('button,input,select,textarea')].filter(element => {
                const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
            });
            return {
                h1: [...document.querySelectorAll('h1')].map(element => element.textContent.trim()),
                bodyFont: getComputedStyle(document.body).fontFamily,
                documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                processRailOverflow: document.querySelector('.process-rail')?.scrollWidth - document.querySelector('.process-rail')?.clientWidth,
                rubricGeometry: document.querySelector('.rubric-table-wrap') ? {
                    wrapper: { clientWidth: document.querySelector('.rubric-table-wrap').clientWidth, scrollWidth: document.querySelector('.rubric-table-wrap').scrollWidth, overflowX: getComputedStyle(document.querySelector('.rubric-table-wrap')).overflowX, rect: document.querySelector('.rubric-table-wrap').getBoundingClientRect().toJSON() },
                    table: { clientWidth: document.querySelector('.rubric-editor-table').clientWidth, rect: document.querySelector('.rubric-editor-table').getBoundingClientRect().toJSON() },
                    section: document.querySelector('.rubric-table-wrap').closest('.document-section').getBoundingClientRect().toJSON(),
                } : null,
                clippedControls: visibleControls.filter(element => {
                    if (element.closest('.process-rail')) return false;
                    const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1;
                }).map(element => element.getAttribute('aria-label') || element.textContent.trim() || element.tagName),
            };
        });
        evidence.push({ viewport, process: name, artifactPath, metrics, axeViolations, consoleErrors: [...consoleErrors] });
    };
    await capture('records', 'records-review');
    const recordApprovalButtons = page.getByRole('button', { name: '교사 확인 완료' });
    while (await recordApprovalButtons.count()) await recordApprovalButtons.first().click();
    for (const process of processes) await capture(process);

    await page.locator('#process-tab-grading').click();
    await page.getByLabel('학생 PDF 파일').setInputFiles({ name: '오류학생.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 failed') });
    await page.getByRole('button', { name: '선택한 PDF OCR 시작' }).click();
    await page.getByText('문서를 읽지 못했습니다. 아래 버튼으로 재시도하세요.').waitFor();
    consoleErrors.length = 0;
    await capture('grading', 'grading-error');

    await page.locator('#process-tab-assessment').click();
    await page.getByLabel('과제명').fill('수정된 식물 기관 탐구 보고서');
    await page.getByRole('button', { name: '수행평가·루브릭 확인 완료' }).click();
    await capture('grading', 'grading-stale');

    await page.locator('#process-tab-lesson').click();
    await page.getByRole('button', { name: '입력 수정' }).click();
    await page.getByLabel('수업할 개념 및 내용').fill('변경된 식물 기관 수업 내용');
    await capture('lesson', 'lesson-input-stale');
    await context.close();
}
await browser.close();
await writeFile(path.join(outputDirectory, 'evidence.json'), JSON.stringify({ capturedAt: new Date().toISOString(), baseURL, pageCount: evidence.length, evidence }, null, 2));
console.log(JSON.stringify({ pageCount: evidence.length, outputDirectory, failures: evidence.filter(item => item.metrics.documentOverflow > 1 || item.metrics.clippedControls.length || item.axeViolations.length || item.consoleErrors.length).map(item => ({ viewport: item.viewport.name, process: item.process, metrics: item.metrics, axeViolations: item.axeViolations, consoleErrors: item.consoleErrors })) }, null, 2));
