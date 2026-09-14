'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SubscriptionResult from './subscription-result';
import type { PreparedTransfer, TransferView } from '../lib/subscription-transfer';

type Fields = { tool: string; source: string; situation: string };
type Example = Fields & { label: string; url: string };
const blank: Fields = { tool: '', source: '', situation: '' };
export default function SubscriptionWorkspace({ example }: { example: Example }) {
  const [fields, setFields] = useState<Fields>(blank);
  const [prepared, setPrepared] = useState<PreparedTransfer | null>(null);
  const [consent, setConsent] = useState(false);
  const [reply, setReply] = useState('');
  const [view, setView] = useState<TransferView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isExample, setIsExample] = useState(false);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const result = useRef<HTMLElement | null>(null);
  useEffect(() => () => { generation.current++; pending.current?.abort(); }, []);
  function invalidate() {
    generation.current++; pending.current?.abort(); setBusy(false);
    setPrepared(null); setConsent(false); setReply(''); setView(null); setMessage('');
  }
  function edit(key: keyof Fields, value: string) { invalidate(); setIsExample(false); setFields(f => ({ ...f, [key]: value })); }
  async function send(action: 'prepare' | 'import') {
    if (busy) return;
    const current = ++generation.current;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setMessage(''); setView(null);
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify(action === 'prepare' ? { action, ...fields } : { action, input: prepared?.input, reply }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '처리하지 못했습니다.');
      if (current !== generation.current) return;
      if (action === 'prepare') { setPrepared(body); setConsent(false); setReply(''); }
      else { setView(body.view); requestAnimationFrame(() => result.current?.focus()); }
    } catch (error) {
      if (current === generation.current) setMessage(controller.signal.aborted ? '연결이 지연되었습니다. 입력은 유지되니 다시 시도해 주세요.' : error instanceof Error ? error.message : '앱 연결을 확인해 주세요.');
    } finally { clearTimeout(timer); if (current === generation.current) setBusy(false); }
  }
  async function copy() {
    if (!prepared || !consent) return;
    const current = generation.current;
    try { await navigator.clipboard.writeText(prepared.prompt); if (current === generation.current) setMessage('복사했습니다. 본인의 Codex·ChatGPT·Claude에 붙여넣으세요.'); }
    catch { if (current === generation.current) setMessage('자동 복사가 허용되지 않았습니다. 전송 내용에서 전체 선택 후 직접 복사해 주세요.'); }
  }
  return <main className="transfer-shell">
    <header className="transfer-header"><Link href="/">Should I Use This</Link><span>개인 구독으로 판단하기</span></header>
    <section className="transfer-intro">
      <p className="transfer-eyebrow">설치하기 전에, 내 상황부터</p>
      <h1>이 도구, 나에게 필요할까요?</h1>
      <p>자료를 준비하고 본인의 AI에 물어보세요.<br />돌아온 답변은 원문과 함께 확인할 수 있습니다.</p>
      <button className="transfer-secondary" onClick={() => { invalidate(); setFields({ tool: example.tool, source: example.source, situation: example.situation }); setIsExample(true); }}>공개 예시로 시작</button>
      <p className="transfer-note">계정 자동 연결·자동 정보 수집은 없습니다. 이 탭을 새로고침하면 입력과 결과가 사라집니다.</p>
    </section>
    <section className="transfer-card" aria-labelledby="prepare-title">
      <h2 id="prepare-title"><span>1</span> 분석할 자료 준비</h2>
      {isExample && <p className="transfer-note">{example.label} · <a href={example.url} target="_blank" rel="noreferrer">출처 보기</a><br />본인의 상황을 분석한 결과는 아닙니다.</p>}
      <form onSubmit={e => { e.preventDefault(); void send('prepare'); }}>
        <label>도구 이름<input required maxLength={200} value={fields.tool} onChange={e => edit('tool', e.target.value)} placeholder="예: Flowise Cloud" /></label>
        <label>내 상황 한 줄 <small>선택</small><textarea rows={2} maxLength={4000} value={fields.situation} onChange={e => edit('situation', e.target.value)} placeholder="지금 하는 일과 줄이고 싶은 불편을 적어 주세요." /></label>
        <label>공개 설명 문서<textarea required rows={5} maxLength={32000} value={fields.source} onChange={e => edit('source', e.target.value)} placeholder="도구의 설명 문서를 붙여넣으세요. 제목·표·조건도 함께 넣어 주세요." /></label>
        <p className="transfer-note">공개 자료만 넣어 주세요. 비밀번호·비밀키·보안 문서·개인정보는 제외하세요. 입력한 공개 문서와 상황은 이 웹 앱의 서버로 전송되어 분석 요청 생성과 답변 검사에만 사용됩니다. 앱은 계정이나 데이터베이스에 저장하지 않으며 AI 서비스로 자동 전송하지 않습니다.</p>
        <button className="transfer-primary" disabled={busy}>{busy ? '처리 중…' : '분석 자료 준비'}</button>
      </form>
    </section>
    {prepared && <>
      <section className="transfer-card" aria-labelledby="copy-title">
        <h2 id="copy-title"><span>2</span> 본인의 AI에 붙여넣기</h2>
        <p>아래에는 공개 문서와 입력한 상황, 답변 형식이 들어 있습니다. 본인이 구독한 Codex·ChatGPT·Claude에 직접 붙여넣으세요. 해당 서비스의 사용 한도가 적용됩니다.</p>
        <details><summary>전송 내용 전체 확인</summary><textarea aria-label="전송 내용" readOnly rows={8} value={prepared.prompt} onFocus={e => e.currentTarget.select()} /></details>
        <label className="transfer-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />이 내용을 확인했고, 내 AI에 전달할 내용을 직접 선택했습니다.</label>
        <button className="transfer-primary" disabled={!consent || busy} onClick={() => void copy()}>분석 요청 복사</button>
      </section>
      <section className="transfer-card" aria-labelledby="import-title">
        <h2 id="import-title"><span>3</span> AI 답변 가져오기</h2>
        <p>AI가 반환한 답변 전체를 아래에 붙여넣으세요.</p>
        <textarea aria-label="AI 답변" rows={6} maxLength={64000} value={reply} onChange={e => { generation.current++; pending.current?.abort(); setBusy(false); setReply(e.target.value); setView(null); setMessage(''); }} placeholder="AI의 JSON 답변을 그대로 붙여넣으세요." />
        <button className="transfer-primary" disabled={busy || !reply.trim()} onClick={() => void send('import')}>답변과 근거 확인</button>
      </section>
    </>}
    <p role="status" aria-live="polite" className="transfer-message">{message}</p>
    {view && <section className="transfer-card transfer-result" ref={result} tabIndex={-1} aria-label="개인 구독 분석 결과">
      <p className="transfer-eyebrow">업무 도입 판단 · 예상{isExample ? ' · 가상 상황 예시' : ''}</p>
      <SubscriptionResult view={view} />
    </section>}
    <footer className="transfer-footer"><button className="transfer-secondary" onClick={() => { invalidate(); setFields(blank); setIsExample(false); }}>입력과 결과 지우기</button><p>앱은 입력과 결과를 계정이나 데이터베이스에 저장하지 않습니다. 외부 AI에 직접 전달한 내용은 여기서 지워지지 않습니다.</p></footer>
  </main>;
}
