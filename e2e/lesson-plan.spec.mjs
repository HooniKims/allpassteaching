import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import { makeGeneratedPlan, makeTwoSessionPlan } from '../tests/fixtures/lesson-plan.mjs';
import { exportAllFormats } from './lesson-plan-export.mjs';

const standard = {
    code: '6과11-02',
    text: '식물이 이루는 세포의 기본 구조를 관찰하고, 식물의 구조와 기능 사이의 관계를 설명할 수 있다.',
    score: 96,
    reason: '식물의 구조와 기능 탐구에 직접 연결됩니다.',
    keyPhrase: '구조와 기능',
};
const metadata = { date: '2026-07-11T09:00', place: '과학실', className: '6학년 1반', teacherName: '김교사' };
const editedValues = {
    teacherQuestion: '구조를 보고 알 수 있는 점은?\n기능과는 어떤 관계일까요?',
    expectedStudentResponse: '관찰한 구조가 기능을 돕는다.',
    assessmentMethod: '관찰 기록지와 구두 설명',
    needsSupportFeedback: '문장 틀로 구조를 먼저 설명한다.',
    meetsFeedback: '구조와 기능의 관계를 증거로 설명한다.',
    exceedsFeedback: '여러 기관의 공통점과 차이점을 비교한다.',
    nextSessionConnection: '다음 학습에서 식물 기관의 기능을 비교한다.',
};
async function checkAccessibility(page) {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length }))).toEqual([]);
    await expect(page.locator('h1')).toHaveCount(1);
}

async function checkLayout(page) {
    const result = await page.evaluate(() => {
        const controls = [...document.querySelectorAll('button, input, select, textarea')].filter(element => {
            const style = getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().width > 0;
        });
        const clipped = controls.filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > window.innerWidth + 1;
        }).map(element => element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName);
        const names = controls.map(element => element.getAttribute('aria-label') || element.labels?.[0]?.textContent?.trim() || element.textContent?.trim()).filter(Boolean);
        return {
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            clipped,
            duplicateNames: names.filter((name, index) => names.indexOf(name) !== index),
            bodyWordBreak: getComputedStyle(document.body).wordBreak,
            actionColumns: document.querySelector('.editor-actions')
                ? getComputedStyle(document.querySelector('.editor-actions')).gridTemplateColumns.split(' ').length
                : null,
        };
    });
    expect(result.overflow).toBeLessThanOrEqual(1);
    expect(result.clipped).toEqual([]);
    expect(result.duplicateNames).toEqual([]);
    expect(result.bodyWordBreak).toBe('keep-all');
    if (await page.evaluate(() => innerWidth <= 480) && result.actionColumns !== null) expect(result.actionColumns).toBe(1);
}

function planFromRequest(requestBody) {
    const source = requestBody.basics.sessions === 1 ? makeGeneratedPlan() : makeTwoSessionPlan();
    return {
        ...source,
        metadata: requestBody.basics.metadata,
        schoolLevel: requestBody.basics.schoolLevel,
        grade: requestBody.basics.grade,
        subject: requestBody.basics.subject,
        standards: requestBody.standards.map(({ code, text }) => ({ code, text })),
        instructionModel: {
            id: requestBody.instructionModel.id,
            name: requestBody.instructionModel.name,
            reason: '관찰과 증거 중심의 탐구 흐름을 반영했습니다.',
        },
    };
}

async function mockApis(page, { failFirstGeneration = false } = {}) {
    let generationCount = 0;
    await page.route('**/api/recommend-standards', route => route.fulfill({ json: { recommendations: [standard], directCandidates: [standard] } }));
    await page.route('**/api/generate-plan', async route => {
        generationCount += 1;
        if (failFirstGeneration && generationCount === 1) {
            await route.fulfill({ status: 503, json: { message: '잠시 후 다시 시도해주세요.' } });
            return;
        }
        await route.fulfill({ json: { plan: planFromRequest(route.request().postDataJSON()) } });
    });
}

async function completeBasics(page, { multi = false } = {}) {
    await page.goto('/');
    await checkAccessibility(page);
    await page.locator('body').press('Tab');
    await expect(page.getByLabel('학교급')).toBeFocused();
    await page.getByLabel('학교급').selectOption('elementary');
    await page.getByLabel('학년').selectOption('6');
    await page.getByLabel('과목').selectOption('과학');
    if (multi) await page.getByLabel('연속 차시 수업').check();
    await page.getByLabel('수업 일시').fill(metadata.date);
    await page.getByLabel('수업 장소').fill(metadata.place);
    await page.getByLabel('대상 학급').fill(metadata.className);
    await page.getByLabel('수업자').fill(metadata.teacherName);
    await page.getByLabel('수업할 개념 및 내용').fill('식물의 구조와 기능을 관찰하고 서로의 관계를 설명한다.');
    await page.getByRole('button', { name: /성취기준 찾기/ }).click();
}

async function selectStandardAndModel(page, testInfo, { expectResult = true } = {}) {
    await page.getByRole('button', { name: 'AI로 추천받기' }).click();
    await expect(page.getByText(standard.reason)).toBeVisible();
    await checkAccessibility(page);
    await page.screenshot({ path: testInfo.outputPath(`standards-${testInfo.project.name}.png`), fullPage: true });
    await page.getByLabel(`${standard.code} ${standard.text}`).check();
    await page.getByRole('button', { name: /수업 모형 선택/ }).click();
    const modelChoice = page.getByLabel('탐구·발견 학습 선택');
    await modelChoice.focus();
    await expect(modelChoice.locator('..')).toHaveCSS('outline-style', 'solid');
    await modelChoice.check();
    await checkAccessibility(page);
    await page.screenshot({ path: testInfo.outputPath(`model-${testInfo.project.name}.png`), fullPage: true });
    await page.getByRole('button', { name: /지도안 생성/ }).click();
    await page.getByRole('button', { name: '지도안 생성하기' }).click();
    if (expectResult) await expect(page.getByRole('table', { name: '1차시 수업 개요' })).toBeVisible();
}

async function editFormalPlan(page) {
    const [firstQuestion, secondQuestion] = editedValues.teacherQuestion.split('\n');
    const question = page.getByLabel('1차시 도입 주요 발문');
    await question.fill(firstQuestion);
    await question.press('End');
    await question.press('Enter');
    await question.type(secondQuestion);
    await expect(question).toHaveValue(editedValues.teacherQuestion);
    await page.getByLabel('1차시 도입 예상 학생 반응').fill(editedValues.expectedStudentResponse);
    await page.getByLabel('1차시 평가 1 평가 방법').fill(editedValues.assessmentMethod);
    await page.getByLabel('1차시 평가 1 도움이 필요한 학생 피드백').fill(editedValues.needsSupportFeedback);
    await page.getByLabel('1차시 평가 1 기대 수준 학생 피드백').fill(editedValues.meetsFeedback);
    await page.getByLabel('1차시 평가 1 심화 수준 학생 피드백').fill(editedValues.exceedsFeedback);
    await page.getByLabel('1차시 후속 학습 및 정리').fill(editedValues.nextSessionConnection);
}

async function captureResponsiveResult(page, testInfo) {
    for (const [width, height] of [[375, 812], [768, 1024], [1280, 900]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.scrollTo(0, 0));
        await checkLayout(page);
        await page.screenshot({ path: testInfo.outputPath(`result-${testInfo.project.name}-${width}.png`), fullPage: true });
    }
}

async function expectPrintPages(page, testInfo, expectedCount, filename) {
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.step-nav')).toBeHidden();
    await expect(page.locator('.plan-editor__header')).toBeHidden();
    await expect(page.locator('.plan-editor__guidance')).toBeHidden();
    const bytes = await page.pdf({ path: testInfo.outputPath(`${testInfo.project.name}-${filename}`), preferCSSPageSize: true, printBackground: true });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(expectedCount);
    await page.emulateMedia({ media: 'screen' });
}

test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.screenshot({ path: testInfo.outputPath(`step1-${testInfo.project.name}.png`), fullPage: true });
});

test('교사가 설정·편집·세 형식 다운로드까지 완주한다', async ({ page }, testInfo) => {
    // Given 성취기준·생성 API만 결정적으로 대체한 한 차시 수업
    await mockApis(page);
    await completeBasics(page);
    await selectStandardAndModel(page, testInfo);

    // When 공식 표의 주요 필드를 편집하고 줄바꿈을 입력한 뒤 새로고침한다
    await expect(page.getByRole('table', { name: '1차시 교수·학습 과정' })).toBeVisible();
    await expect(page.getByRole('table', { name: '1차시 과정중심평가' })).toBeVisible();
    await expect(page.getByText(/학습 목표·준비물·평가·지원 전략·성찰은 전체 차시에 공통 적용/)).toBeVisible();
    await expect(page.getByLabel('1차시 수업 일자')).toHaveValue(metadata.date);
    await expect(page.getByLabel('1차시 수업 장소')).toHaveValue(metadata.place);
    await editFormalPlan(page);
    await checkAccessibility(page);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('내보내기 형식')).toBeFocused();
    await exportAllFormats(page, metadata, editedValues);

    // Then 편집값·접근성·반응형·인쇄 계약이 모두 유지된다
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('allpass.lesson-plan') || 'null')?.data?.plan?.assessment?.[0]?.method)).toBe(editedValues.assessmentMethod);
    await page.reload();
    await expect(page.getByLabel('1차시 수업 일자')).toHaveValue(metadata.date);
    await expect(page.getByLabel('1차시 수업 장소')).toHaveValue(metadata.place);
    await expect(page.getByLabel('1차시 대상 학급')).toHaveValue(metadata.className);
    await expect(page.getByLabel('1차시 수업자')).toHaveValue(metadata.teacherName);
    await expect(page.getByLabel('1차시 도입 주요 발문')).toHaveValue(editedValues.teacherQuestion);
    await expect(page.getByLabel('1차시 도입 예상 학생 반응')).toHaveValue(editedValues.expectedStudentResponse);
    await expect(page.getByLabel('1차시 평가 1 평가 방법')).toHaveValue(editedValues.assessmentMethod);
    await expect(page.getByLabel('1차시 평가 1 도움이 필요한 학생 피드백')).toHaveValue(editedValues.needsSupportFeedback);
    await expect(page.getByLabel('1차시 평가 1 기대 수준 학생 피드백')).toHaveValue(editedValues.meetsFeedback);
    await expect(page.getByLabel('1차시 평가 1 심화 수준 학생 피드백')).toHaveValue(editedValues.exceedsFeedback);
    await expect(page.getByLabel('1차시 후속 학습 및 정리')).toHaveValue(editedValues.nextSessionConnection);
    await captureResponsiveResult(page, testInfo);
    if (testInfo.project.name === 'desktop') await expectPrintPages(page, testInfo, 2, 'browser-print-single.pdf');
});

test('연속 2차시는 두 세트의 공식 문서를 만들고 데스크톱에서 4쪽으로 인쇄된다', async ({ page }, testInfo) => {
    // Given 2차시 연속 수업을 선택한 교사
    await mockApis(page);
    await completeBasics(page, { multi: true });

    // When 성취기준과 수업 모형을 확정해 생성한다
    await selectStandardAndModel(page, testInfo);

    // Then 차시별 2쪽 구조와 연속 차시 새 페이지 계약을 지킨다
    await expect(page.getByRole('table', { name: '2차시 수업 개요' })).toBeVisible();
    await expect(page.getByRole('table', { name: '2차시 교수·학습 과정' })).toBeVisible();
    await expect(page.getByRole('table', { name: '2차시 과정중심평가' })).toBeVisible();
    if (testInfo.project.name === 'desktop') await expectPrintPages(page, testInfo, 4, 'browser-print-two-sessions.pdf');
});

test('생성 오류 후에도 작성 상태를 보존하고 재시도한다', async ({ page }, testInfo) => {
    // Given 첫 생성 요청만 실패하는 일시적 오류
    await mockApis(page, { failFirstGeneration: true });
    await completeBasics(page);
    await selectStandardAndModel(page, testInfo, { expectResult: false });

    // When 이전 단계들을 되짚아보고 동일한 상태로 재시도한다
    await expect(page.getByText('잠시 후 다시 시도해주세요.')).toBeVisible();
    await page.getByRole('button', { name: '이전' }).click();
    await expect(page.getByLabel('탐구·발견 학습 선택')).toBeChecked();
    await page.getByRole('button', { name: '이전' }).click();
    await expect(page.getByText('1개 선택됨')).toBeVisible();
    await page.getByRole('button', { name: '이전' }).click();
    await expect(page.getByLabel('수업 장소')).toHaveValue(metadata.place);
    await page.getByRole('button', { name: /성취기준 찾기/ }).click();
    await page.getByRole('button', { name: /수업 모형 선택/ }).click();
    await page.getByRole('button', { name: /지도안 생성/ }).click();
    await page.getByRole('button', { name: '지도안 생성하기' }).click();

    // Then 재시도 성공 후에도 행정 정보와 선택이 유지된다
    await expect(page.getByRole('table', { name: '1차시 수업 개요' })).toBeVisible();
    await expect(page.getByLabel('1차시 수업자')).toHaveValue(metadata.teacherName);
});

test('성취기준 AI 추천 네트워크 오류 뒤 직접 검색과 재시도가 유지된다', async ({ page }) => {
    // Given AI 추천 요청만 네트워크에서 실패하는 수업 정보
    await page.route('**/api/recommend-standards', route => route.abort('failed'));
    await completeBasics(page);

    // When AI 추천을 요청한다
    await page.getByRole('button', { name: 'AI로 추천받기' }).click();

    // Then 오류를 안내하고 직접 검색 결과와 재시도 버튼을 계속 제공한다
    await expect(page.locator('.standards-step .form-alert')).toContainText('직접 검색은 계속 사용할 수 있어요');
    await expect(page.getByText('6과11-02')).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI로 추천받기' })).toBeEnabled();
});
