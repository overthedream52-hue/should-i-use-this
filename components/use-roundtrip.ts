'use client';
import { useRef, useState } from 'react';

export default function useRoundTrip<P extends { prompt: string }, V>() {
  const [prepared, setPrepared] = useState<P | null>(null);
  const [consent, setConsent] = useState(false);
  const [reply, setReply] = useState('');
  const [view, setView] = useState<V | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const result = useRef<HTMLElement | null>(null);

  function invalidate() {
    generation.current++;
    setBusy(false);
    setPrepared(null);
    setConsent(false);
    setReply('');
    setView(null);
    setMessage('');
  }
  function prepare(factory: () => P, errorMessage: string) {
    if (busy) return;
    const current = ++generation.current;
    setBusy(true);
    setMessage('');
    setView(null);
    try {
      const body = factory();
      if (current !== generation.current) return;
      setPrepared(body);
      setConsent(false);
      setReply('');
    } catch {
      if (current === generation.current) setMessage(errorMessage);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function importReply(factory: (prepared: P, reply: string) => V, errorMessage: string) {
    if (busy || !prepared) return;
    const current = ++generation.current;
    setBusy(true);
    setMessage('');
    setView(null);
    try {
      const body = factory(prepared, reply);
      if (current !== generation.current) return;
      setView(body);
      requestAnimationFrame(() => result.current?.focus());
    } catch {
      if (current === generation.current) setMessage(errorMessage);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  function updateReply(value: string) {
    generation.current++;
    setBusy(false);
    setReply(value);
    setView(null);
    setMessage('');
  }
  async function copy(successMessage: string) {
    if (!prepared || !consent) return;
    const current = generation.current;
    try {
      await navigator.clipboard.writeText(prepared.prompt);
      if (current === generation.current) setMessage(successMessage);
    } catch {
      if (current === generation.current) setMessage('자동 복사가 허용되지 않았습니다. 전송 내용에서 전체 선택 후 직접 복사해 주세요.');
    }
  }
  return { prepared, consent, setConsent, reply, updateReply, view, busy, message, result, invalidate, prepare, importReply, copy };
}
