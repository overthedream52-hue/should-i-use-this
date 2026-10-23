import { describe,it,expect } from 'vitest';
import {readFileSync,mkdtempSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';
import {adoptionAnswerSchema,sourceBundleSchema,sourceListSchema} from '../../lib/adoption-schema';
import {spawnSync} from 'node:child_process';
import {prepareSourceRequest,prepareAdoptionReview,bindSourceReply,importAdoptionReview} from '../../lib/adoption-review';
const py=(command:string,value:unknown)=>spawnSync('python3',['.agents/skills/should-i-use-this/scripts/adoption_contract.py',command],{input:JSON.stringify(value),encoding:'utf8'});
import {fields,base,fixture} from '../fixtures/adoption';

function accepted(x:ReturnType<typeof fixture>,reply=JSON.stringify(x.a)){
 const result=importAdoptionReview(x.p.input,reply);const r=py('validate',{input:x.p.input,reply});expect(r.status,r.stderr).toBe(0);expect(JSON.parse(r.stdout)).toEqual(result);return result.view;
}
function rejected(x:ReturnType<typeof fixture>){const reply=JSON.stringify(x.a);expect(()=>importAdoptionReview(x.p.input,reply)).toThrow();expect(py('validate',{input:x.p.input,reply}).status).not.toBe(0);}
describe('adoption ledger',()=>{
 it('rejects product-level cost for a selected offer even on hold',()=>{
  const x=fixture();Object.assign(x.a.assessments[0],{verdict:'needs_info',offer:'paid-tier',nextCheck:'public_sources',unknowns:[{category:'permission',statement:'권한'}]});
  x.a.assessments[0].claims[1].scope='product';x.a.assessments[0].claims[1].offer=null;rejected(x);
 });
 it('rejects structured payloads outside the single answer fence',()=>{
  const x=fixture();for(const outside of ['{"format":"conflicting"}','[1,2]']){
   const reply=outside+'\n```json\n'+JSON.stringify(x.a)+'\n```';
   expect(()=>importAdoptionReview(x.p.input,reply)).toThrow();expect(py('validate',{input:x.p.input,reply}).status).not.toBe(0);
  }
 });
 it('rejects unpaired surrogates consistently',()=>{
  const x=fixture();x.p.input.sources[0].text='Text \ud800 tail';
  expect(()=>prepareAdoptionReview(x.p.input.base,x.p.input.sources,'provided')).toThrow();expect(py('judge',x.p.input).status).not.toBe(0);
 });

 it('represents free positive adoption independently from payment',()=>{const v=accepted(fixture());expect(v.assessments[0].title).toBe('도입을 검토할 근거가 있습니다');expect(v.assessments[0].costLabel).toBe('무료 근거 있음');});
 it('supports paid hold and current-method maintenance separately',()=>{
  const x=fixture();Object.assign(x.a.assessments[0],{verdict:'needs_info',nextCheck:'public_sources',unknowns:[{category:'permission',statement:'권한 미확인'}]});x.a.assessments[0].cost.kind='paid';expect(accepted(x).assessments[0].verdict).toBe('needs_info');
  Object.assign(x.a.assessments[0],{verdict:'keep_current',nextCheck:'keep_current',gap:[]});expect(accepted(x).assessments[0].title).toBe('현재 방식을 유지해도 됩니다');
 });
 it('binds source collection to request and fixes passages before judgment',()=>{
  const p=prepareSourceRequest(fields,{id:base().id,asOf:base().asOf});
  const bundle={format:'source-bundle-v1',requestKey:p.packet.inputHash.slice(0,32),sources:fixture().p.input.sources};
  const next=bindSourceReply(p.input,JSON.stringify(bundle));expect(next.stage).toBe('judgment');expect(next.packet.evidence[0].text).toContain('Local captions');
  const r=py('bind',{input:p.input,reply:JSON.stringify(bundle)});expect(r.status,r.stderr).toBe(0);expect(JSON.parse(r.stdout)).toEqual(next);
  bundle.requestKey='0'.repeat(32);expect(()=>bindSourceReply(p.input,JSON.stringify(bundle))).toThrow();
 });
 it('shares prompts and preserves every Unicode source character across bounded passages',()=>{
  const r=py('prepare',fields);expect(r.status,r.stderr).toBe(0);const p=JSON.parse(r.stdout);expect(prepareSourceRequest(fields,{id:p.input.id,asOf:p.input.asOf})).toEqual(p);
  const x=fixture();x.p.input.sources[0].text='가😀 '.repeat(700).trim();
  const web=prepareAdoptionReview(x.p.input.base,x.p.input.sources,'provided');
  expect(web.packet.evidence.map(e=>e.text).join('')).toBe(x.p.input.sources[0].text);
  const portable=py('judge',web.input);expect(portable.status,portable.stderr).toBe(0);expect(JSON.parse(portable.stdout)).toEqual(web);
 });
 it('accepts one fenced answer with disclosed prose but rejects ambiguous blocks',()=>{
  const x=fixture();const reply='설명\n```json\n'+JSON.stringify(x.a)+'\n```\n추가 설명';expect(accepted(x,reply).ignoredProse).toBe(true);
  const bad=reply+'\n```json\n{}\n```';expect(()=>importAdoptionReview(x.p.input,bad)).toThrow();expect(py('validate',{input:x.p.input,reply:bad}).status).not.toBe(0);
 });
 it('discloses ignored source-collection prose and rejects unknown-scope cost claims',()=>{
  const p=prepareSourceRequest(fields,{id:base().id,asOf:base().asOf});const bundle={format:'source-bundle-v1',requestKey:p.packet.inputHash.slice(0,32),sources:fixture().p.input.sources};
  const reply='설명\n```json\n'+JSON.stringify(bundle)+'\n```\n부연';
  expect(bindSourceReply(p.input,reply)).toHaveProperty('collectionIgnoredProse',true);
 });
 it('rejects unknown-scope cost in a hold',()=>{
  const x=fixture();Object.assign(x.a.assessments[0],{verdict:'needs_info',nextCheck:'public_sources',unknowns:[{category:'permission',statement:'권한'}]});
  x.a.assessments[0].claims[1].scope='unknown';x.a.assessments[0].claims[1].offer=null;rejected(x);
 });
 it('rejects cross-candidate evidence and incomplete candidate coverage',()=>{
  const x=fixture();const second={...x.p.input.sources[0],candidateUrl:'https://example.com/other',name:'Other'};
  x.p=prepareAdoptionReview(x.p.input.base,[...x.p.input.sources,second],'provided');x.a.requestKey=x.p.packet.requestKey;
  rejected(x);const copy=structuredClone(x.a.assessments[0]);copy.candidate=2;x.a.assessments.push(copy);rejected(x);
 });
 it('keeps generated schemas and a copied portable skill working',()=>{
  expect(JSON.parse(readFileSync('.agents/skills/should-i-use-this/references/adoption-schemas.json','utf8'))).toEqual({answer:z.toJSONSchema(adoptionAnswerSchema),bundle:z.toJSONSchema(sourceBundleSchema),sources:z.toJSONSchema(sourceListSchema)});
  const dir=mkdtempSync(join(tmpdir(),'siut-adoption-'));cpSync('.agents/skills/should-i-use-this',join(dir,'skill'),{recursive:true});
  const x=fixture();const reply=JSON.stringify(x.a);const r=spawnSync('python3',[join(dir,'skill/scripts/adoption_contract.py'),'validate'],{cwd:dir,input:JSON.stringify({input:x.p.input,reply}),encoding:'utf8'});
  expect(r.status,r.stderr).toBe(0);expect(JSON.parse(r.stdout)).toEqual(importAdoptionReview(x.p.input,reply));
 });
 it('rejects empty or oversized source ledgers without truncation',()=>{
  const x=fixture();expect(()=>prepareAdoptionReview(x.p.input.base,[],'provided')).toThrow();
  x.p.input.sources[0].text='x'.repeat(12001);expect(()=>prepareAdoptionReview(x.p.input.base,x.p.input.sources,'provided')).toThrow();expect(py('judge',x.p.input).status).not.toBe(0);
 });
 it('rejects stale sources, unknown fields, unsafe actions and invalid refs',()=>{
  for(const change of [
   (x:ReturnType<typeof fixture>)=>{x.p.input.sources[0].text+=' changed';},
   (x:ReturnType<typeof fixture>)=>{x.a.assessments[0].gap=[];},
   (x:ReturnType<typeof fixture>)=>{x.a.assessments[0].claims[0].scope='unknown';x.a.assessments[0].claims[0].offer=null;},
   (x:ReturnType<typeof fixture>)=>{x.a.assessments[0].claims[0].offer='other';},
   (x:ReturnType<typeof fixture>)=>{x.a.assessments[0].cost.evidence=[99];},
   (x:ReturnType<typeof fixture>)=>{x.a.assessments[0].need=[1,1];},
   (x:ReturnType<typeof fixture>)=>{x.a.assessments[0].current=[true as unknown as number];},
   (x:ReturnType<typeof fixture>)=>{Object.assign(x.a,{sources:[]});},
   (x:ReturnType<typeof fixture>)=>{x.a.assessments[0].nextCheck='install';},
  ]){const x=fixture();change(x);rejected(x);}
 });
});
