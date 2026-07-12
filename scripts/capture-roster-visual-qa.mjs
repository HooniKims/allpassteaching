import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { makeGeneratedPlan } from '../tests/fixtures/lesson-plan.mjs';
import { makeAssessment } from '../tests/fixtures/workflow.mjs';
import { sourceHash } from '../lib/source-hash.js';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3210';
const outputDirectory = path.resolve(process.env.VISUAL_QA_OUTPUT_DIR || 'test-results/visual-qa/student-roster');
const invalidWorkbook = process.env.ROSTER_INVALID_WORKBOOK
    ?? '/Volumes/exDisk/vibecoding project/19.allpassteaching/.omo/evidence/task-5-roster-invalid.xlsx';
const viewports = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 900 },
];

await mkdir(outputDirectory, { recursive: true });
const lessonPlan = makeGeneratedPlan();
const assessment = { ...makeAssessment(), approved: true, sourceHash: sourceHash(lessonPlan) };
const students = [
    { id: 'student-1', grade: '2', className: '3', number: 7, name: '김하늘' },
    { id: 'student-2', grade: '2', className: '3', number: 8, name: '이바다' },
    { id: 'student-3', grade: '2', className: '3', number: 9, name: '박별' },
];
const workflow = {
    activeProcess: 'grading',
    lessonSnapshot: { plan: lessonPlan },
    worksheet: null,
    assessmentRequest: {},
    assessment,
    students,
    submissions: [],
    records: [],
};

const browser = await chromium.launch();
const evidence = [];
for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.addInitScript(storedWorkflow => {
        if (!sessionStorage.getItem('allpass.teaching-workflow')) {
            sessionStorage.setItem('allpass.teaching-workflow', JSON.stringify({ version: 2, data: storedWorkflow }));
        }
    }, workflow);
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '채점과 세특에 함께 쓸 학생을 등록해요' }).waitFor();
    const screenshotPath = path.join(outputDirectory, `${viewport.name}-roster.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(item => ({
        id: item.id,
        impact: item.impact,
        nodes: item.nodes.map(node => ({ target: node.target, html: node.html })),
    }));
    const metrics = await page.evaluate(() => {
        const visibleControls = [...document.querySelectorAll('button,input,select,textarea,.student-roster__upload')].filter(element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return element.getAttribute('type') !== 'file' && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
        });
        return {
            documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            rosterRect: document.querySelector('.student-roster').getBoundingClientRect().toJSON(),
            rowCount: document.querySelectorAll('.student-roster__row').length,
            clippedControls: visibleControls.filter(element => {
                if (element.closest('.process-rail')) return false;
                const rect = element.getBoundingClientRect();
                return rect.left < -1 || rect.right > innerWidth + 1;
            }).map(element => element.getAttribute('aria-label') || element.textContent.trim() || element.tagName),
            shortTouchTargets: visibleControls.filter(element => {
                const rect = element.getBoundingClientRect();
                return rect.height < 43.5 || rect.width < 43.5;
            }).map(element => ({ name: element.getAttribute('aria-label') || element.textContent.trim() || element.tagName, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
        };
    });
    evidence.push({ viewport, state: 'roster', screenshotPath, violations, metrics, consoleErrors: [...consoleErrors] });

    if (viewport.name === 'desktop') {
        const dialogWorkflow = { ...workflow, submissions: [{ id: 'submission-linked', studentId: 'student-1', needsStudentLink: false, studentName: '김하늘', fileName: '김하늘.pdf', status: 'pending', extractedText: '', grading: null, approved: false, error: '' }] };
        await page.evaluate(value => sessionStorage.setItem('allpass.teaching-workflow', JSON.stringify({ version: 2, data: value })), dialogWorkflow);
        await page.reload({ waitUntil: 'networkidle' });
        await page.locator('.student-roster').getByRole('button', { name: '김하늘 삭제' }).click();
        const dialog = page.getByRole('alertdialog', { name: '학생 삭제 확인' });
        await dialog.waitFor();
        const dialogScreenshotPath = path.join(outputDirectory, 'desktop-roster-delete-dialog.png');
        await page.screenshot({ path: dialogScreenshotPath });
        evidence.push({
            viewport,
            state: 'linked-delete-dialog',
            screenshotPath: dialogScreenshotPath,
            dialogOpen: await dialog.evaluate(element => element.open),
            activeElement: await page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute('aria-label')),
            violations: (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations.map(item => ({ id: item.id, impact: item.impact })),
            consoleErrors: [...consoleErrors],
        });
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        const rosterCountAfterCancel = await page.locator('.student-roster__row').count();

        await page.evaluate(value => sessionStorage.setItem('allpass.teaching-workflow', JSON.stringify({ version: 2, data: value })), workflow);
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByLabel('학생 명단 Excel 업로드').setInputFiles(invalidWorkbook);
        await page.getByText('명단을 바꾸지 않았습니다. 아래 셀을 확인해주세요.').waitFor();
        const errorScreenshotPath = path.join(outputDirectory, 'desktop-roster-import-error.png');
        await page.screenshot({ path: errorScreenshotPath, fullPage: true });
        evidence.push({
            viewport,
            state: 'atomic-import-error',
            screenshotPath: errorScreenshotPath,
            rosterCountAfterRejectedImport: await page.locator('.student-roster__row').count(),
            issueText: await page.locator('.roster-issues[role="alert"]').innerText(),
            rosterCountAfterDialogCancel: rosterCountAfterCancel,
            consoleErrors: [...consoleErrors],
        });
    }
    await context.close();
}
await browser.close();

const failures = evidence.filter(item => item.violations?.length
    || item.consoleErrors.length
    || item.metrics?.documentOverflow > 1
    || item.metrics?.clippedControls.length
    || item.metrics?.shortTouchTargets.length
    || (item.state === 'linked-delete-dialog' && (!item.dialogOpen || item.violations.length))
    || (item.state === 'atomic-import-error' && item.rosterCountAfterRejectedImport !== students.length));
const report = { capturedAt: new Date().toISOString(), baseURL, pageCount: evidence.length, failures, evidence };
await writeFile(path.join(outputDirectory, 'evidence.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pageCount: report.pageCount, outputDirectory, failures }, null, 2));
if (failures.length) process.exitCode = 1;
