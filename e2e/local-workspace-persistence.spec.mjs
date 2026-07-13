import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
    await page.reload();
});

test('수업 초안을 로컬에 보관하고 새 작업 시작으로 안전하게 비운다', async ({ page }) => {
    const intent = '로컬 저장소 유지 확인 수업';
    await page.getByLabel('수업할 개념 및 내용').fill(intent);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('allpass.lesson-plan') || 'null')?.data?.basics?.intent)).toBe(intent);

    await page.reload();
    await expect(page.getByLabel('수업할 개념 및 내용')).toHaveValue(intent);

    await page.getByRole('button', { name: '새 작업 시작' }).click();
    await expect(page.getByRole('alertdialog', { name: '새 작업 시작 확인' })).toContainText('이 작업은 되돌릴 수 없습니다.');
    await page.getByRole('button', { name: '취소' }).click();
    await expect(page.getByLabel('수업할 개념 및 내용')).toHaveValue(intent);

    await page.getByRole('button', { name: '새 작업 시작' }).click();
    await page.getByRole('button', { name: '모든 작업 지우고 새로 시작' }).click();
    await page.reload();
    await expect(page.getByLabel('수업할 개념 및 내용')).toHaveValue('');
    await page.waitForTimeout(350);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('allpass.lesson-plan'))).toBeNull();
});
