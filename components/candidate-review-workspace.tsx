'use client';
import { useState } from 'react';
import Link from 'next/link';
import CollectionImport from './collection-import';
import AdoptionResult from './adoption-result';
import {prepareAdoptionWorkflow,bindSourceReply,importAdoptionReview,parseAnswerEnvelope,type AdoptionView} from '../lib/adoption-review';
import CandidateReviewResult from './candidate-review-result';
import useRoundTrip from './use-roundtrip';
import { importCandidateReview, type CandidateReviewFields, type CandidateReviewView } from '../lib/candidate-review-v1';

const blank: CandidateReviewFields = { name: '', url: '', suppliedText: '', situation: '' };
const example: CandidateReviewFields = {
  name: 'ForNerds',
  url: 'https://fornerds.ai/',
  suppliedText: '',
  situation: 'AI 제품 개발 외주가 나에게 맞는지 궁금하다.',
};

export default function CandidateReviewWorkspace() {
  const [fields, setFields] = useState<CandidateReviewFields>(blank);
  const [collectionEpoch,setCollectionEpoch] = useState(0);
  const [isExample, setIsExample] = useState(false);
  const { prepared, consent, setConsent, reply, updateReply, view, busy, message, result: resultRef, invalidate, prepare, importReply, copy } = useRoundTrip<ReturnType<typeof prepareAdoptionWorkflow>, CandidateReviewView | AdoptionView>();

  function edit(key: keyof CandidateReviewFields, value: string) {
    setCollectionEpoch(n=>n+1);
    invalidate();
    setIsExample(false);
    setFields(current => ({ ...current, [key]: value }));
  }
  function fillExample() {
    setCollectionEpoch(n=>n+1);
    invalidate();
    setFields(example);
    setIsExample(true);
  }
  function clear() {
    setCollectionEpoch(n=>n+1);
    invalidate();
    setFields(blank);
    setIsExample(false);
  }
  return <main className="transfer-shell candidate-shell">
    <header className="transfer-header"><Link href="/">Should I Use This</Link><span>설치·결제 전에 비교하기</span></header>
    <section className="transfer-intro">
      <p className="transfer-eyebrow">URL 하나에서 시작</p>
      <h1>이 도구나 서비스,<br />내 업무에 도입할 가치가 있을까요?</h1>
      <p>본인의 구독 AI로 공개 자료를 모으고 도입 가치를 판단합니다.<br />무료·유료 여부와 내 업무에 맞는지는 따로 확인합니다.</p>
      <button className="transfer-secondary" onClick={fillExample}>ForNerds 공개 예시</button>
      <p className="transfer-note">페이지를 자동 방문하거나 계정·파일을 읽지 않습니다. 새로고침하면 입력과 결과가 사라집니다.</p>
    </section>
    <section className="transfer-card" aria-labelledby="candidate-prepare-title">
      <h2 id="candidate-prepare-title"><span>1</span> 비교할 후보와 내 상황</h2>
      {isExample && <p className="transfer-note">외주업체의 공개 홈페이지로 계약 전 판단을 연습하는 가상 예시입니다.</p>}
      <form onSubmit={event => {
        event.preventDefault();
        prepare(() => prepareAdoptionWorkflow(fields), '이름·URL·상황 중 하나를 입력하고 공개 HTTPS 주소인지 확인해 주세요.');
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
    <section className="transfer-card" aria-labelledby="local-inbox-title">
      <h2 id="local-inbox-title">자동으로 찾고 계속 기록하기</h2>
      <p>Mac 발견함에서 공개 후보 수집·분석 기록·개선안 승인을 함께 관리할 수 있습니다.</p>
      <a className="transfer-secondary" href="http://127.0.0.1:3127/" target="_blank" rel="noopener noreferrer">내 Mac 발견함 열기</a>
      <p className="transfer-note">같은 Mac에서 로컬 서비스를 실행해야 열립니다. 이 페이지의 입력은 자동으로 전달되지 않습니다.</p>
    </section>
    <CollectionImport key={collectionEpoch} onApply={data=>{invalidate();setIsExample(false);setFields(current=>({...current,...data}));setCollectionEpoch(n=>n+1);}} />
    {prepared && <>
      <section className="transfer-card" aria-labelledby="candidate-copy-title">
        <h2 id="candidate-copy-title"><span>2</span> {prepared.stage === 'research' ? '공개 근거 모으기' : '고정한 근거로 도입 판단하기'}</h2>
        <p>{prepared.stage === 'research' ? '검색 가능한 본인의 AI에 자료 수집을 요청하세요. 돌아온 자료를 가져오면 판단 요청이 만들어집니다.' : '번호 붙인 원문을 본인의 AI에 전달하세요. AI는 원문을 다시 쓰지 않고 근거 번호로 판단합니다.'} 해당 서비스의 구독 한도가 적용됩니다.</p>
        {'collectionIgnoredProse' in prepared && prepared.collectionIgnoredProse ? <p className="transfer-note">자료 JSON 밖의 부연 설명은 근거로 반영하지 않았습니다.</p> : null}
        {prepared.stage === 'judgment' && <p className="transfer-note">공개 근거 {prepared.packet.evidence.length}개를 이 요청에 고정했습니다. {prepared.packet.provenance === 'ai_collected' ? 'AI 수집 자료' : '직접 제공한 자료'}이며 원문 진위는 미검증입니다.</p>}
        <details><summary>전송 내용 전체 확인</summary><textarea aria-label="후보 조사 전송 내용" readOnly rows={8} value={prepared.prompt} onFocus={event => event.currentTarget.select()} /></details>
        <label className="transfer-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />전송할 URL·상황·목록을 확인했고 직접 전달합니다.</label>
        <button className="transfer-primary" disabled={!consent || busy} onClick={() => void copy('복사했습니다. 공개 웹 검색이 가능한 본인의 AI에 붙여넣으세요.')}>조사 요청 복사</button>
      </section>
      <section className="transfer-card" aria-labelledby="candidate-import-title">
        <h2 id="candidate-import-title"><span>3</span> {prepared.stage === 'research' ? '공개 자료 가져오기' : '도입 판단 가져오기'}</h2>
        <textarea aria-label="후보 조사 AI 답변" rows={7} maxLength={128000} value={reply} onChange={event => updateReply(event.target.value)} placeholder="AI의 JSON 답변을 그대로 붙여넣으세요." />
        <button className="transfer-primary" disabled={busy || !reply.trim()} onClick={() => {
          if (prepared.stage === 'research') {
            try {
              if (parseAnswerEnvelope(reply, 128000).data?.format === 'source-bundle-v1') {
                prepare(() => bindSourceReply(prepared.input, reply), '이 요청의 공개 자료인지 확인해 주세요. 원문이 비어 있거나 출처·크기 조건이 맞지 않습니다.');
                return;
              }
            } catch { /* Legacy import below retains its own strict boundary. */ }
          }
          importReply((current, answer) => current.stage === 'judgment' ? importAdoptionReview(current.input, answer).view : importCandidateReview(current.input, answer).view,
            '이 요청의 JSON 답변인지 확인해 주세요. 후보·출처·내 상황의 연결이 맞아야 합니다.');
        }}>후보 답변과 근거 확인</button>
      </section>
    </>}
    <p role="status" aria-live="polite" className="transfer-message">{message}</p>
    {view && <section className="transfer-card transfer-result" ref={resultRef} tabIndex={-1} role="region" aria-label="후보 결제 전 검토 결과">
      <p className="transfer-eyebrow">설치·결제 전 예상 판단{isExample ? ' · 가상 상황 예시' : ''}</p>
      {'version' in view ? <AdoptionResult view={view} /> : <CandidateReviewResult view={view} />}
    </section>}
    <footer className="transfer-footer"><button className="transfer-secondary" onClick={clear}>입력과 결과 지우기</button><p>외부 AI에 직접 전달한 내용은 이 브라우저에서 지워지지 않습니다.</p></footer>
  </main>;
}
