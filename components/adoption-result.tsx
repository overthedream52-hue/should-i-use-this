import type {AdoptionView} from '../lib/adoption-review';
export default function AdoptionResult({view}:{view:AdoptionView}){
 return <>
  <p className="transfer-note">{view.provenanceLabel}</p>
  {view.ignoredProse&&<p className="transfer-note">JSON 밖의 부연 설명은 판단에 반영하지 않았습니다.</p>}
  {view.assessments.map(a=><article key={a.candidate} className="candidate-item">
   <p>{a.candidateInfo.name}</p><h2>{a.title}</h2>
   <p className="candidate-decision">{a.nextLabel}</p><p>비용: {a.costLabel}</p>
   {a.unknowns.length>0&&<p className="transfer-note">미확인 조건 {a.unknowns.length}개 · 아래 근거와 함께 확인하세요.</p>}
   <details className="result-evidence"><summary>AI 판단 이유와 미확인 조건 · 의미는 미검증</summary>
    <p>{a.reason}</p>{a.question&&<p>{a.question}</p>}
    <ul>{a.unknowns.map((u,i)=><li key={i}>{u.statement}</li>)}</ul>
   </details>
   <details className="result-evidence"><summary>번호로 연결한 원문 보기</summary>
    {a.claims.map((c,i)=><div className="candidate-claim" key={i}>
     <p>{c.statement}</p><small>{c.scope==='offer'?'요금제·경로: '+c.offer:c.scope==='product'?'제품 공통':'범위 미확인'} · AI 해석</small>
     {c.evidence.map(e=><div className="candidate-source" key={e.number}><strong>근거 {e.number}</strong><blockquote>{e.text}</blockquote><a href={e.url} target="_blank" rel="noreferrer">{e.title} 원문 열기</a></div>)}
    </div>)}
   </details>
  </article>)}
  <p className="transfer-note result-verification">{view.notice}</p>
 </>;
}
