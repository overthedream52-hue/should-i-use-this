import {test,expect} from '@playwright/test';
test('collection preview imports discovery context without fetching and resets prior answer',async({page})=>{
 await page.goto('/');await page.getByLabel('후보 이름').fill('이전 후보');await page.getByRole('textbox',{name:'내 상황 선택'}).fill('영상 자료를 찾는다');await page.getByRole('button',{name:'비교 자료 준비'}).click();await page.getByRole('checkbox').check();
 const network:string[]=[];page.on('request',r=>network.push(r.url()));
 await page.getByText('Scrapling 수집 결과 가져오기',{exact:true}).click();
 const p={format:'web-collection-v1',url:'https://www.instagram.com/p/DeGjnGIjeZb/',collectedAt:'2026-10-05T12:00:00Z',collector:'scrapling',status:'partial',text:'사진의 도구 소개',media:[{url:'https://example.com/a.png',alt:'이미지 설명'}],limitations:['OCR 미실행']};
 await page.getByLabel('수집 JSON 파일').setInputFiles({name:'collection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await expect(page.getByRole('region',{name:'수집 미리보기'})).toContainText('전체 확인 아님');
 await page.getByRole('button',{name:'확인한 수집 자료 적용'}).click();
 await expect(page.getByLabel('후보 이름')).toHaveValue('');await expect(page.getByRole('textbox',{name:'내 상황 선택'})).toHaveValue('영상 자료를 찾는다');await expect(page.getByLabel('후보 조사 전송 내용')).toHaveCount(0);
 await page.getByRole('button',{name:'비교 자료 준비'}).click();await expect(page.getByRole('checkbox')).not.toBeChecked();await expect(page.getByLabel('후보 조사 전송 내용')).toHaveValue(/공식 제품 근거가 아닙니다/);expect(network).toEqual([]);
});
test('blocked and malformed collection preserve current input',async({page})=>{
 await page.goto('/');await page.getByLabel('후보 이름').fill('유지');await page.getByText('Scrapling 수집 결과 가져오기',{exact:true}).click();
 await page.getByLabel('수집 JSON 파일').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByLabel('후보 이름')).toHaveValue('유지');
 const p={format:'web-collection-v1',url:'https://www.instagram.com/p/DeGjnGIjeZb/',collectedAt:'2026-10-05T12:00:00Z',collector:'scrapling',status:'blocked',text:'로그인',media:[],limitations:['로그인 필요']};
 await page.getByLabel('수집 JSON 파일').setInputFiles({name:'blocked.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await expect(page.getByRole('button',{name:'확인한 수집 자료 적용'})).toBeDisabled();
 await page.getByRole('button',{name:'입력과 결과 지우기'}).click();await expect(page.getByRole('region',{name:'수집 미리보기'})).toHaveCount(0);
});
