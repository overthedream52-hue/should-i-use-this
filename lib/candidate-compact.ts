import { z } from 'zod';
import type { CandidateReviewPacket } from './candidate-review-v1';

const text = (max: number) => z.string().trim().min(1).max(max);
const ref = z.number().int().min(1).max(20);
const refs = (max: number) => z.array(ref).max(max).refine(a => new Set(a).size === a.length, 'duplicate reference');
const offer = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).nullable();
export const compactAnswerSchema = z.strictObject({
  format: z.literal('candidate-compact-v3'), requestKey: z.string().regex(/^[a-f0-9]{32}$/),
  userFacts: z.array(z.strictObject({category:z.enum(['job','need','gap','current_method','constraint','trial_preference']),statement:text(500),span:z.number().int().min(1)})).max(8),
  workstream: z.strictObject({label:text(100),statement:text(500)}),
  sources: z.array(z.strictObject({url:text(2048),title:text(300),excerpt:text(1200),owner:z.enum(['candidate','platform','independent']),scope:z.enum(['product','offer','unknown']),offerId:offer})).max(20),
  candidates: z.array(z.strictObject({
    name:text(200),kind:z.enum(['mcp','skill','plugin','software','saas','open_source','service_vendor']),role:z.enum(['target','free_open_source','paid_alternative','vendor_alternative']),
    canonicalSource:ref,relation:z.enum(['direct','indirect']),relationReason:text(500),facts:refs(8),
    claims:z.array(z.strictObject({category:z.enum(['identity','capability','price','trial','renewal','cancellation','requirement','permission','data_handling','maintenance','process','ownership','vendor_claim']),statement:text(600),source:ref,quote:text(1200)})).max(12),
    license:z.strictObject({status:z.enum(['documented','unknown','not_applicable']),spdxId:text(64).nullable(),sources:refs(4)}),
    unknowns:z.array(z.strictObject({category:z.enum(['price','permission','data_handling','maintenance','ownership','acceptance','payment_terms','termination','effect']),statement:text(500)})).max(12),
  })).max(5),
  decision:z.strictObject({target:ref.nullable(),action:z.enum(['review_payment','trial_first','hold_payment','do_not_pay','request_proposal','hold_contract','research_hold']),statement:text(800),facts:refs(8),claims:refs(12),alternatives:refs(5),currentMethods:refs(6),offerId:offer,nextAction:z.enum(['keep_current','research_public','ask_user','optional_trial','review_terms','request_proposal']),question:text(300).optional()}),
  limitations:z.array(text(500)).max(12),
});
export type CompactAnswer = z.infer<typeof compactAnswerSchema>;

// Expansion only: no repaired references, invented facts or silently dropped evidence.
export function expandCompactAnswer(a: CompactAnswer, packet: CandidateReviewPacket) {
  if (a.requestKey !== packet.inputHash.slice(0,32)) throw new Error('input binding mismatch');
  const at = <T,>(items:T[], n:number):T => { const value=items[n-1];if(value===undefined)throw new Error('invalid compact reference');return value; };
  const facts=a.userFacts.map((f,i)=>({id:'f'+(i+1),category:f.category,statement:f.statement,userSpanIds:[at(packet.userSpans,f.span).id]}));
  const factIds=(indices:number[])=>indices.map(n=>at(facts,n).id);
  const sources=a.sources.map((s,i)=>({...s,id:'s'+(i+1),retrievedAt:packet.asOf,appliesToCandidateIds:[] as string[]}));
  const source=(n:number,cid:string)=>{const s=at(sources,n);if(!s.appliesToCandidateIds.includes(cid))s.appliesToCandidateIds.push(cid);return s;};
  const candidates=a.candidates.map((c,i)=>{
    const id='c'+(i+1);const canonical=source(c.canonicalSource,id);
    return {id,name:c.name,kind:c.kind,role:c.role,canonicalUrl:canonical.url,canonicalSourceId:canonical.id,relation:c.relation,relationReason:c.relationReason,userFactIds:factIds(c.facts),
      claims:c.claims.map((claim,j)=>{const s=source(claim.source,id);return {id:id+'_cl'+(j+1),category:claim.category,statement:claim.statement,sourceIds:[s.id],quote:claim.quote,scope:s.scope,offerId:s.offerId};}),
      license:{status:c.license.status,spdxId:c.license.spdxId,sourceIds:c.license.sources.map(n=>source(n,id).id)},
      unknowns:c.unknowns.map((u,j)=>({...u,id:id+'_u'+(j+1)})),
    };
  });
  const d=a.decision;const target=d.target===null?null:at(candidates,d.target);
  const alternatives=d.alternatives.map(n=>at(candidates,n));
  const methods=d.currentMethods.map(n=>{const f=at(facts,n);if(f.category!=='current_method')throw new Error('invalid current method');return {id:'m'+n,statement:f.statement,userFactIds:[f.id]};});
  if(!target && d.claims.length)throw new Error('claims without target');
  return {policyVersion:'candidate-policy-v3',id:packet.id,inputHash:packet.inputHash,asOf:packet.asOf,status:d.action==='research_hold'?'hold':'ready',
    userFacts:facts,workstream:{...a.workstream,userFactIds:facts.map(f=>f.id)},sources,candidates,currentMethods:methods,discoverySources:[],excluded:[],
    commitment:{targetCandidateId:target?.id??null,action:d.action,statement:d.statement,userFactIds:factIds(d.facts),claimIds:d.claims.map(n=>at(target!.claims,n).id),alternativeCandidateIds:alternatives.map(c=>c.id),alternativeClaimIds:alternatives.flatMap(c=>c.claims.filter(cl=>cl.category==='capability').map(cl=>cl.id)),currentMethodIds:methods.map(m=>m.id),unknownIds:target?.unknowns.map(u=>u.id)??[],offerId:d.offerId,nextAction:d.nextAction,...(d.question===undefined?{}:{question:d.question})},limitations:a.limitations};
}
