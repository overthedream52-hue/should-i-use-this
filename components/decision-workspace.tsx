'use client';
import { useState } from 'react';
import CandidateReviewWorkspace from './candidate-review-workspace';
import SubscriptionWorkspace from './subscription-workspace';

type Example = { tool: string; source: string; situation: string; label: string; url: string };

export default function DecisionWorkspace({ example }: { example: Example }) {
  const [mode, setMode] = useState<'candidate' | 'document'>('candidate');
  return <>
    <nav className="decision-tabs" role="tablist" aria-label="판단 방식">
      <button role="tab" aria-selected={mode === 'candidate'} onClick={() => setMode('candidate')}>URL·후보 비교</button>
      <button role="tab" aria-selected={mode === 'document'} onClick={() => setMode('document')}>원문 하나 판단</button>
    </nav>
    {mode === 'candidate' ? <CandidateReviewWorkspace /> : <SubscriptionWorkspace example={example} />}
  </>;
}
