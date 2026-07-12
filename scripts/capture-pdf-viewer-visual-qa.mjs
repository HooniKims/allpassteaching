import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { makeGeneratedPlan } from '../tests/fixtures/lesson-plan.mjs';
import { makeAssessment } from '../tests/fixtures/workflow.mjs';
import { sourceHash } from '../lib/source-hash.js';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3210';
const outputDirectory = path.resolve(process.env.VISUAL_QA_OUTPUT_DIR || '.omo/evidence/task-9-visual');
const viewports = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 900 },
];
const students = [
    { id: 'student-1', grade: '2', className: '3', number: 1, name: '김하늘' },
    { id: 'student-2', grade: '2', className: '3', number: 2, name: '이바다' },
];

async function syntheticPacket() {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (const [index, label] of ['STUDENT A COVER', 'STUDENT A ANSWER', 'STUDENT B COVER', 'STUDENT B ANSWER'].entries()) {
        const page = document.addPage([600, 800]);
        page.drawText(label, { x: 64, y: 710, size: 24, font, color: rgb(.18, .19, .18) });
        page.drawRectangle({ x: 72, y: 420, width: 430, height: 150, borderWidth: 2, borderColor: rgb(.09, .44, .36) });
        page.drawText(index % 2 === 0 ? 'Assessment guide and rubric' : 'Observation evidence: x^2 = 4', { x: 96, y: 500, size: 18, font });
    }
    return Buffer.from(await document.save());
}

function grading() {
    return {
        criteria: [
            { criterionId: 'criterion-1', score: 35, evidence: '관찰 근거', feedback: '근거를 확인했습니다.' },
            { criterionId: 'criterion-2', score: 35, evidence: '기능 설명', feedback: '관계를 설명했습니다.' },
            { criterionId: 'criterion-3', score: 15, evidence: '수정 과정', feedback: '수정 과정을 확인했습니다.' },
        ],
        totalScore: 85,
        summary: '관찰 근거를 활용했습니다.',
        nextSteps: '다른 기관에도 적용합니다.',
    };
}

function workflow() {
    const plan = makeGeneratedPlan();
    const assessment = { ...makeAssessment(), approved: true, sourceHash: sourceHash(plan) };
    return { activeProcess: 'grading', lessonSnapshot: { plan }, worksheet: null, assessmentRequest: {}, assessment, students, submissions: [], records: [] };
}

function itemFor(page, studentName) {
    return page.locator('.submission-item').filter({ has: page.getByRole('button', { name: `${studentName} 삭제` }) });
}

async function diagnostics(page) {
    const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) }));
    const metrics = await page.evaluate(() => {
        const visible = [...document.querySelectorAll('button,input,select,textarea,a')].filter(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        });
        const submissionTabs = document.querySelector('.submission-review-tabs');
        return {
            documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            submissionTabsTop: submissionTabs ? getComputedStyle(submissionTabs).top : 'not-rendered',
            loadingStatuses: document.querySelectorAll('.pdf-viewer-status').length,
            busyViewports: [...document.querySelectorAll('.pdf-page-viewport')].filter(element => element.getAttribute('aria-busy') !== 'false').length,
            clippedControls: visible.filter(element => {
                const rect = element.getBoundingClientRect();
                return !element.closest('.pdf-page-viewport') && !element.closest('.process-rail') && (rect.left < -1 || rect.right > innerWidth + 1);
            }).map(element => element.getAttribute('aria-label') || element.textContent.trim()),
            shortTouchTargets: visible.filter(element => ['BUTTON', 'A'].includes(element.tagName) && element.getBoundingClientRect().height < 43.5)
                .map(element => ({ name: element.getAttribute('aria-label') || element.textContent.trim(), height: element.getBoundingClientRect().height })),
        };
    });
    return { violations, metrics };
}

async function waitForViewersSettled(page) {
    await page.waitForFunction(() => document.querySelectorAll('.pdf-viewer-status').length === 0
        && [...document.querySelectorAll('.pdf-page-viewport')].every(element => element.getAttribute('aria-busy') === 'false'));
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch();
const evidence = [];
for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.addInitScript(stored => {
        if (!sessionStorage.getItem('allpass.teaching-workflow')) sessionStorage.setItem('allpass.teaching-workflow', JSON.stringify({ version: 3, data: stored }));
    }, workflow());
    await page.route('**/api/ocr', route => {
        const isSecond = route.request().postDataBuffer().toString('latin1').includes('student-2');
        const missingCoordinates = isSecond;
        return route.fulfill({ json: {
            extractedText: '관찰 근거와 기능 설명 및 수정 과정을 충분히 기록한 학생 제출 내용입니다.',
            elements: [{ id: 'visual-1', category: missingCoordinates ? 'chart' : 'equation', page: 1, text: '관찰 근거', confidence: .72, coordinates: missingCoordinates ? [] : [{ x: .13, y: .28 }, { x: .82, y: .48 }] }],
            elementsTruncated: false, ocrModel: 'synthetic-qa', ocrMode: 'enhanced', pageCount: 1, requiresVisualReview: true, reviewState: 'teacher_review', autoScoreAllowed: false,
        } });
    });
    await page.route('**/api/grade-submission', route => route.fulfill({ json: { grading: grading() } }));
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    const coverCheckbox = page.getByRole('checkbox', { name: '각 개별 PDF의 첫 페이지가 이 학생의 수행평가 안내 표지' });
    await coverCheckbox.scrollIntoViewIfNeeded();
    const coverCopyMetrics = await coverCheckbox.locator('..').evaluate(label => {
        const copy = label.querySelector('.pdf-cover-check__copy');
        const phrase = copy?.querySelector('.nowrap');
        if (!copy || !phrase) return { wrapperPresent: false, phraseFitsCopy: false, phraseWhiteSpace: '' };
        const copyRect = copy.getBoundingClientRect();
        const phraseRect = phrase.getBoundingClientRect();
        return { wrapperPresent: true, phraseFitsCopy: phraseRect.left >= copyRect.left - 1 && phraseRect.right <= copyRect.right + 1, phraseWhiteSpace: getComputedStyle(phrase).whiteSpace };
    });
    const coverPath = path.join(outputDirectory, `${viewport.name}-cover-checkbox.png`);
    await page.screenshot({ path: coverPath, fullPage: true });
    evidence.push({ viewport, state: 'cover-checkbox', screenshotPath: coverPath, ...coverCopyMetrics, ...(await diagnostics(page)), consoleErrors: [...consoleErrors] });
    await page.getByRole('radio', { name: '명단 순서 합본 PDF' }).click();
    await page.getByRole('checkbox', { name: '각 학생 묶음 첫 페이지가 수행평가 안내 표지' }).click();
    await page.getByLabel('명단 순서 합본 PDF 파일').setInputFiles({ name: 'synthetic-two-students.pdf', mimeType: 'application/pdf', buffer: await syntheticPacket() });
    await page.getByRole('button', { name: '학생별 PDF 묶음 만들기' }).click();
    await page.getByRole('button', { name: '연결한 답안 PDF OCR 시작' }).click();
    await page.getByLabel('OCR 추출 원문').first().waitFor();
    for (const student of students) await page.getByRole('button', { name: `${student.name} 채점하기` }).click();

    const first = itemFor(page, '김하늘');
    const second = itemFor(page, '이바다');
    if (viewport.width <= 900) {
        await first.getByRole('tab', { name: '채점 결과' }).click();
        await second.getByRole('tab', { name: '채점 결과' }).click();
    }
    await first.getByRole('button', { name: '관찰 근거 원본에서 보기' }).click();
    await page.waitForFunction(() => document.activeElement?.classList.contains('pdf-page-viewport') === true);
    const firstFocusMoved = await first.locator('.pdf-page-viewport').evaluate(element => element === document.activeElement);
    await first.getByTestId('evidence-highlight').waitFor();
    await first.getByRole('button', { name: '이전 페이지' }).click();
    await first.getByTestId('evidence-highlight').waitFor({ state: 'detached' });
    const highlightClearedAfterNavigation = await first.getByTestId('evidence-highlight').count() === 0;
    if (viewport.width <= 900) await first.getByRole('tab', { name: '채점 결과' }).click();
    await first.getByRole('button', { name: '관찰 근거 원본에서 보기' }).click();
    await second.getByRole('button', { name: '관찰 근거 원본에서 보기' }).click();
    await page.waitForFunction(() => document.activeElement?.classList.contains('pdf-page-viewport') === true);
    const secondFocusMoved = await second.locator('.pdf-page-viewport').evaluate(element => element === document.activeElement);
    await first.getByTestId('evidence-highlight').waitFor();
    await second.locator('.pdf-source-fallback').getByText('원본 위치 연결 안 됨').waitFor();
    await first.getByRole('button', { name: '확대' }).click();
    await first.getByRole('button', { name: '회전' }).click();
    await first.getByRole('button', { name: '너비 맞춤' }).click();
    await first.getByRole('button', { name: '화면 맞춤' }).click();
    await waitForViewersSettled(page);
    const sourcePath = path.join(outputDirectory, `${viewport.name}-source-links.png`);
    await page.screenshot({ path: sourcePath, fullPage: true });
    evidence.push({ viewport, state: 'source-links', screenshotPath: sourcePath, highlightVisible: await first.getByTestId('evidence-highlight').isVisible(), fallbackVisible: await second.locator('.pdf-source-fallback').isVisible(), firstFocusMoved, secondFocusMoved, highlightClearedAfterNavigation, ...(await diagnostics(page)), consoleErrors: [...consoleErrors] });

    if (viewport.width <= 900) {
        await first.getByRole('tab', { name: 'OCR 결과' }).click();
        await second.getByRole('tab', { name: 'OCR 결과' }).click();
    }
    await waitForViewersSettled(page);
    const badgePath = path.join(outputDirectory, `${viewport.name}-low-confidence.png`);
    await page.screenshot({ path: badgePath, fullPage: true });
    const badgeDiagnostics = await diagnostics(page);
    if (viewport.width <= 900) await first.getByRole('tab', { name: '원본 답안' }).click();
    const fullscreenSupported = await page.evaluate(() => document.fullscreenEnabled === true);
    await first.getByRole('button', { name: '전체 화면' }).click();
    await page.waitForTimeout(200);
    const fullscreenEntered = await page.evaluate(() => document.fullscreenElement?.classList.contains('pdf-evidence-viewer') === true);
    if (fullscreenEntered) await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => document.fullscreenElement == null);
    evidence.push({ viewport, state: 'low-confidence', screenshotPath: badgePath, lowConfidenceCount: await page.getByText('낮은 신뢰도', { exact: true }).count(), teacherReviewCount: await page.getByText('교사 확인 필요', { exact: true }).count(), fullscreenSupported, fullscreenEntered, ...badgeDiagnostics, consoleErrors: [...consoleErrors] });

    await page.waitForTimeout(180);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('원본 PDF 다시 연결', { exact: true }).first().waitFor();
    const refreshPath = path.join(outputDirectory, `${viewport.name}-refresh-reattach.png`);
    await page.screenshot({ path: refreshPath, fullPage: true });
    evidence.push({ viewport, state: 'refresh-reattach', screenshotPath: refreshPath, reattachLinks: await page.getByRole('link', { name: '원본 PDF 다시 연결하기' }).count(), ...(await diagnostics(page)), consoleErrors: [...consoleErrors] });
    await context.close();
}
await browser.close();

const failures = evidence.filter(item => item.violations.length || item.consoleErrors.length || item.metrics.documentOverflow > 1 || item.metrics.clippedControls.length
    || item.metrics.loadingStatuses || item.metrics.busyViewports
    || (item.state !== 'cover-checkbox' && item.viewport.width <= 800 && item.metrics.submissionTabsTop !== '0px')
    || (item.state === 'cover-checkbox' && (!item.wrapperPresent || !item.phraseFitsCopy || item.phraseWhiteSpace !== 'nowrap'))
    || (item.state === 'source-links' && (!item.highlightVisible || !item.fallbackVisible || !item.firstFocusMoved || !item.secondFocusMoved || !item.highlightClearedAfterNavigation))
    || (item.state === 'low-confidence' && (!item.lowConfidenceCount || !item.teacherReviewCount || (item.fullscreenSupported && !item.fullscreenEntered)))
    || (item.state === 'refresh-reattach' && item.reattachLinks !== students.length));
const report = { capturedAt: new Date().toISOString(), baseURL, pageCount: evidence.length, failures, evidence };
await writeFile(path.join(outputDirectory, 'evidence.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pageCount: report.pageCount, outputDirectory, failures }, null, 2));
if (failures.length) process.exitCode = 1;
