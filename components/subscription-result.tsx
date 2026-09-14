import type { TransferView } from '../lib/subscription-transfer';

const titles = {
  consider: '도입 후보로 검토할 만합니다',
  skip: '지금은 도입하지 않는 편이 맞겠습니다',
  hold: '업무 도입 가치는 아직 판단하기 어렵습니다',
};

// The validator owns decision/reference checks; this component only arranges its view.
export default function SubscriptionResult({ view }: { view: TransferView }) {
  const facts = [...view.facts, ...view.userFacts];
  const conditionIds = new Set(view.burdens.map(b => b.factId));
  const reasons = <ol className="result-reasons">
    {view.judgments.map((j, i) => <li key={i}>
      <span className="result-reason-number">판단 {i + 1}</span>
      <p className="transfer-judgment-text">{j.text.replace(/^예상 판단:\s*/, '')}</p>
    </li>)}
  </ol>;
  const evidence = facts.length > 0 && <details className="result-evidence">
    <summary>근거와 적용 조건 보기</summary>
    <p className="transfer-note">문서와 사용자 진술 {facts.length}개 · 연결된 판단 번호를 함께 표시합니다.</p>
    {conditionIds.size > 0 && <p className="transfer-note">문서 조건에는 다른 설치 방식의 조건도 포함될 수 있습니다. 해당 기능이나 설치 방식을 선택할 때만 적용되며, 모두 내 부담이라는 뜻은 아닙니다.</p>}
    {facts.map(fact => {
      const connections = view.judgments.flatMap((j, i) => j.factIds.includes(fact.id) || j.userFactIds.includes(fact.id) ? [i + 1] : []);
      return <div className="transfer-fact" id={`result-fact-${fact.id}`} key={fact.id}>
        <p className="result-fact-label">{fact.label}</p>
        <p className="transfer-fact-statement">{fact.statement}</p>
        <p className="result-connections">{connections.length ? `연결된 판단: ${connections.join(', ')}` : '판단에 직접 연결되지 않은 참고 정보'}</p>
        {conditionIds.has(fact.id) && <p className="result-condition">문서에 명시된 준비·제약 조건</p>}
        <details><summary>원문과 적용 조건 보기</summary>
          {fact.citations.map(c => <div key={c.id}>
            {c.context.map(parent => <pre key={parent.id} aria-label="상위 적용 조건">{parent.text}</pre>)}
            <pre aria-label="연결된 원문">{c.text}</pre>
          </div>)}
        </details>
      </div>;
    })}
  </details>;
  return <>
    <h2>{titles[view.decision]}</h2>
    <h3 className="result-section-title">판단 이유</h3>
    {view.adoptionNotice ? <p role="note" className="result-notice">{view.adoptionNotice}</p> : reasons}
    {view.unknowns.length > 0 ? <div className="result-unknowns">
      <h3 className="result-section-title">판단이 달라질 수 있는 정보</h3>
      <ul>{view.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul>
    </div> : <p className="transfer-note result-reconsider">현재 제공된 근거로 판단했습니다. 상황이나 적용 조건이 달라지면 다시 판단할 수 있습니다.</p>}
    {view.question && <div className="result-question">
      <h3 className="result-section-title">내 상황에서 확인할 한 가지</h3>
      <p>{view.question}</p>
      <p className="transfer-note">위의 내 상황을 보완한 뒤 자료를 다시 준비할 수 있습니다.</p>
    </div>}
    {view.adoptionNotice ? <details className="result-original"><summary>AI의 원래 조건부 설명과 근거</summary>{reasons}{evidence}</details> : evidence}
    <p className="transfer-note result-verification">입력과 원문 연결을 확인했습니다. 내용의 정확성이나 실제 효과를 보장하지 않습니다.</p>
  </>;
}
