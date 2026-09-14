import { describe, expect, it } from 'vitest';
import { validateFitAnswerV2, renderFitAnswerV2 } from '../../lib/subscription-fit-v2';
const input = { id: 'one', source: 'Stores notes locally. Requires installation.', situation: '노트를 정리하고 싶다.' };
const answer = { id: 'one', decision: 'consider', facts: [{id:'f1', category:'feature', statement:'로컬 노트 저장', quote:'Stores notes locally.'},{id:'f2',category:'requirement',statement:'설치 필요',quote:'Requires installation.'}], userFacts:[{id:'u1',statement:'노트 정리 목적',quote:'노트를 정리하고 싶다.'}], judgments:[{statement:'노트 정리에 도움이 될 수 있다.',factIds:['f1'],userFactIds:['u1']}],burdenFactIds:['f2'],unknowns:[],questionCode:null };
describe('grounded subscription answers', () => {
 it('keeps predicted utility visibly separate from documented burden',()=>{
  const view=renderFitAnswerV2(validateFitAnswerV2(answer,input), {purpose:input.situation,answeredQuestions:[]});
  expect(view.judgments).toEqual([{ text: '예상 판단: 노트 정리에 도움이 될 수 있다.', factIds: ['f1'], userFactIds: ['u1'] }]);
  expect(view.burdens).toEqual([{ text: '문서에 명시: 설치 필요', factId: 'f2' }]);
 });
 it('rejects citations swapped between user statements and public source',()=>{
  expect(()=>validateFitAnswerV2({...answer,facts:[{...answer.facts[0],quote:input.situation}]},input)).toThrow();
  expect(()=>validateFitAnswerV2({...answer,userFacts:[{...answer.userFacts[0],quote:'Stores notes locally.'}]},input)).toThrow();
 });
 it('rejects features placed in documented burdens',()=>{
  expect(()=>validateFitAnswerV2({...answer,burdenFactIds:['f1']},input)).toThrow();
 });
 it('rejects absent references and duplicate IDs',()=>{
  expect(()=>validateFitAnswerV2({...answer,judgments:[{...answer.judgments[0],factIds:['missing']}]},input)).toThrow();
  expect(()=>validateFitAnswerV2({...answer,facts:[answer.facts[0],answer.facts[0]]},input)).toThrow();
 });
 it('rejects a decisive recommendation with no linked user or source premise',()=>{
  expect(()=>validateFitAnswerV2({...answer,judgments:[{...answer.judgments[0],userFactIds:[]}]},input)).toThrow();
  expect(()=>validateFitAnswerV2({...answer,judgments:[{...answer.judgments[0],factIds:[]}]},input)).toThrow();
 });
 it('allows missing-source hold without inventing burden and suppresses a known goal',()=>{
  const raw={...answer,decision:'hold',facts:[],userFacts:[],judgments:[{statement:'자료가 부족해 판단 보류',factIds:[],userFactIds:[]}],burdenFactIds:[],questionCode:'goal'};
  const v=renderFitAnswerV2(validateFitAnswerV2(raw,{...input,source:''}),{purpose:input.situation,answeredQuestions:[]});
  expect(v.burdens).toEqual([]);expect(v.question).toBeNull();
 });
 it('rejects wrong case, blank quotes, unknown fields and arbitrary questions',()=>{
  for(const raw of [{...answer,id:'other'},{...answer,question:'제품 정보를 알아봐주세요'},{...answer,questionCode:'product'},{...answer,facts:[{...answer.facts[0],quote:' '}]}]) expect(()=>validateFitAnswerV2(raw,input)).toThrow();
 });
});
