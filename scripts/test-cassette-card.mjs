import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'siut-card-'));
const server=spawn('python3',['scripts/local-inbox.py','--db',join(dir,'db'),'serve','--port','0']);
let browser;
try {
 const url=await new Promise((resolve,reject)=>{server.stdout.once('data',d=>resolve(String(d).trim()));server.once('error',reject);});
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
 let approved=false,current=true;
 await page.route('**/api/state',async route=>{
  const response=await route.fetch();const state=await response.json();
  state.jobs=[{id:'cassette-job',current:true,observation:1,input:{base:{subject:{name:'Cassette',url:'https://github.com/cassette-editor/oh-my-cassette'}}},answer:null,at:'2026-10-06'}];
  state.observations=[{id:1,name:'Cassette',url:'https://github.com/cassette-editor/oh-my-cassette',at:'2026-10-06',text:'Synthetic evidence'}];
  state.proposals=[{id:'cassette-proposal',job:'cassette-job',status:approved?'approved':'pending',current,analysisReady:false,body:{scope:'Cassette Web/Desktop의 가격·Mac 호환·자료 전송 조건을 공개 문서로 비교한 도입 판단표 작성',benefit:'조건 확인',risk:'설치 없음',check:'문서 확인',rollback:'초안 보존'}}];
  await route.fulfill({json:state});
 });
 await page.goto(url);await page.locator('#cassette-card').waitFor({state:'visible',timeout:4000});
 assert.match(await page.locator('#cassette-card').innerText(),/조사 승인 대기/);
 let opened;
 await page.route('**/api/open-aside',async route=>{opened=route.request().postDataJSON();await route.fulfill({json:{ok:true}});});
 await page.getByRole('link',{name:'공식 계정 신청 · Aside에서 열기',exact:true}).click();
 await page.getByText('Aside 앱에 링크를 전달했습니다.',{exact:true}).waitFor();
 assert.equal(opened.url,'https://trycassette.online/signup/');assert.equal(new URL(page.url()).origin,new URL(url).origin);
 await page.unroute('**/api/open-aside');await page.route('**/api/open-aside',route=>route.fulfill({status:503,json:{error:'Aside unavailable'}}));
 await page.getByRole('link',{name:'공식 홈페이지 · Aside에서 열기',exact:true}).click();await page.getByText('Aside unavailable',{exact:true}).waitFor();

 approved=true;await page.locator('#refresh').click();await page.getByText('공개 조사 승인됨 · 설치 승인 아님',{exact:true}).waitFor();
 await page.getByText('어떻게 사용하는가',{exact:true}).click();await page.getByText('원문과 미확인 조건',{exact:true}).click();
 assert.match(await page.locator('#cassette-card').innerText(),/가격\/사용 한도는 미확인/);
 assert.equal(await page.locator('#cassette-card').getByRole('button',{name:/설치|결제/}).count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 mkdirSync('docs/evals/2026-10-06-cassette-card',{recursive:true});await page.locator('#cassette-card').screenshot({path:'docs/evals/2026-10-06-cassette-card/mobile.png'});
 current=false;await page.locator('#refresh').click();await page.getByText('이전 승인 기록 · 현재 근거 재확인 필요',{exact:true}).waitFor();
 console.log('PASS: definition/usage/cost visible; approval/currentness derived; no install actions; mobile fits');
} finally {await browser?.close();server.kill();await new Promise(r=>server.once('exit',r));rmSync(dir,{recursive:true,force:true});}
