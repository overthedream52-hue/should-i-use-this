import { describe, it, expect } from 'vitest';
import { POST } from '../../app/api/subscription/route';
import { buildFitPacket } from '../../lib/subscription-fit-v3';
const origin='http://127.0.0.1:3002';
const req=(body:unknown,site=origin)=>new Request(origin+'/api/subscription',{method:'POST',headers:{host:'127.0.0.1:3002',origin:site,'content-type':'application/json'},body:JSON.stringify(body)});
const fields={tool:'도구',source:'# 조건\nCloud에서는 설치하지 않습니다.',situation:''};
async function prepared(){const r=await POST(req({action:'prepare',...fields}));expect(r.status).toBe(200);return await r.json();}
describe('subscription transfer local boundary',()=>{
 it('accepts a hosted same-origin browser request without enabling cross-origin use',async()=>{
  const url='https://should-i-use-this.example/api/subscription';
  const hosted=(origin:string,site='same-origin')=>new Request(url,{method:'POST',headers:{host:'should-i-use-this.example',origin,'sec-fetch-site':site,'content-type':'application/json'},body:JSON.stringify({action:'prepare',...fields})});
  expect((await POST(hosted('https://should-i-use-this.example'))).status).toBe(200);
  expect((await POST(hosted('https://attacker.example','cross-site'))).status).toBe(403);
 });
 it('exports original source and schema then imports a fenced answer with trusted citations',async()=>{
  const p=await prepared();expect(p.prompt).toContain(fields.source.replaceAll('\n','\\n'));expect(p.prompt).toContain('inputHash');
  const answer={id:p.input.id,inputHash:buildFitPacket(p.input).inputHash,decision:'hold',facts:[{id:'cloud',category:'requirement',statement:'Cloud에서는 설치하지 않습니다.',spanIds:['S1']}],userFacts:[],judgments:[{statement:'사용 목적이 없어 판단을 보류합니다.',factIds:[],userFactIds:[]}],burdenFactIds:[],unknowns:[],questionCode:'goal'};
  const r=await POST(req({action:'import',input:p.input,reply:'```json\n'+JSON.stringify(answer)+'\n```'}));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');const result=await r.json();expect(result.view.decision).toBe('hold');expect(result.view.facts[0].citations[0].text).toBe(fields.source);
  const stale=await POST(req({action:'import',input:{...p.input,source:'다른 문서'},reply:JSON.stringify(answer)}));expect(stale.status).toBe(422);
 });
 it('rejects empty/over-limit input and cross-origin before processing',async()=>{
  expect((await POST(req({action:'prepare',...fields,source:' '}))).status).toBe(400);
  expect((await POST(req({action:'prepare',...fields,situation:'x'.repeat(4001)}))).status).toBe(400);
  expect((await POST(req({action:'prepare',...fields},'https://attacker.example'))).status).toBe(403);
  expect((await POST(req({x:'x'.repeat(1100000)}))).status).toBe(413);
 });
 it('handles Korean payloads within character limits at the response-validation boundary',async()=>{
  const p=await prepared();
  const r=await POST(req({action:'import',input:{...p.input,source:'한'.repeat(32000)},reply:JSON.stringify({unknowns:['한'.repeat(60000)]})}));
  expect(r.status).toBe(422);
 });
 it('rejects commentary, empty and oversized replies without exposing raw data',async()=>{
  const p=await prepared();
  for(const reply of ['', '앞말 {"secret":"private-test"}', 'x'.repeat(64001)]){
   const r=await POST(req({action:'import',input:p.input,reply}));expect(r.status).toBeGreaterThanOrEqual(400);expect(await r.text()).not.toContain('private-test');
  }
 });
});
