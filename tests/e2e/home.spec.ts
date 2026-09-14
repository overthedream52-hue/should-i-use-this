import { test, expect } from '@playwright/test';
test('home starts with personal subscription and makes no automatic analysis requests', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/')) calls.push(new URL(r.url()).pathname); });
  const navigation = await page.goto('/');
  expect(navigation?.headers()['x-content-type-options']).toBe('nosniff');
  expect(navigation?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(navigation?.headers()['permissions-policy']).toContain('camera=()');
  await expect(page.getByRole('heading', { name: '이 도구, 나에게 필요할까요?', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '공개 예시로 시작', exact: true })).toBeVisible();
  await expect(page.getByText(/입력한 공개 문서와 상황은 이 웹 앱의 서버로 전송/)).toBeVisible();
  await expect(page.getByText(/입력은 이 컴퓨터의 앱에서 준비/)).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '내 AI 환경 연결', exact: true })).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(calls).toEqual([]);
  await page.getByRole('button', { name: '공개 예시로 시작', exact: true }).click();
  await page.getByRole('button', { name: '분석 자료 준비', exact: true }).click();
  await expect(page.getByRole('button', { name: '분석 요청 복사', exact: true })).toBeVisible();
  expect(calls).toEqual(['/api/subscription']);
});
test('subscription bookmark stays compatible', async ({ page }) => {
  await page.goto('/subscription');
  await expect(page.getByRole('heading', { name: '이 도구, 나에게 필요할까요?', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '이전 로컬 분석', exact: true })).toHaveCount(0);
});
