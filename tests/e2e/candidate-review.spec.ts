import { test, expect } from '@playwright/test';
import fixture from '../fixtures/candidate-review/fornerds-hold.json';
import product from '../fixtures/candidate-review/product-hold.json';

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
  answer.asOf = packet.asOf;
  for (const source of answer.sources) source.retrievedAt = packet.asOf;
  answer.commitment.statement = '보류하지만 바로 가입해 무료 체험을 시작하세요.';
  await page.getByLabel('후보 조사 AI 답변').fill(JSON.stringify(answer));
  await page.getByRole('button', { name: '후보 답변과 근거 확인' }).click();
  const result = page.getByRole('region', { name: '후보 결제 전 검토 결과' });
  await expect(result.getByRole('heading', { name: '이전 답변의 조건을 다시 확인하세요' })).toBeVisible();
  await expect(result.getByText('보류하지만 바로 가입해 무료 체험을 시작하세요.', { exact: true })).not.toBeVisible();
  await expect(result.getByText('공개 근거의 미확인 조건을 먼저 확인하세요.', { exact: false })).toBeVisible();
  await expect(result).toContainText('서면 업무범위와 검수 기준');
  await result.getByText('후보와 공개 근거 보기').click();
  await expect(result).toContainText('업체 자체 주장');
  await expect(result).toContainText('AI 제품 개발과 AX 서비스를 제공하고 무료 상담과 맞춤 견적 절차를 안내한다.');
  await expect(result).toContainText('조회 ' + packet.asOf);
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

for (const versioned of [false, true]) {
  test(`all AI-authored guidance stays distinguishable from controlled actions (${versioned ? 'v2' : 'legacy'})`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('후보 이름').fill(product.fields.name);
    await page.getByRole('textbox', { name: '내 상황 선택' }).fill(product.fields.situation);
    await page.getByRole('button', { name: '비교 자료 준비' }).click();
    const prompt = await page.getByLabel('후보 조사 전송 내용').inputValue();
    const packet = JSON.parse(prompt.split('신뢰 입력:\n')[1]);
    const answer = JSON.parse(JSON.stringify(product.answer).replaceAll('$ID', packet.id).replaceAll('$HASH', packet.inputHash));
    answer.asOf = packet.asOf;
    const phrases = ['대안: 바로 가입해 무료 체험을 시작하세요.', '현재방법: 지금 가입하세요.', '미확인조건: 바로 체험하세요.', '한계: 결제부터 하세요.'];
    answer.candidates[1].relationReason = phrases[0];
    answer.userFacts.push({ id: 'f_current', category: 'current_method', statement: '현재 방법', userSpanIds: ['u1'] });
    answer.currentMethods.push({ id: 'm_current', statement: phrases[1], userFactIds: ['f_current'] });
    answer.commitment.currentMethodIds = ['m_current'];
    answer.candidates[0].unknowns[0].statement = phrases[2];
    answer.limitations = [phrases[3]];
    for (const source of answer.sources) { source.retrievedAt = packet.asOf; if (versioned) source.offerId = null; }
    if (versioned) {
      answer.policyVersion = 'candidate-policy-v2';
      for (const candidate of answer.candidates) for (const claim of candidate.claims) {
        claim.offerId = null; claim.quote = answer.sources.find((s: { id: string }) => s.id === claim.sourceIds[0]).excerpt;
      }
      answer.commitment.offerId = null;
      answer.commitment.nextAction = 'ask_user';
      answer.commitment.question = '질문: 지금 가입할까요?';
      phrases.push(answer.commitment.question);
    }
    await page.getByLabel('후보 조사 AI 답변').fill(JSON.stringify(answer));
    await page.getByRole('button', { name: '후보 답변과 근거 확인' }).click();
    const result = page.getByRole('region', { name: '후보 결제 전 검토 결과' });
    await expect(result).toBeVisible();
    for (const phrase of phrases) for (const match of await result.getByText(phrase, { exact: true }).all()) await expect(match).not.toBeVisible();
    await result.getByText('AI 판단 이유와 조건 보기 · 문장 의미는 미검증').click();
    for (const phrase of phrases) await expect(result.getByText(phrase, { exact: true }).first()).toBeVisible();
  });
}

import { fixture as compactFixture } from '../fixtures/candidate-review/compact';

test('compact answer imports with explicit scopes and rejects a stale request', async ({ page }) => {
  const {p,a}=compactFixture();
  await page.goto('/');
  await page.getByLabel('후보 이름').fill(p.input.subject.name);
  await page.getByLabel('후보 URL').fill(p.input.subject.url);
  await page.getByRole('textbox',{name:'내 상황 선택'}).fill(p.input.situation);
  await page.getByRole('button',{name:'비교 자료 준비'}).click();
  const packet=JSON.parse((await page.getByLabel('후보 조사 전송 내용').inputValue()).split('신뢰 입력:\n')[1]);
  a.requestKey=packet.inputHash.slice(0,32);
  await page.getByLabel('후보 조사 AI 답변').fill(JSON.stringify(a));
  await page.getByRole('button',{name:'후보 답변과 근거 확인'}).click();
  const result=page.getByRole('region',{name:'후보 결제 전 검토 결과'});
  await expect(result.getByRole('heading',{name:'결제를 검토할 근거가 있습니다'})).toBeVisible();
  await result.getByText('후보와 공개 근거 보기').click();
  await expect(result.getByText('제품 공통',{exact:false}).first()).toBeVisible();
  await expect(result.getByText('요청 기준일',{exact:false}).first()).toBeVisible();
  await page.getByRole('textbox',{name:'내 상황 선택'}).fill('다른 조건');
  await page.getByRole('button',{name:'비교 자료 준비'}).click();
  await page.getByLabel('후보 조사 AI 답변').fill(JSON.stringify(a));
  await page.getByRole('button',{name:'후보 답변과 근거 확인'}).click();
  await expect(result).toHaveCount(0);
});
