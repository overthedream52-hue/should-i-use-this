import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  importCandidateReview,
  buildCandidateReviewPacket,
  type CandidateReviewAnswer,
  prepareCandidateReview,
  type CandidateReviewFields,
} from '../../lib/candidate-review-v1';

const pythonContract = '.agents/skills/should-i-use-this/scripts/candidate_contract.py';
const runPython = (command: 'prepare' | 'validate', value: unknown) => spawnSync('python3', [pythonContract, command], { cwd: process.cwd(), input: JSON.stringify(value), encoding: 'utf8' });

type Fixture = { fields: CandidateReviewFields; answer: Record<string, unknown> };
const load = (name: string) => JSON.parse(readFileSync(new URL('../fixtures/candidate-review/' + name, import.meta.url), 'utf8')) as Fixture;
const hydrate = (fixture: Fixture) => {
  const prepared = prepareCandidateReview(fixture.fields, { id: '00000000-0000-4000-8000-000000000001', asOf: '2026-09-15' });
  const answer = JSON.parse(JSON.stringify(fixture.answer).replaceAll('$ID', prepared.input.id).replaceAll('$HASH', prepared.packet.inputHash)) as CandidateReviewAnswer;
  return { prepared, answer };
};

describe('candidate review preparation', () => {
  it('binds a public vendor URL and Korean user lines to one research prompt', () => {
    const { prepared } = hydrate(load('fornerds-hold.json'));
    expect(prepared.input.subject).toEqual({ name: 'ForNerds', url: 'https://fornerds.ai/', suppliedText: '', sourceKind: 'single_candidate' });
    const anchored = prepareCandidateReview({ ...load('fornerds-hold.json').fields, url: 'https://fornerds.ai/#pricing' }, { id: '00000000-0000-4000-8000-000000000002', asOf: '2026-09-15' });
    expect(anchored.input.subject.url).toBe('https://fornerds.ai/');
    expect(prepared.packet.userSpans).toEqual([{ id: 'u1', text: 'AI 제품 개발 외주가 나에게 맞는지 궁금하다.', start: 0, end: 26 }]);
    expect(prepared.packet.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.prompt).toContain('공개 웹을 검색');
    expect(prepared.prompt).toContain('service_vendor');
    expect(prepared.prompt).toContain('https://fornerds.ai/');
    expect(prepared.prompt).toContain('review_payment=capability+price+permission+data_handling+maintenance');
    expect(prepared.prompt).toContain('do_not_pay는 사용자 진술에 연결된 현재 방법');
  });

  it('rejects missing input, unsafe URLs, oversized input and invalid options', () => {
    const base = { name: 'x', url: '', suppliedText: '', situation: '' };
    expect(() => prepareCandidateReview({ name: '', url: '', suppliedText: '', situation: '' })).toThrow();
    for (const url of ['http://fornerds.ai/','https://user:pass@fornerds.ai/','https://localhost/path','https://a.localhost/path','https://127.0.0.1/path','https://127.1/path','https://10.0.0.1/path','https://[::1]/path','https://fornerds.ai/?token=private','javascript:alert(1)']) {
      expect(() => prepareCandidateReview({ ...base, url })).toThrow();
      expect(runPython('prepare', { ...base, url }).status).not.toBe(0);
    }
    expect(() => prepareCandidateReview({ ...base, suppliedText: 'x'.repeat(16001) })).toThrow();
    expect(() => prepareCandidateReview({ ...base, situation: 'x'.repeat(4001) })).toThrow();
    expect(() => prepareCandidateReview(base, { maxCandidates: 0 })).toThrow();
    expect(() => prepareCandidateReview(base, { maxCandidates: 6 })).toThrow();
    expect(() => prepareCandidateReview(base, { requestedKinds: ['saas', 'saas'] })).toThrow();
  });
});

describe('candidate review validation', () => {
  it('accepts a structurally grounded ForNerds hold and keeps vendor claims separate', () => {
    const { prepared, answer } = hydrate(load('fornerds-hold.json'));
    const { view } = importCandidateReview(prepared.input, JSON.stringify(answer));
    expect(view.action).toBe('hold_contract');
    expect(view.title).toBe('계약 조건을 더 확인해야 합니다');
    expect(view.target?.name).toBe('ForNerds');
    expect(view.unknowns).toHaveLength(3);
    expect(view.candidates[0].claims.find(claim => claim.category === 'vendor_claim')?.sourceOwner).toBe('candidate');
    expect(view.verificationNotice).toContain('원문 진위');
  });

  it('accepts fenced JSON for a product payment hold and exposes an alternative', () => {
    const { prepared, answer } = hydrate(load('product-hold.json'));
    const fence = String.fromCharCode(96).repeat(3);
    const { view } = importCandidateReview(prepared.input, fence + 'json\n' + JSON.stringify(answer) + '\n' + fence);
    expect(view.action).toBe('hold_payment');
    expect(view.alternatives.map(candidate => candidate.name)).toEqual(['무료 영상 방식']);
  });

  it('allows a proposal request only with an explicit outsourcing gap and vendor identity, capability and process', () => {
    const { prepared, answer } = hydrate(load('fornerds-proposal.json'));
    expect(importCandidateReview(prepared.input, JSON.stringify(answer)).view.action).toBe('request_proposal');
    const portable = runPython('validate', { input: prepared.input, reply: JSON.stringify(answer) });
    expect(portable.status, portable.stderr).toBe(0);
  });

  it('does not let an active proposal hide a target contract unknown', () => {
    const { prepared, answer } = hydrate(load('fornerds-proposal.json'));
    answer.commitment.unknownIds = answer.commitment.unknownIds.slice(0, 2);
    expect(() => importCandidateReview(prepared.input, JSON.stringify(answer))).toThrow('all target unknowns must be visible');
    expect(runPython('validate', { input: prepared.input, reply: JSON.stringify(answer) }).status).not.toBe(0);
  });

  it('rejects binding, reference, source, action and license violations', () => {
    const fixture = load('fornerds-hold.json');
    const cases: Array<(answer: CandidateReviewAnswer) => void> = [
      answer => { answer.inputHash = '0'.repeat(64); },
      answer => { answer.sources[0].retrievedAt = '2026-09-14'; },
      answer => { answer.sources[0].url = 'https://localhost/private'; },
      answer => { answer.candidates[0].claims[0].sourceIds = ['missing']; },
      answer => { answer.workstream.userFactIds = ['missing']; },
      answer => { answer.commitment.claimIds = ['missing']; },
      answer => { answer.candidates[0].claims[2].sourceIds = []; },
      answer => { answer.sources[0].owner = 'independent'; },
      answer => { answer.commitment.action = 'review_payment'; },
      answer => { answer.candidates[0].kind = 'open_source'; answer.candidates[0].license = { status: 'documented', spdxId: 'MIT', sourceIds: [] }; }
    ];
    for (const mutate of cases) {
      const { prepared, answer } = hydrate(fixture);
      mutate(answer);
      expect(() => importCandidateReview(prepared.input, JSON.stringify(answer))).toThrow();
    }
  });

  it('binds every claim and canonical source to the same candidate', () => {
    const { prepared, answer } = hydrate(load('product-hold.json'));
    answer.candidates[0].claims[0].sourceIds = ['src_free'];
    expect(() => importCandidateReview(prepared.input, JSON.stringify(answer))).toThrow();
  });

  it('uses a null-target research hold only when research is unavailable', () => {
    const { prepared, answer } = hydrate(load('fornerds-hold.json'));
    answer.status = 'hold';
    answer.candidates = [];
    answer.sources = [];
    answer.commitment = { targetCandidateId: null, action: 'research_hold', statement: '공개 웹을 확인할 수 없다.', userFactIds: [], claimIds: [], alternativeClaimIds: [], alternativeCandidateIds: [], currentMethodIds: [], unknownIds: [] };
    expect(importCandidateReview(prepared.input, JSON.stringify(answer)).view.action).toBe('research_hold');
    answer.commitment.action = 'hold_contract';
    expect(() => importCandidateReview(prepared.input, JSON.stringify(answer))).toThrow();
  });

  it('rejects active actions without a user-stated gap and target capability', () => {
    const { prepared, answer } = hydrate(load('fornerds-hold.json'));
    answer.commitment.action = 'request_proposal';
    expect(() => importCandidateReview(prepared.input, JSON.stringify(answer))).toThrow();

    const product = hydrate(load('product-hold.json'));
    product.answer.commitment.action = 'trial_first';
    product.answer.commitment.userFactIds = ['uf_need'];
    expect(() => importCandidateReview(product.prepared.input, JSON.stringify(product.answer))).toThrow();
  });

  it('rejects invented quantified productivity in the decision', () => {
    const { prepared, answer } = hydrate(load('product-hold.json'));
    answer.commitment.statement = '생산성이 30% 증가하므로 결제한다.';
    expect(() => importCandidateReview(prepared.input, JSON.stringify(answer))).toThrow();
  });

  it('requires a current method or alternative before saying not to pay', () => {
    const { prepared, answer } = hydrate(load('product-hold.json'));
    answer.commitment.action = 'do_not_pay';
    expect(importCandidateReview(prepared.input, JSON.stringify(answer)).view.action).toBe('do_not_pay');
    answer.commitment.alternativeCandidateIds = [];
    answer.commitment.alternativeClaimIds = [];
    answer.commitment.currentMethodIds = [];
    expect(() => importCandidateReview(prepared.input, JSON.stringify(answer))).toThrow('do not pay needs current method or alternative');
    expect(runPython('validate', { input: prepared.input, reply: JSON.stringify(answer) }).status).not.toBe(0);
  });

  it('requires a cited capability for every displayed alternative comparison', () => {
    const { prepared, answer } = hydrate(load('product-hold.json'));
    answer.commitment.alternativeClaimIds = [];
    expect(() => importCandidateReview(prepared.input, JSON.stringify(answer))).toThrow('alternative capability required');
    answer.commitment.alternativeClaimIds = ['cl_cap'];
    expect(() => importCandidateReview(prepared.input, JSON.stringify(answer))).toThrow('invalid alternative evidence');
  });

  it('binds a payment comparison alternative to the decision gap', () => {
    const { prepared, answer } = hydrate(load('product-hold.json'));
    answer.commitment.action = 'do_not_pay';
    answer.candidates[1].userFactIds = ['uf_need'];
    expect(() => importCandidateReview(prepared.input, JSON.stringify(answer))).toThrow('alternative must address decision gap');
    expect(runPython('validate', { input: prepared.input, reply: JSON.stringify(answer) }).status).not.toBe(0);
  });

  it('rejects commentary, empty and oversized replies', () => {
    const { prepared } = hydrate(load('fornerds-hold.json'));
    for (const reply of ['', '앞말 {"secret":"private-test"}', 'x'.repeat(128001)]) {
      expect(() => importCandidateReview(prepared.input, reply)).toThrow();
    }
  });
});

describe('candidate review portable parity', () => {
  it('prepares the same packet fields and SHA-256 hash', () => {
    const fields = load('fornerds-hold.json').fields;
    const result = runPython('prepare', fields);
    expect(result.status, result.stderr).toBe(0);
    const prepared = JSON.parse(result.stdout);
    expect(prepared.packet).toEqual(buildCandidateReviewPacket(prepared.input));
  });

  it('normalizes accepted public URLs the same way in both runtimes', () => {
    const urls = [
      'https://example.com:443/path?q=hello%20world',
      'https://예시.한국/경로?q=한글 값',
      'https://example.com/a/../b',
      'https://example.com/a/%2e%2e/b',
    ];
    for (const url of urls) {
      const fields = { name: '후보', url, suppliedText: '', situation: '' };
      const browser = prepareCandidateReview(fields, { id: '00000000-0000-4000-8000-000000000003', asOf: '2026-09-15' });
      const portable = runPython('prepare', fields);
      expect(portable.status, portable.stderr).toBe(0);
      const parsed = JSON.parse(portable.stdout);
      expect(parsed.input.subject.url).toBe(browser.input.subject.url);
      expect(parsed.packet).toEqual(buildCandidateReviewPacket(parsed.input));
    }
  });

  it('renders the same ForNerds hold view and rejects cross-candidate evidence', () => {
    const { prepared, answer } = hydrate(load('fornerds-hold.json'));
    const result = runPython('validate', { input: prepared.input, reply: JSON.stringify(answer) });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).view).toEqual(importCandidateReview(prepared.input, JSON.stringify(answer)).view);

    const product = hydrate(load('product-hold.json'));
    product.answer.candidates[0].claims[0].sourceIds = ['src_free'];
    const rejected = runPython('validate', { input: product.prepared.input, reply: JSON.stringify(product.answer) });
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('INVALID:');
    expect(rejected.stderr).not.toContain('장면');
  });
});

describe('candidate review preregistered quality run', () => {
  it('keeps the four quality axes and expected actions separate from contract fixtures', () => {
    const root = new URL('../../docs/evals/2026-09-15-candidate-review/', import.meta.url);
    const gold = JSON.parse(readFileSync(new URL('gold-rules.json', root), 'utf8'));
    const results = JSON.parse(readFileSync(new URL('results.json', root), 'utf8'));
    const modelRun = JSON.parse(readFileSync(new URL('model-output.json', root), 'utf8'));
    const audit = JSON.parse(readFileSync(new URL('claim-audit.json', root), 'utf8'));
    type GoldCase = { id: string; expectedAction: string; forbiddenActions: string[] };
    type EvalCase = { id: string; action: string; sources: string[]; scores: Record<string, string> };
    const goldCases = gold.cases as GoldCase[];
    const resultCases = results.cases as EvalCase[];
    expect(goldCases).toHaveLength(4);
    expect(results.contractFixturesAreSeparate).toBe(true);
    expect(resultCases.map(item => item.id)).toEqual(goldCases.map(item => item.id));
    expect(modelRun.outputs.map((item: { id: string }) => item.id)).toEqual(goldCases.map(item => item.id));
    for (const expected of goldCases) {
      const actual = resultCases.find(item => item.id === expected.id)!;
      const modelOutput = modelRun.outputs.find((item: { id: string }) => item.id === expected.id)!;
      expect(actual.action).toBe(expected.expectedAction);
      expect(modelOutput.action).toBe(expected.expectedAction);
      expect(expected.forbiddenActions).not.toContain(actual.action);
      expect(modelOutput.sourceUrls.length).toBeGreaterThan(0);
      expect(actual.sources.every((url: string) => url.startsWith('https://'))).toBe(true);
      expect(Object.keys(actual.scores)).toEqual(gold.axes);
      expect(Object.values(actual.scores)).toEqual(gold.axes.map(() => 'pass'));
      expect(audit.claims.some((claim: { caseId: string; matched: boolean }) => claim.caseId === expected.id && claim.matched)).toBe(true);
    }
    expect(audit.claims.every((claim: { sourceUrl: string; matched: boolean; location: string }) => claim.matched && claim.sourceUrl.startsWith('https://') && claim.location.length > 0)).toBe(true);
  });

  it('preserves the mixed-workstream annotation as explanation regressions', () => {
    const mixed = JSON.parse(readFileSync(new URL('../fixtures/candidate-review/mixed-workstreams.json', import.meta.url), 'utf8'));
    expect(mixed.expected).toEqual({
      forbiddenSameReason: true,
      forbiddenProductivityPattern: '%|퍼센트|시간 절감|생산성 [0-9]',
    });
    const gold = JSON.parse(readFileSync(new URL('../../docs/evals/2026-09-15-candidate-review/gold-rules.json', import.meta.url), 'utf8'));
    expect(gold.mixedWorkstreamRegression).toMatchObject({
      forbidJobScopeReduction: true,
      forbidSameReasonForAll: true,
      forbidInventedProductivityNumbers: true,
      forbidOverlappingFunctionEqualsIdentical: true,
    });
    const root = new URL('../../docs/evals/2026-09-15-candidate-review/', import.meta.url);
    const modelRun = JSON.parse(readFileSync(new URL('model-output.json', root), 'utf8'));
    const outputs = modelRun.mixedWorkstreamOutput as Array<{ candidate: string; inferredWorkstream: string; relationReason: string }>;
    expect(outputs.map(item => item.candidate)).toEqual(mixed.fields.suppliedText.split(', '));
    expect(new Set(outputs.map(item => item.relationReason)).size).toBe(outputs.length);
    expect(new Set(outputs.map(item => item.inferredWorkstream)).size).toBe(outputs.length);
    expect(outputs.map(item => item.relationReason).join(' ')).not.toMatch(/\d+\s*%|시간\s*절감|생산성\s*\d/);
  });
});
