import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { makeGeneratedPlan } from '../tests/fixtures/lesson-plan.mjs';
import { makeAssessment } from '../tests/fixtures/workflow.mjs';
import { PDFDocument } from 'pdf-lib';
import { sourceHash } from '../lib/source-hash.js';

const standard = { code: '6과11-02', text: '식물의 구조와 기능 사이의 관계를 설명할 수 있다.' };
const draft = {
    step: 4,
    maxReached: 4,
    basics: { schoolLevel: 'elementary', grade: '6', subject: '과학', subjectMode: 'official', displaySubject: '과학', mappedSubjects: ['과학'], mode: 'single', sessions: 1, intent: '식물의 구조와 기능', studentNeeds: '', metadata: {} },
    standards: [standard],
    instructionModel: { id: 'inquiry', name: '탐구·발견 학습', stages: [] },
};

test.beforeEach(async ({ page }) => {
    await page.addInitScript(stored => {
        sessionStorage.clear();
        sessionStorage.setItem('allpass.lesson-plan', JSON.stringify({ version: 1, data: stored }));
    }, draft);
});

test('빠른 작업은 숨기고 느린 작업의 예상 진행률·취소를 정직하게 표시한다', async ({ page }, testInfo) => {
    let call = 0;
    let releaseSlowRoute;
    const slowRouteReleased = new Promise(resolve => { releaseSlowRoute = resolve; });
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.route('**/api/generate-plan', async route => {
        const currentCall = ++call;
        const delay = currentCall === 1 ? 50 : currentCall === 5 ? 7_000 : 3_000;
        await new Promise(resolve => setTimeout(resolve, delay));
        if (currentCall === 5) releaseSlowRoute();
        await route.fulfill({ json: { plan: { ...makeGeneratedPlan(), title: `진행 검증 지도안 ${currentCall}`, standards: [standard] } } });
    });
    await page.goto('/');

    await page.getByRole('button', { name: '지도안 생성하기' }).click();
    await expect(page.getByLabel('1차시 수업 제목')).toHaveValue('진행 검증 지도안 1');
    await expect(page.getByTestId('operation-overlay')).toHaveCount(0);

    for (const width of [375, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.getByRole('button', { name: '지도안 다시 생성' }).click();
        const dialog = page.getByRole('dialog', { name: '수업 지도안 생성' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('status', { name: '작업 진행 상태' })).toContainText('AI가 생성 중입니다.');
        const dialogText = await dialog.textContent();
        expect(dialogText).not.toMatch(/Upstage|비용|요금|5초 뒤|예상 시간|남음|처리 중/);
        expect(dialogText).toMatch(/예상 진행률 \d+%/);
        expect(await dialog.getByRole('progressbar', { name: '예상 진행률' }).count()).toBe(1);
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(axe.violations.map(item => item.id)).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`operation-progress-${width}.png`), fullPage: true });
        await expect(dialog).toBeHidden();
    }

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '지도안 다시 생성' }).click();
    const cancelDialog = page.getByRole('dialog', { name: '수업 지도안 생성' });
    await expect(cancelDialog).toBeVisible();
    const reducedTransitionSeconds = await cancelDialog.locator('.operation-progress > span').evaluate(element => Number.parseFloat(getComputedStyle(element).transitionDuration));
    expect(reducedTransitionSeconds).toBeLessThan(0.001);
    await page.keyboard.press('Escape');
    await expect(cancelDialog).toBeVisible();
    await expect(page.getByText(/작업을 취소했습니다/)).toHaveCount(0);
    await expect(cancelDialog.getByRole('button', { name: '작업 취소' })).toBeVisible({ timeout: 6_000 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(cancelDialog).toBeHidden();
    await expect(page.getByText(/작업을 취소했습니다/)).toBeVisible();
    await expect(page.getByText(/작업을 취소했습니다/)).toHaveCount(1);
    await expect(page.getByRole('button', { name: '지도안 다시 생성' })).toBeFocused();
    await page.screenshot({ path: `/Volumes/exDisk/vibecoding project/19.allpassteaching/.omo/evidence/task-12-escape-fix-${testInfo.project.name}.png`, fullPage: true });
    await slowRouteReleased;
    await expect(page.getByLabel('1차시 수업 제목')).toHaveValue('진행 검증 지도안 4');
    expect(consoleErrors).toEqual([]);
});

test('두 학생 OCR은 실제 완료 수를 표시하고 취소 뒤 실패 학생만 다시 처리한다', async ({ page }) => {
    const lessonPlan = makeGeneratedPlan();
    const assessment = { ...makeAssessment(), approved: true, sourceHash: sourceHash(lessonPlan) };
    const students = [
        { id: 'student-a', grade: '6', className: '1', number: 1, name: '김학생' },
        { id: 'student-b', grade: '6', className: '1', number: 2, name: '이학생' },
    ];
    await page.addInitScript(({ plan, storedAssessment, roster }) => {
        sessionStorage.setItem('allpass.teaching-workflow', JSON.stringify({ version: 3, data: {
            activeProcess: 'grading', lessonSnapshot: { plan }, worksheet: null, assessmentRequest: null,
            assessment: storedAssessment, students: roster, submissions: [], records: [],
        } }));
    }, { plan: lessonPlan, storedAssessment: assessment, roster: students });
    let ocrCall = 0;
    let releaseSecondOriginal;
    const secondOriginalReleased = new Promise(resolve => { releaseSecondOriginal = resolve; });
    await page.route('**/api/ocr', async route => {
        const currentCall = ++ocrCall;
        if (currentCall === 1) await new Promise(resolve => setTimeout(resolve, 1_300));
        if (currentCall === 2) {
            await new Promise(resolve => setTimeout(resolve, 7_000));
            releaseSecondOriginal();
        }
        await route.fulfill({ json: {
            extractedText: `학생 ${currentCall}의 관찰 근거와 구조·기능 설명 및 수정 과정이 충분히 기록된 답안입니다.`,
            elements: [], elementsTruncated: false, visualAnalysisStatus: 'not_requested', autoScoreAllowed: true,
            ocrModel: 'document-parse', pageCount: 1,
        } });
    });
    const pdfDocument = await PDFDocument.create();
    pdfDocument.addPage([300, 400]);
    pdfDocument.addPage([300, 400]);
    const pdf = Buffer.from(await pdfDocument.save());
    await page.goto('/');
    await page.getByRole('radio', { name: '명단 순서 합본 PDF' }).click();
    await page.getByLabel('명단 순서 합본 PDF 파일').setInputFiles({ name: '두학생.pdf', mimeType: 'application/pdf', buffer: pdf });
    await expect(page.getByText('예상 2쪽 · 실제 2쪽')).toBeVisible();
    await page.getByRole('button', { name: '학생별 PDF 묶음 만들기' }).click();
    await page.getByRole('button', { name: '연결한 답안 PDF OCR 시작' }).click();
    const dialog = page.getByRole('dialog', { name: '학생 답안 OCR 분석' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('progressbar', { name: '실제 진행률' })).toHaveAttribute('aria-valuenow', '50');
    await expect(dialog).toContainText('1/2명 완료 · 성공 1명 · 실패 0명 · 대기 1명');
    await expect(dialog).toContainText('50%');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    for (const width of [375, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        await page.screenshot({ path: `/Volumes/exDisk/vibecoding project/19.allpassteaching/.omo/evidence/task-12-progress-batch-${width}.png` });
    }
    await expect(dialog.getByRole('button', { name: '작업 취소' })).toBeVisible({ timeout: 6_000 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('OCR 추출 원문')).toHaveCount(1);
    await page.getByRole('button', { name: '이학생 OCR 다시 시도' }).click();
    await expect(page.getByLabel('OCR 추출 원문')).toHaveCount(2);
    await secondOriginalReleased;
    await expect(page.getByLabel('OCR 추출 원문').nth(1)).toHaveValue(/학생 3의 관찰 근거/);
    expect(ocrCall).toBe(3);
});
