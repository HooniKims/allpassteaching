import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import { sourceHash } from '../lib/source-hash.js';
import { makeGeneratedPlan } from '../tests/fixtures/lesson-plan.mjs';
import { makeWorksheet } from '../tests/fixtures/workflow.mjs';

const evidenceDir = process.env.TASK_EVIDENCE_DIR ?? 'test-results/worksheet-authoring';

test.beforeEach(async ({ page }) => {
    const lessonPlan = makeGeneratedPlan();
    const worksheet = { ...makeWorksheet(), sourceHash: sourceHash(lessonPlan) };
    await page.addInitScript(({ plan, storedWorksheet }) => {
        sessionStorage.clear();
        sessionStorage.setItem('allpass.teaching-workflow', JSON.stringify({
            version: 2,
            data: { activeProcess: 'worksheet', lessonSnapshot: { plan }, worksheet: storedWorksheet, assessment: null, submissions: [], records: [] },
        }));
    }, { plan: lessonPlan, storedWorksheet: worksheet });
});

test('교사가 성취기준을 유지하며 혼합형 학습지를 편집하고 학생용·교사용 PDF를 분리한다', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto('/');

    await page.getByLabel('문항 1 유형').selectOption('multiple-choice-5');
    for (let index = 1; index <= 5; index += 1) await page.getByLabel(`문항 1 선택지 ${index}`).fill(`관찰 선택지 ${index}`);
    await page.getByRole('button', { name: '문항 1 복제' }).click();
    await page.getByLabel('문항 2 유형').selectOption('table-chart');
    await page.getByLabel('문항 2 응답 상자 높이').fill('180');
    await expect(page.getByRole('textbox', { name: '문항 2', exact: true })).toHaveValue('식물의 각 기관은 어떤 일을 할까요?');
    await expect(page.getByLabel('문항 1 [6과11-02] 연결')).toBeChecked();

    for (const width of [375, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(page.getByRole('heading', { name: '수업 흐름에 맞는 학습지를 만들어요' })).toBeVisible();
        expect(await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))).toEqual({ scrollWidth: width, innerWidth: width });
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(axe.violations.map(item => item.id), JSON.stringify(axe.violations, null, 2)).toEqual([]);
        await page.screenshot({ path: path.join(evidenceDir, `task-4-worksheet-${width}.png`), fullPage: true });
    }

    const studentDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '학생용 PDF' }).click();
    const studentPath = path.join(evidenceDir, 'task-4-worksheet-student.pdf');
    await (await studentDownload).saveAs(studentPath);
    const teacherDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '교사용 PDF' }).click();
    const teacherPath = path.join(evidenceDir, 'task-4-worksheet-teacher.pdf');
    await (await teacherDownload).saveAs(teacherPath);

    const studentPdf = await PDFDocument.load(await readFile(studentPath));
    const teacherPdf = await PDFDocument.load(await readFile(teacherPath));
    expect(studentPdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(teacherPdf.getPageCount()).toBeGreaterThan(studentPdf.getPageCount());
    expect(consoleErrors).toEqual([]);
});
