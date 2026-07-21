import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { makeGeneratedPlan } from '../tests/fixtures/lesson-plan.mjs';
import { makeAssessment } from '../tests/fixtures/workflow.mjs';
import { createAssessmentFallback } from '../lib/assessment-fallback.js';
import { sourceHash } from '../lib/source-hash.js';

async function downloadBytes(page, action) {
    const downloadPromise = page.waitForEvent('download');
    await action();
    const download = await downloadPromise;
    return { bytes: await readFile(await download.path()), filename: download.suggestedFilename() };
}

test.beforeEach(async ({ page }) => {
    const lessonPlan = makeGeneratedPlan();
    const assessment = { ...makeAssessment(), sourceHash: sourceHash(lessonPlan), approved: false };
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
        assessmentApproachId: assessment.generationSettings.assessmentApproachId,
    };
    await page.addInitScript(({ plan, storedAssessment, storedAssessmentRequest }) => {
        sessionStorage.clear();
        sessionStorage.setItem('allpass.teaching-workflow', JSON.stringify({
            version: 3,
            data: {
                activeProcess: 'assessment',
                lessonSnapshot: { plan },
                worksheet: null,
                assessmentRequest: storedAssessmentRequest,
                assessment: storedAssessment,
                students: [],
                submissions: [],
                records: [],
            },
        }));
    }, { plan: lessonPlan, storedAssessment: assessment, storedAssessmentRequest: assessmentRequest });
});

test('실제적 수행과제는 배운 내용의 실제 상황 적용을 쉬운 말로 안내한다', async ({ page }) => {
    await page.goto('/');

    await page.getByText('세부 설정', { exact: true }).click();
    await page.getByRole('radio', { name: /실제적 수행과제/ }).click();
    await expect(page.locator('.assessment-approach-picker__selected')).toContainText('학생이 실제와 비슷한 역할과 상황에서 배운 지식과 기능을 적용하는 평가예요.');
});

test('AI 복구용 루브릭도 수준별 관찰 가능한 수행 기술을 편집 표에 구분해 보여준다', async ({ page }) => {
    const lessonPlan = makeGeneratedPlan();
    const base = makeAssessment();
    const assessmentRequest = {
        assessmentName: base.assessmentName,
        teacherIntent: base.backwardDesign.teacherIntent,
        totalPoints: base.totalPoints,
        levelCount: base.rubric.levels.length,
        includeProcessInScore: base.scoring.includeProcessInScore,
        processWeightPercent: base.scoring.processWeightPercent,
        outputTypes: base.generationSettings.outputTypes,
        answerTypes: base.generationSettings.answerTypes,
        stages: base.generationSettings.stages,
        visualAnalysisRequired: base.visualAnalysisRequired,
        includeStudentCover: base.includeStudentCover,
        additionalRequirements: base.generationSettings.additionalRequirements,
        assessmentApproachId: base.generationSettings.assessmentApproachId,
    };
    const assessment = { ...createAssessmentFallback(lessonPlan, assessmentRequest), sourceHash: sourceHash(lessonPlan), approved: false };
    await page.addInitScript(({ plan, storedAssessment, storedAssessmentRequest }) => {
        sessionStorage.setItem('allpass.teaching-workflow', JSON.stringify({
            version: 3,
            data: {
                activeProcess: 'assessment', lessonSnapshot: { plan }, worksheet: null,
                assessmentRequest: storedAssessmentRequest, assessment: storedAssessment,
                students: [], submissions: [], records: [],
            },
        }));
    }, { plan: lessonPlan, storedAssessment: assessment, storedAssessmentRequest: assessmentRequest });

    await page.goto('/');

    const firstCriterion = assessment.rubric.criteria[0];
    const criterionCard = page.locator('.rubric-criterion-card').first();
    await expect(criterionCard.locator('.rubric-level-grid')).toBeVisible();
    for (const [index, level] of firstCriterion.levels.entries()) {
        await expect(criterionCard.getByLabel('수행 기술').nth(index)).toHaveValue(level.description);
    }
    expect(await page.locator('textarea').evaluateAll(elements => elements.map(element => element.value))).not.toContain('해당 수준의 관찰 가능한 수행 기술');
});

test('교사가 수정한 루브릭을 네 형식의 실제 파일로 내려받는다', async ({ page }, testInfo) => {
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto('/');

    const panel = page.getByRole('group', { name: '루브릭 다운로드' });
    await expect(panel).toBeVisible();
    await page.getByRole('group', { name: '1. 관찰 근거' }).getByLabel('영역명').fill('교사가 고친 관찰 근거');
    await expect(page.getByRole('button', { name: '루브릭 HWPX 저장' })).toBeEnabled();

    for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await panel.scrollIntoViewIfNeeded();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        await panel.screenshot({ path: testInfo.outputPath(`rubric-download-${width}.png`) });
    }
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.map(item => item.id)).toEqual([]);

    const pdf = await downloadBytes(page, () => page.getByRole('button', { name: '루브릭 PDF 저장' }).click());
    expect(pdf.filename).toMatch(/\.pdf$/);
    expect(Buffer.from(pdf.bytes).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBeGreaterThan(0);

    const hwpx = await downloadBytes(page, () => page.getByRole('button', { name: '루브릭 HWPX 저장' }).click());
    expect(hwpx.filename).toMatch(/\.hwpx$/);
    const hwpxZip = await JSZip.loadAsync(hwpx.bytes);
    expect(await hwpxZip.file('mimetype').async('string')).toBe('application/hwp+zip');
    expect(await hwpxZip.file('Contents/section0.xml').async('string')).toContain('교사가 고친 관찰 근거');

    const docx = await downloadBytes(page, () => page.getByRole('button', { name: '루브릭 DOCX 저장' }).click());
    expect(docx.filename).toMatch(/\.docx$/);
    const docxZip = await JSZip.loadAsync(docx.bytes);
    expect(await docxZip.file('word/document.xml').async('string')).toContain('교사가 고친 관찰 근거');

    const xlsx = await downloadBytes(page, () => page.getByRole('button', { name: '루브릭 Excel 저장' }).click());
    expect(xlsx.filename).toMatch(/\.xlsx$/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.bytes);
    expect(workbook.getWorksheet('루브릭').getCell('A6').value).toContain('교사가 고친 관찰 근거');
    expect(consoleErrors).toEqual([]);
});
