import {prepareCandidateReview} from '../../lib/candidate-review-v1';
import {prepareAdoptionReview} from '../../lib/adoption-review';
export const fields={name:'Tool',url:'https://example.com/tool',situation:'현재 수작업을 쓴다. 자막이 필요하다. 자막 작업이 밀린다.',suppliedText:''};
export const base=()=>prepareCandidateReview(fields,{id:'00000000-0000-4000-8000-000000000001',asOf:'2026-10-05'}).input;
export function fixture(){
 const sources=[{candidateUrl:fields.url,name:'Tool',kind:'open_source',url:fields.url,title:'Official',text:'Local captions. Free MIT software. Reads files locally. No upload. Manual updates.'}];
 const p=prepareAdoptionReview(base(),sources,'provided');
 const a={format:'adoption-v4',requestKey:p.packet.requestKey,assessments:[{candidate:1,verdict:'consider',reason:'자막 불편에 공개 기능이 대응한다.',need:[2],gap:[3],current:[1],offer:'local',cost:{kind:'free',evidence:[1]},claims:['capability','price','permission','data_handling','maintenance','license'].map(category=>({category,statement:'합성 공개 조건',refs:[1],scope:category==='capability'||category==='price'?'offer':'product',offer:category==='capability'||category==='price'?'local':null})),unknowns:[] as {category:string;statement:string}[],nextCheck:'compare_terms'}]};return {p,a};
}
