import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { makeGeneratedPlan } from '../tests/fixtures/lesson-plan.mjs';

const standard = { code: '6과11-02', text: '식물이 이루는 세포의 기본 구조를 관찰하고, 식물의 구조와 기능 사이의 관계를 설명할 수 있다.', score: 96, reason: '식물의 구조와 기능 탐구에 직접 연결됩니다.', keyPhrase: '구조와 기능' };

async function completeBasics(page) {
    await page.goto('/');
    await page.getByLabel('학교급').selectOption('elementary');
    await page.getByLabel('학년').selectOption('6');
    await page.getByLabel('과목').selectOption('과학');
    await page.getByLabel('수업할 개념 및 내용').fill('식물의 구조와 기능을 관찰하고 서로의 관계를 설명한다.');
    await page.getByRole('button', { name: /성취기준 찾기/ }).click();
}

async function mockGeneration(page) {
    await page.route('**/api/recommend-standards', route => route.fulfill({ json: { recommendations: [standard], directCandidates: [standard] } }));
    await page.route('**/api/generate-plan', route => route.fulfill({ json: { plan: makeGeneratedPlan() } }));
}

test('교사가 설정부터 편집 가능한 지도안까지 완주한다', async ({ page }, testInfo) => {
    await mockGeneration(page); await completeBasics(page);
    await page.getByRole('button', { name: 'AI로 추천받기' }).click();
    await page.getByLabel(/6과11-02/).check();
    await page.getByRole('button', { name: /수업 모형 선택/ }).click();
    await page.getByLabel('탐구·발견 학습 선택').check();
    await page.getByRole('button', { name: /지도안 생성/ }).click();
    await page.getByRole('button', { name: '지도안 생성하기' }).click();
    await expect(page.getByLabel('지도안 제목')).toHaveValue('식물의 구조와 기능');
    await page.getByLabel('지도안 제목').fill('식물 관찰 수업');
    await expect(page.getByLabel('지도안 제목')).toHaveValue('식물 관찰 수업');
    await expect(page.getByLabel('내보내기 형식')).toHaveValue('hwpx');
    await page.screenshot({ path: `.omo/evidence/lesson-plan-mvp/result-${testInfo.project.name}.png`, fullPage: true });
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(accessibility.violations).toEqual([]);
});

test('생성 오류 뒤에도 작성 상태를 보존한다', async ({ page }) => {
    await page.route('**/api/recommend-standards', route => route.fulfill({ json: { recommendations: [standard], directCandidates: [standard] } }));
    await page.route('**/api/generate-plan', route => route.fulfill({ status: 503, json: { message: '잠시 후 다시 시도해주세요.' } }));
    await completeBasics(page);
    await page.getByRole('button', { name: 'AI로 추천받기' }).click(); await page.getByLabel(/6과11-02/).check();
    await page.getByRole('button', { name: /수업 모형 선택/ }).click(); await page.getByLabel('탐구·발견 학습 선택').check();
    await page.getByRole('button', { name: /지도안 생성/ }).click(); await page.getByRole('button', { name: '지도안 생성하기' }).click();
    await expect(page.getByText('잠시 후 다시 시도해주세요.')).toBeVisible();
    await page.getByRole('button', { name: '이전' }).click();
    await expect(page.getByLabel('탐구·발견 학습 선택')).toBeChecked();
});
