import { test, expect } from '@playwright/test';
import fixture from '../fixtures/candidate-review/fornerds-hold.json';

test('ForNerds URL review separates a vendor claim from contract evidence', async ({ page }) => {
  const externalRequests: string[] = [];
  await page.goto('/');
  const appOrigin = new URL(page.url()).origin;
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== appOrigin) externalRequests.push(request.url());
  });
  await page.getByRole('button', { name: 'ForNerds 공개 예시' }).click();
  await page.getByRole('button', { name: '비교 자료 준비' }).click();
  await expect(page.getByRole('button', { name: '조사 요청 복사' })).toBeDisabled();
  const prompt = await page.getByLabel('후보 조사 전송 내용').inputValue();
  const packet = JSON.parse(prompt.split('신뢰 입력:\n')[1]);
  const answer = JSON.parse(JSON.stringify(fixture.answer).replaceAll('$ID', packet.id).replaceAll('$HASH', packet.inputHash));
  await page.getByLabel('후보 조사 AI 답변').fill(JSON.stringify(answer));
  await page.getByRole('button', { name: '후보 답변과 근거 확인' }).click();
  const result = page.getByRole('region', { name: '후보 결제 전 검토 결과' });
  await expect(result.getByRole('heading', { name: '계약 조건을 더 확인해야 합니다' })).toBeVisible();
  await expect(result).toContainText('서면 업무범위와 검수 기준');
  await result.getByText('후보와 공개 근거 보기').click();
  await expect(result).toContainText('업체 자체 주장');
  await expect(result).toContainText('AI 제품 개발과 AX 서비스를 제공하고 무료 상담과 맞춤 견적 절차를 안내한다.');
  await expect(result).toContainText('조회 2026-09-15');
  const source = result.getByRole('link', { name: 'ForNerds 원문 열기' }).first();
  await expect(source).toHaveAttribute('target', '_blank');
  await expect(source).toHaveAttribute('rel', 'noreferrer');
  await expect(result).toContainText('원문 진위');
  expect(externalRequests).toEqual([]);

  await page.getByRole('textbox', { name: '내 상황 선택' }).fill('바뀐 상황');
  await expect(result).toHaveCount(0);
  await expect(page.getByRole('button', { name: '조사 요청 복사' })).toHaveCount(0);
});

test('switching modes unmounts and clears prepared candidate data', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ForNerds 공개 예시' }).click();
  await page.getByRole('button', { name: '비교 자료 준비' }).click();
  await page.getByRole('tab', { name: '원문 하나 판단' }).click();
  await page.getByRole('tab', { name: 'URL·후보 비교' }).click();
  await expect(page.getByRole('button', { name: '조사 요청 복사' })).toHaveCount(0);
  await expect(page.getByLabel('후보 URL')).toHaveValue('');
});
