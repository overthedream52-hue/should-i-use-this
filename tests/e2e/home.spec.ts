import { test, expect } from '@playwright/test';
test('home starts with URL comparison and makes no automatic analysis requests', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/')) calls.push(new URL(r.url()).pathname); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /이 도구나 서비스/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ForNerds 공개 예시', exact: true })).toBeVisible();
  await expect(page.getByText(/입력은 서버로 자동 전송되지 않습니다/)).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '내 AI 환경 연결', exact: true })).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(calls).toEqual([]);
  await page.getByRole('button', { name: 'ForNerds 공개 예시', exact: true }).click();
  await page.getByRole('button', { name: '비교 자료 준비', exact: true }).click();
  await expect(page.getByRole('button', { name: '조사 요청 복사', exact: true })).toBeVisible();
  expect(calls).toEqual([]);
});
test('subscription bookmark stays compatible', async ({ page }) => {
  await page.goto('/subscription');
  await expect(page.getByRole('heading', { name: '이 도구, 나에게 필요할까요?', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '이전 로컬 분석', exact: true })).toHaveCount(0);
});
