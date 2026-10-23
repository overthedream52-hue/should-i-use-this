import { prepareCandidateReview } from '../../../lib/candidate-review-v1';
export const fields = { name: 'EvidenceEditor', url: 'https://example.com/editor', suppliedText: '', situation: '현재 수작업으로 편집한다. 자막을 만들고 싶다. 자막 작업이 밀린다.' };
export function fixture() {
  const p = prepareCandidateReview(fields, { id: '00000000-0000-4000-8000-000000000001', asOf: '2026-10-05' });
  const a = {
    format: 'candidate-compact-v3', requestKey: p.packet.inputHash.slice(0,32),
    userFacts: [
      {category:'current_method', statement:'현재 수작업으로 편집한다.', span:1},
      {category:'need', statement:'자막을 만들고 싶다.', span:2},
      {category:'gap', statement:'자막 작업이 밀린다.', span:3},
    ],
    workstream: {label:'편집', statement:'편집과 자막'},
    sources: [
      {url:'https://example.com/editor', title:'상품', excerpt:'Pro includes captions for $10. Local files, no upload, monthly maintenance.', owner:'candidate', scope:'offer', offerId:'pro'},
      {url:'https://example.com/privacy', title:'공통 정책', excerpt:'Local files, no upload, monthly maintenance.', owner:'candidate', scope:'product', offerId:null},
    ],
    candidates: [{name:'EvidenceEditor', kind:'saas', role:'target', canonicalSource:1, relation:'direct', relationReason:'자막', facts:[1,2,3],
      claims: ['capability','price','permission','data_handling','maintenance'].map((category,i)=>({category,statement:'합성 경계 테스트 근거',source:i<2?1:2,quote:i<2?'Pro includes captions for $10.':'Local files, no upload, monthly maintenance.'})),
      license:{status:'not_applicable',spdxId:null,sources:[] as number[]}, unknowns:[] as {category:string;statement:string}[]}],
    decision: {target:1 as number|null,action:'review_payment',statement:'공개 조건과 현재 방법을 비교할 근거가 있다.',facts:[1,2,3],claims:[1,2,3,4,5],alternatives:[] as number[],currentMethods:[1],offerId:'pro' as string|null,nextAction:'review_terms'},
    limitations:['합성 검사이며 의미 검증이 아니다.'],
  };return {p,a};
}
