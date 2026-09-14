import { describe, expect, it } from 'vitest';
import { buildFitPacket, validateFitAnswerV3, renderFitAnswerV3 } from '../../lib/subscription-fit-v3';
const input={id:'one',source:'# Tool\nFor Cloud only.\n\n## Hosting\n| Plan | Manager |\n| --- | --- |\n| Cloud | **Provider** |\n',situation:'서버를 관리하고 싶지 않다.'};
function response(){return {id:'one',inputHash:buildFitPacket(input).inputHash,decision:'consider',facts:[{id:'f1',category:'feature',statement:'Cloud는 제공자가 관리',spanIds:['S2']}],userFacts:[{id:'u1',statement:'서버관리 원치 않음',spanIds:['U1']}],judgments:[{statement:'검토 가치가 있다.',factIds:['f1'],userFactIds:['u1']}],burdenFactIds:[],unknowns:[],questionCode:null};}
describe('code-owned source citations',()=>{
 it('keeps whole tables and exact offsets with parent applicability context',()=>{
  const p=buildFitPacket(input);expect(p.sourceSpans).toHaveLength(2);
  expect(p.sourceSpans[1].text).toBe('## Hosting\n| Plan | Manager |\n| --- | --- |\n| Cloud | **Provider** |\n');
  expect(p.sourceSpans[1].contextIds).toEqual(['S1']);
  for(const s of p.sourceSpans)expect(input.source.slice(s.start,s.end)).toBe(s.text);
 });
 it('does not split fenced code as headings or lose the preamble context',()=>{
  const p=buildFitPacket({...input,source:'Only on Linux.\n# Tool\n```sh\n# not a heading\n```\n## Addon\nOptional.\n'});
  expect(p.sourceSpans).toHaveLength(3);expect(p.sourceSpans[2].contextIds).toEqual(['S1','S2']);
 });
 it('resets applicability at an empty ATX heading',()=>{
  const p=buildFitPacket({...input,source:'# Cloud\nOnly hosted.\n#\n## Self-host\nRun locally.\n'});
  expect(p.sourceSpans).toHaveLength(3);expect(p.sourceSpans[2].contextIds).toEqual(['S2']);
 });
 it('renders trusted original text and context rather than a model quotation',()=>{
  const v=renderFitAnswerV3(response(),input);
  expect(v.facts[0].citations[0].text).toContain('**Provider**');
  expect(v.facts[0].citations[0].context[0].text).toBe('# Tool\nFor Cloud only.\n\n');
  expect(v.judgments[0].text).toMatch(/^예상 판단:/);expect(v.judgments[0].factIds).toEqual(['f1']);
 });
 it('rejects modified input, unknown or cross-origin spans and model-supplied quotes',()=>{
  const a=response();expect(()=>validateFitAnswerV3(a,{...input,source:input.source+'Changed'})).toThrow();
  for(const facts of [[{...a.facts[0],spanIds:['S999']}],[{...a.facts[0],spanIds:['U1']}],[{...a.facts[0],quote:'Invented'}]])expect(()=>validateFitAnswerV3({...a,facts},input)).toThrow();
 });
 it('rejects wrong case, duplicate IDs/refs, feature burdens and unsupported judgments',()=>{
  const a=response();
  for(const raw of [{...a,id:'other'},{...a,facts:[a.facts[0],a.facts[0]]},{...a,facts:[{...a.facts[0],spanIds:['S2','S2']}]},{...a,burdenFactIds:['f1']},{...a,judgments:[{...a.judgments[0],factIds:['missing']}]},{...a,judgments:[{...a.judgments[0],userFactIds:[]}]}])expect(()=>validateFitAnswerV3(raw,input)).toThrow();
 });
 it('holds with no source without fabricating citations and suppresses known goal',()=>{
  const empty={...input,source:''};const a={...response(),inputHash:buildFitPacket(empty).inputHash,decision:'hold',facts:[],userFacts:[],judgments:[{statement:'자료 부족',factIds:[],userFactIds:[]}],questionCode:'goal'};
  const v=renderFitAnswerV3(a,empty);expect(v.facts).toEqual([]);expect(v.question).toBeNull();
 });
 it('rejects over-limit input instead of truncating and preserves Korean/CRLF',()=>{
  expect(()=>buildFitPacket({...input,source:'x'.repeat(32001)})).toThrow();
  const original='# 한글\r\n조건입니다.\r\n';const p=buildFitPacket({...input,source:original});expect(p.sourceSpans[0].text).toBe(original);
 });
});
