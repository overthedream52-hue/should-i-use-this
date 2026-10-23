import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import CandidateReviewResult from '../../components/candidate-review-result';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { compactAnswerSchema } from '../../lib/candidate-compact';
import { spawnSync } from 'node:child_process';
import { prepareCandidateReview, importCandidateReview } from '../../lib/candidate-review-v1';

import { fields, fixture } from '../fixtures/candidate-review/compact';
const py = (cmd: string, value: unknown) => spawnSync('python3', ['.agents/skills/should-i-use-this/scripts/candidate_contract.py', cmd], {input: JSON.stringify(value), encoding: 'utf8'});

function accepted(x:ReturnType<typeof fixture>) {
  const reply=JSON.stringify(x.a); const result=importCandidateReview(x.p.input,reply);
  const portable=py('validate',{input:x.p.input,reply});expect(portable.status,portable.stderr).toBe(0);
  expect(JSON.parse(portable.stdout)).toEqual(result);return result.view;
}
function rejected(x:ReturnType<typeof fixture>) {
  const reply=JSON.stringify(x.a);expect(()=>importCandidateReview(x.p.input,reply)).toThrow();
  expect(py('validate',{input:x.p.input,reply}).status).not.toBe(0);
}
describe('compact candidate answer',()=>{
 it('prepares the same compact prompt on both surfaces with one bound key',()=>{
   const portable=py('prepare',fields);expect(portable.status,portable.stderr).toBe(0);
   const p=JSON.parse(portable.stdout);const web=prepareCandidateReview(fields,{id:p.input.id,asOf:p.input.asOf});
   expect(p.prompt).toBe(web.prompt);expect(web.prompt).toContain('candidate-compact-v3');
   const schema=JSON.parse(web.prompt.split('JSON Schema:\n')[1].split('\n신뢰 입력:')[0]);
   expect(schema.properties.requestKey.const).toBe(web.packet.inputHash.slice(0,32));
   expect(schema.properties.inputHash).toBeUndefined();expect(schema.properties.id).toBeUndefined();
 });
 it('compiles valid positive offer evidence plus product-wide conditions identically',()=>{
   const view=accepted(fixture());expect(view.action).toBe('review_payment');expect(view.currentMethods[0].statement).toBe('현재 수작업으로 편집한다.');
 });
 it('keeps every target unknown and derives current-method IDs without model references',()=>{
   const x=fixture();x.a.userFacts=x.a.userFacts.slice(0,1);x.a.candidates[0].facts=[1];x.a.decision.facts=[1];x.a.decision.action='do_not_pay';x.a.decision.nextAction='keep_current';
   x.a.candidates[0].unknowns=[{category:'effect',statement:'추가 효과 미확인'}];
   const view=accepted(x);expect(view.unknowns).toHaveLength(1);expect(view.nextAction).toBe('keep_current');
 });
 it('rejects stale inputs and unknown/other-offer/product-wide capability',()=>{
   for(const mutation of [
    (x:ReturnType<typeof fixture>)=>{x.p.input.situation+=' 다른 조건';},
    (x:ReturnType<typeof fixture>)=>{x.a.requestKey='0'.repeat(32);},
    (x:ReturnType<typeof fixture>)=>{x.a.sources[0].scope='unknown';x.a.sources[0].offerId=null as unknown as string;},
    (x:ReturnType<typeof fixture>)=>{x.a.sources[0].scope='product';x.a.sources[0].offerId=null as unknown as string;},
    (x:ReturnType<typeof fixture>)=>{x.a.sources[0].offerId='free';},
   ]){const x=fixture();mutation(x);rejected(x);}
 });
 it('rejects invalid references, extra fields, quote fabrication and scope contradictions',()=>{
   for(const mutation of [
    (x:ReturnType<typeof fixture>)=>{x.a.decision.currentMethods=[2];},
    (x:ReturnType<typeof fixture>)=>{x.a.decision.facts=[1,1];},
    (x:ReturnType<typeof fixture>)=>{x.a.decision.claims=[0];},
    (x:ReturnType<typeof fixture>)=>{x.a.candidates[0].canonicalSource=99;},
    (x:ReturnType<typeof fixture>)=>{x.a.candidates[0].claims[0].source=true as unknown as number;},
    (x:ReturnType<typeof fixture>)=>{x.a.userFacts[0].span=1.5;},
    (x:ReturnType<typeof fixture>)=>{x.a.candidates[0].claims[0].quote='fabricated';},
    (x:ReturnType<typeof fixture>)=>{x.a.sources[1].offerId='pro';},
    (x:ReturnType<typeof fixture>)=>{Object.assign(x.a,{inputHash:x.p.packet.inputHash});},
   ]){const x=fixture();mutation(x);rejected(x);}
 });
 it('keeps generated schema in sync and displays scope/date without claiming retrieval',()=>{
   expect(JSON.parse(readFileSync('.agents/skills/should-i-use-this/references/candidate-compact-schema.json','utf8'))).toEqual(z.toJSONSchema(compactAnswerSchema));
   const html=renderToStaticMarkup(createElement(CandidateReviewResult,{view:accepted(fixture())}));
   expect(html).toContain('요청 기준일');expect(html).toContain('제품 공통');expect(html).toContain('요금제·경로:');
 });
 it('rejects whitespace format and normalizes JSON integer notation consistently',()=>{
   const x=fixture();const reply=JSON.stringify(x.a).replace('"target":1','"target":1.0');
   const web=importCandidateReview(x.p.input,reply);const portable=py('validate',{input:x.p.input,reply});
   expect(portable.status,portable.stderr).toBe(0);expect(JSON.parse(portable.stdout)).toEqual(web);
   x.a.format=' candidate-compact-v3 ';rejected(x);
 });
 it('requires proposal identity to apply to the selected offer or whole product',()=>{
   const x=fixture();x.a.candidates[0].kind='service_vendor';x.a.candidates[0].unknowns=[{category:'acceptance',statement:'검수 조건'}];
   x.a.sources.push({...x.a.sources[0],offerId:'other-route'});
   x.a.candidates[0].claims=[{category:'identity',statement:'업체',source:3,quote:x.a.sources[0].excerpt},{category:'capability',statement:'기능',source:1,quote:x.a.sources[0].excerpt},{category:'process',statement:'절차',source:2,quote:x.a.sources[1].excerpt}];
   Object.assign(x.a.decision,{action:'request_proposal',nextAction:'request_proposal',claims:[1,2,3]});
   rejected(x);x.a.sources[2].offerId='pro';accepted(x);x.a.sources[2].offerId=null as unknown as string;x.a.sources[2].scope='product';accepted(x);
 });
 it('matches Unicode whitespace normalization on both surfaces',()=>{
   for(const space of ['\uFEFF','\u00A0','\u0085','\u001C']){
     const x=fixture();x.a.workstream.label=space+x.a.workstream.label+space;
     // ECMAScript retains NEL/FS, but trims BOM and NBSP. Sources include them too.
     x.a.sources[0].excerpt=space+x.a.sources[0].excerpt+space;
     x.a.candidates[0].claims[0].quote=space+x.a.candidates[0].claims[0].quote;
     accepted(x);
   }
 });
 it('tells models the active need and gap gate before they answer',()=>{
   expect(fixture().p.corePolicy).toContain('need + gap');
 });
 it('allows empty research hold without manufacturing a target',()=>{
   const x=fixture();x.a.candidates=[];x.a.sources=[];Object.assign(x.a.decision,{target:null,action:'research_hold',nextAction:'research_public',offerId:null,claims:[],currentMethods:[]});
   expect(accepted(x).target).toBeNull();
 });
});
