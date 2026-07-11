import { expect, test } from '@playwright/test';

test('검색어가 바뀌면 늦게 도착한 이전 AI 추천을 무시한다', async ({ page }) => {
    // Given query A has an unresolved recommendation request
    let releaseFirst;
    let markFirstStarted;
    const firstStarted = new Promise(resolve => { markFirstStarted = resolve; });
    const firstReleased = new Promise(resolve => { releaseFirst = resolve; });
    await page.route('**/api/recommend-standards', async route => {
        const { query } = route.request().postDataJSON();
        if (query !== '빛의 성질') {
            markFirstStarted();
            await firstReleased;
            await route.fulfill({ json: { recommendations: [{ code: '6과11-02', text: '식물의 구조와 기능', reason: '오래된 A 추천' }] } });
            return;
        }
        await route.fulfill({ json: { recommendations: [{ code: '6과02-01', text: '빛의 성질', reason: '현재 B 추천' }] } });
    });
    await page.goto('/');
    await page.getByLabel('학교급').selectOption('elementary');
    await page.getByLabel('학년').selectOption('6');
    await page.getByLabel('과목').selectOption('과학');
    await page.getByLabel('수업할 개념 및 내용').fill('식물의 구조와 기능을 관찰한다.');
    await page.getByRole('button', { name: /성취기준 찾기/ }).click();
    await page.getByRole('button', { name: 'AI로 추천받기' }).click();
    await firstStarted;

    // When query B replaces query A before A resolves
    await page.getByLabel('성취기준 검색').fill('빛의 성질');
    releaseFirst();

    // Then B direct results remain clean and B can request its own recommendation
    await expect(page.getByText('6과02-01')).toBeVisible();
    await expect(page.getByText('오래된 A 추천')).toHaveCount(0);
    await expect(page.locator('.recommendation-note')).toHaveCount(0);
    await expect(page.locator('.standards-step .form-alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'AI로 추천받기' })).toBeEnabled();
    await page.getByRole('button', { name: 'AI로 추천받기' }).click();
    await expect(page.getByText('현재 B 추천')).toBeVisible();
});
