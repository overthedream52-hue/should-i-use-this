'use client';
import { useState } from 'react';
import Link from 'next/link';
import CandidateReviewResult from './candidate-review-result';
import useRoundTrip from './use-roundtrip';
import { importCandidateReview, prepareCandidateReview, type CandidateReviewFields, type CandidateReviewView } from '../lib/candidate-review-v1';

const blank: CandidateReviewFields = { name: '', url: '', suppliedText: '', situation: '' };
const example: CandidateReviewFields = {
  name: 'ForNerds',
  url: 'https://fornerds.ai/',
  suppliedText: '',
  situation: 'AI 제품 개발 외주가 나에게 맞는지 궁금하다.',
};

export default function CandidateReviewWorkspace() {
  const [fields, setFields] = useState<CandidateReviewFields>(blank);
  const [isExample, setIsExample] = useState(false);
  const { prepared, consent, setConsent, reply, updateReply, view, busy, message, result: resultRef, invalidate, prepare, importReply, copy } = useRoundTrip<ReturnType<typeof prepareCandidateReview>, CandidateReviewView>();

  function edit(key: keyof CandidateReviewFields, value: string) {
    invalidate();
    setIsExample(false);
    setFields(current => ({ ...current, [key]: value }));
  }
  function fillExample() {
    invalidate();
    setFields(example);
    setIsExample(true);
  }
  function clear() {
    invalidate();
    setFields(blank);
    setIsExample(false);
  }
  return <main className="transfer-shell candidate-shell">
    <header className="transfer-header"><Link href="/">Should I Use This</Link><span>결제·계약 전에 비교하기</span></header>
    <section className="transfer-intro">
      <p className="transfer-eyebrow">URL 하나에서 시작</p>
      <h1>이 제품이나 업체,<br />나에게 돈 쓸 가치가 있을까요?</h1>
      <p>본인의 구독 AI가 공개 근거와 대안을 찾습니다.<br />돌아온 답변은 이 브라우저에서 구조를 검사합니다.</p>
      <button className="transfer-secondary" onClick={fillExample}>ForNerds 공개 예시</button>
      <p className="transfer-note">페이지를 자동 방문하거나 계정·파일을 읽지 않습니다. 새로고침하면 입력과 결과가 사라집니다.</p>
    </section>
    <section className="transfer-card" aria-labelledby="candidate-prepare-title">
      <h2 id="candidate-prepare-title"><span>1</span> 비교할 후보와 내 상황</h2>
      {isExample && <p className="transfer-note">외주업체의 공개 홈페이지로 계약 전 판단을 연습하는 가상 예시입니다.</p>}
      <form onSubmit={event => {
        event.preventDefault();
        prepare(() => prepareCandidateReview(fields), '이름·URL·상황 중 하나를 입력하고 공개 HTTPS 주소인지 확인해 주세요.');
      }}>
        <label>후보 이름 <small>선택</small><input maxLength={200} value={fields.name} onChange={event => edit('name', event.target.value)} placeholder="예: ForNerds, vidIQ, Serena" /></label>
        <label>후보 URL <small>선택</small><input type="url" maxLength={2048} value={fields.url} onChange={event => edit('url', event.target.value)} placeholder="https://example.com/" /></label>
        <label>내 상황 <small>선택</small><textarea rows={4} maxLength={4000} value={fields.situation} onChange={event => edit('situation', event.target.value)} placeholder={'하려는 일, 현재 방법, 막히는 점을 아는 만큼만 적어 주세요.\n예: 홍보 영상을 만든다. 현재 방식은 인물 일관성이 부족하다.'} /></label>
        <details>
          <summary>추천 목록이나 게시물 내용도 넣기</summary>
          <label>공개 목록 텍스트<textarea rows={4} maxLength={16000} value={fields.suppliedText} onChange={event => edit('suppliedText', event.target.value)} placeholder="여러 후보가 적힌 공개 글의 텍스트를 붙여넣으세요." /></label>
        </details>
        <p className="transfer-note">공개 자료만 넣어 주세요. 비밀번호·비밀키·보안 문서·개인정보는 제외하세요. 입력은 서버로 자동 전송되지 않습니다.</p>
        <button className="transfer-primary" disabled={busy}>{busy ? '처리 중…' : '비교 자료 준비'}</button>
      </form>
    </section>
    {prepared && <>
      <section className="transfer-card" aria-labelledby="candidate-copy-title">
        <h2 id="candidate-copy-title"><span>2</span> 본인의 AI에 붙여넣기</h2>
        <p>공개 웹 검색이 가능한 본인의 Codex·ChatGPT·Claude에 직접 붙여넣으세요. 해당 서비스의 구독 한도가 적용됩니다.</p>
        <details><summary>전송 내용 전체 확인</summary><textarea aria-label="후보 조사 전송 내용" readOnly rows={8} value={prepared.prompt} onFocus={event => event.currentTarget.select()} /></details>
        <label className="transfer-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />전송할 URL·상황·목록을 확인했고 직접 전달합니다.</label>
        <button className="transfer-primary" disabled={!consent || busy} onClick={() => void copy('복사했습니다. 공개 웹 검색이 가능한 본인의 AI에 붙여넣으세요.')}>조사 요청 복사</button>
      </section>
      <section className="transfer-card" aria-labelledby="candidate-import-title">
        <h2 id="candidate-import-title"><span>3</span> AI 답변 가져오기</h2>
        <textarea aria-label="후보 조사 AI 답변" rows={7} maxLength={128000} value={reply} onChange={event => updateReply(event.target.value)} placeholder="AI의 JSON 답변을 그대로 붙여넣으세요." />
        <button className="transfer-primary" disabled={busy || !reply.trim()} onClick={() => importReply(
          (prepared, reply) => importCandidateReview(prepared.input, reply).view,
          '이 요청의 JSON 답변인지 확인해 주세요. 후보·출처·내 상황의 연결이 맞아야 합니다.',
        )}>후보 답변과 근거 확인</button>
      </section>
    </>}
    <p role="status" aria-live="polite" className="transfer-message">{message}</p>
    {view && <section className="transfer-card transfer-result" ref={resultRef} tabIndex={-1} role="region" aria-label="후보 결제 전 검토 결과">
      <p className="transfer-eyebrow">결제·계약 전 예상 판단{isExample ? ' · 가상 상황 예시' : ''}</p>
      <CandidateReviewResult view={view} />
    </section>}
    <footer className="transfer-footer"><button className="transfer-secondary" onClick={clear}>입력과 결과 지우기</button><p>외부 AI에 직접 전달한 내용은 이 브라우저에서 지워지지 않습니다.</p></footer>
  </main>;
}
