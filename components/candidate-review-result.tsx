import type { CandidateReviewView } from '../lib/candidate-review-v1';

const categoryLabels: Record<string, string> = {
  identity:'책임 주체', capability:'기능·역량', price:'가격', trial:'체험', renewal:'갱신',
  cancellation:'취소', requirement:'요구 조건', permission:'권한', data_handling:'데이터 처리',
  maintenance:'운영·유지보수', process:'진행 절차', ownership:'소유권', vendor_claim:'업체 자체 주장',
};
const unknownLabels: Record<string, string> = {
  price:'가격', permission:'권한', data_handling:'데이터 처리', maintenance:'운영·유지보수',
  ownership:'소유권', acceptance:'업무범위·검수', payment_terms:'지급 조건', termination:'중도 해지', effect:'실제 효과',
};

export default function CandidateReviewResult({ view }: { view: CandidateReviewView }) {
  return <>
    <h2>{view.title}</h2>
    <p className="candidate-decision">{view.nextActionText}</p>
    {view.unknowns.length > 0 && <p className="transfer-note">미확인 항목: {[...new Set(view.unknowns.map(item => unknownLabels[item.category] ?? item.category))].join(' · ')}</p>}
    <details className="result-evidence">
      <summary>AI 판단 이유와 조건 보기 · 문장 의미는 미검증</summary>
      {view.question && <p>{view.question}</p>}
      <p>{view.statement}</p>
    {view.currentMethods.length > 0 && <section className="candidate-summary">
      <h3>현재 방법</h3>
      <ul>{view.currentMethods.map(method => <li key={method.id}>{method.statement}</li>)}</ul>
    </section>}
    {view.alternatives.length > 0 && <section className="candidate-summary">
      <h3>비교 대안</h3>
      <ul>{view.alternatives.map(candidate => <li key={candidate.id}><strong>{candidate.name}</strong> · <span>{candidate.relationReason}</span></li>)}</ul>
    </section>}
    {view.unknowns.length > 0 && <section className="candidate-summary candidate-unknowns">
      <h3>결제·계약 전에 확인할 것</h3>
      <ul>{view.unknowns.map(unknown => <li key={unknown.id}><strong>{unknownLabels[unknown.category] ?? unknown.category}</strong> · <span>{unknown.statement}</span></li>)}</ul>
    </section>}
    {view.limitations.length > 0 && <section className="candidate-summary">
      <h3>이번 판단의 한계</h3>
      <ul>{view.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </section>}
    </details>
    <details className="result-evidence">
      <summary>후보와 공개 근거 보기</summary>
      {view.candidates.map(candidate => <article className="candidate-item" key={candidate.id}>
        <h3>{candidate.name}</h3>
        <p>{candidate.relationReason}</p>
        <a href={candidate.canonicalUrl} target="_blank" rel="noreferrer">정본 페이지 열기</a>
        {candidate.claims.map(claim => <div className="candidate-claim" key={claim.id}>
          <strong>{categoryLabels[claim.category] ?? claim.category}</strong>
          <p>{claim.statement}</p>
          {claim.sources.map(source => <div className="candidate-source" key={source.id}>
            <blockquote>{source.excerpt}</blockquote>
            <small>{view.policyVersion === 'candidate-policy-v3' ? '요청 기준일' : '조회'} {source.retrievedAt}</small>
            {source.scope && <small> · {source.scope === 'product' ? '제품 공통' : source.scope === 'offer' ? '요금제·경로: ' + source.offerId : '범위 미확인'}</small>}{' · '}
            <a href={source.url} target="_blank" rel="noreferrer">{source.title} 원문 열기</a>
          </div>)}
        </div>)}
      </article>)}
      {view.discoverySources.length > 0 && <div className="candidate-item">
        <h3>후보를 발견한 경로</h3>
        <ul>{view.discoverySources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · {source.note}</li>)}</ul>
      </div>}
    </details>
    <p className="transfer-note result-verification">{view.verificationNotice}</p>
  </>;
}
