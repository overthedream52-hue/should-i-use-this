import { readFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  importCandidateReview,
  candidateReviewAnswerSchema,
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
    expect(view.title).toBe('이전 답변의 조건을 다시 확인하세요');
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

describe('policy v2 regression gates (both real runtimes)', () => {
  // Synthetic documents, not vendor facts or observed productivity.
  const v2 = (trial = false) => {
    const fixture = load('product-hold.json');
    if (trial) fixture.fields.situation += '\n조건이 맞으면 체험을 원한다.';
    const { prepared, answer: old } = hydrate(fixture);
    const answer = { ...old, policyVersion: 'candidate-policy-v2' } as CandidateReviewAnswer;
    for (const source of answer.sources) Object.assign(source, { offerId: source.id === 'src_product' ? 'paid' : 'free' });
    for (const candidate of answer.candidates) for (const claim of candidate.claims) {
      const source = answer.sources.find(s => s.id === claim.sourceIds[0])!;
      Object.assign(claim, { offerId: source.id === 'src_product' ? 'paid' : 'free', quote: source.excerpt });
    }
    Object.assign(answer.commitment, { offerId: 'paid', nextAction: 'research_public' });
    if (trial) {
      answer.candidates[0].unknowns = [];
      answer.commitment.unknownIds = [];
      answer.sources[0].excerpt = 'Paid trial costs $5. No renewal. Cancel anytime. Only submitted data is processed with permission. Consistent scenes.';
      const claims = ['capability','trial','price','renewal','cancellation','permission','data_handling'].map((category, i) => ({ id: 'trial_' + i, category, statement: '합성 유료 체험 조건', sourceIds: ['src_product'], offerId: 'paid', quote: answer.sources[0].excerpt }));
      answer.candidates[0].claims = claims as CandidateReviewAnswer['candidates'][number]['claims'];
      answer.commitment.claimIds = claims.map(c => c.id);
      answer.commitment.action = 'trial_first';
      Object.assign(answer.commitment, { nextAction: 'optional_trial' });
      answer.userFacts.push({ id: 'uf_trial', category: 'trial_preference', statement: '조건이 맞으면 체험을 원한다.', userSpanIds: ['u3'] } as CandidateReviewAnswer['userFacts'][number]);
      answer.commitment.userFactIds.push('uf_trial');
    }
    return { prepared, answer };
  };
  const accepted = ({ prepared, answer }: ReturnType<typeof v2>) => {
    const view = importCandidateReview(prepared.input, JSON.stringify(answer)).view;
    const py = runPython('validate', { input: prepared.input, reply: JSON.stringify(answer) });
    expect(py.status, py.stderr).toBe(0);
    expect(JSON.parse(py.stdout).view).toEqual(view);
    return view;
  };
  const rejected = (x: ReturnType<typeof v2>) => {
    expect(() => importCandidateReview(x.prepared.input, JSON.stringify(x.answer))).toThrow();
    expect(runPython('validate', { input: x.prepared.input, reply: JSON.stringify(x.answer) }).status).not.toBe(0);
  };
  it('shares policy version and exact core instructions with portable prepare', () => {
    const { prepared } = v2();
    const python = JSON.parse(runPython('prepare', load('product-hold.json').fields).stdout);
    expect(prepared).toHaveProperty('policyVersion', 'candidate-policy-v3');
    expect(python.policyVersion).toBe(prepared.policyVersion);
    expect(python.corePolicy).toBe(prepared.corePolicy);
    expect(python.prompt).toContain(python.corePolicy);
    const schema = JSON.parse(prepared.prompt.split('JSON Schema:\n')[1].split('\n신뢰 입력:')[0]);
    expect(schema.properties.requestKey.const).toBe(prepared.packet.inputHash.slice(0, 32));
    expect(schema.properties.id).toBeUndefined();
    expect(schema.properties.inputHash).toBeUndefined();
    const pythonSchema = JSON.parse(python.prompt.split('JSON Schema:\n')[1].split('\n신뢰 입력:')[0]);
    expect(pythonSchema.properties.requestKey.const).toBe(python.packet.inputHash.slice(0, 32));
    expect(prepareCandidateReview(load('product-hold.json').fields, { id: python.input.id, asOf: python.input.asOf }).prompt).toBe(python.prompt);
    const common = z.toJSONSchema(candidateReviewAnswerSchema);
    expect(JSON.parse(readFileSync('.agents/skills/should-i-use-this/references/candidate-schema.json', 'utf8'))).toEqual(common);
    expect(prepared.prompt).toContain('현재 방식 유지');
    expect(prepared.prompt).not.toContain('현재 방법과 무료·오픈소스 대안을 포함하세요');
  });
  it('accepts scoped hold and labels a paid optional trial without free claim', () => {
    expect(accepted(v2()).nextAction).toBe('research_public');
    const view = accepted(v2(true));
    expect(view.title).toBe('체험 조건을 확인하세요');
    expect(view.nextActionText).not.toContain('무료');
  });
  it('rejects incompatible CTA, missing/foreign offer and unmatched literal quote', () => {
    const mutations = [
      (a: CandidateReviewAnswer) => Object.assign(a.commitment, { nextAction: 'optional_trial' }),
      (a: CandidateReviewAnswer) => Object.assign(a.candidates[0].claims[0], { offerId: 'free' }),
      (a: CandidateReviewAnswer) => Object.assign(a.candidates[0].claims[0], { quote: 'unsupported text' }),
      (a: CandidateReviewAnswer) => Object.assign(a.commitment, { question: '불필요한 질문?' }),
      (a: CandidateReviewAnswer) => Object.assign(a, { policyVersion: '' }),
      (a: CandidateReviewAnswer) => Object.assign(a, { policyVersion: null }),
      (a: CandidateReviewAnswer) => { delete a.policyVersion; },
      (a: CandidateReviewAnswer) => { delete a.commitment.nextAction; },
      (a: CandidateReviewAnswer) => { delete a.sources[0].offerId; },
    ];
    for (const mutate of mutations) { const x = v2(); mutate(x.answer); rejected(x); }
    for (const offerId of [null, 'absent']) { const x = v2(true); Object.assign(x.answer.commitment, { offerId }); rejected(x); }
    const x = v2(true); x.answer.commitment.userFactIds = x.answer.commitment.userFactIds.filter(id => id !== 'uf_trial'); rejected(x);
  });
  it('distinguishes exact Unicode quotes and enforces input array limits', () => {
    const x = v2(); x.answer.sources[0].excerpt = '가😀é'; Object.assign(x.answer.candidates[0].claims[0], { quote: '😀é' }); accepted(x);
    Object.assign(x.answer.candidates[0].claims[0], { quote: '😀é' }); rejected(x);
    const large = v2(); while(large.answer.sources.length <= 20) large.answer.sources.push({ ...large.answer.sources[0], id: 'src_' + large.answer.sources.length }); rejected(large);
  });
  it('allows a scoped positive decision without requiring a trial', () => {
    const x = v2(true);
    x.answer.commitment.action = 'review_payment';
    x.answer.commitment.nextAction = 'review_terms';
    x.answer.candidates[0].claims.push({ ...x.answer.candidates[0].claims[0], id: 'cl_maint', category: 'maintenance' });
    x.answer.commitment.claimIds.push('cl_maint');
    expect(accepted(x).nextAction).toBe('review_terms');
    const hold = v2();
    hold.answer.commitment.nextAction = 'ask_user';
    hold.answer.commitment.question = '목표 결과물은 무엇인가요?';
    expect(accepted(hold).question).toBe('목표 결과물은 무엇인가요?');
  });
  it('keeps the Python skill portable outside the repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'siut-portable-'));
    cpSync('.agents/skills/should-i-use-this', join(dir, 'skill'), { recursive: true });
    const py = spawnSync('python3', [join(dir, 'skill/scripts/candidate_contract.py'), 'prepare'], { cwd: dir, input: JSON.stringify(load('product-hold.json').fields), encoding: 'utf8' });
    expect(py.status, py.stderr).toBe(0);
    expect(JSON.parse(py.stdout).prompt).toContain('candidate-policy-v3');
    const x = v2();
    const validated = spawnSync('python3', [join(dir, 'skill/scripts/candidate_contract.py'), 'validate'], { cwd: dir, input: JSON.stringify({ input: x.prepared.input, reply: JSON.stringify(x.answer) }), encoding: 'utf8' });
    expect(validated.status, validated.stderr).toBe(0);
    expect(JSON.parse(validated.stdout).view).toEqual(importCandidateReview(x.prepared.input, JSON.stringify(x.answer)).view);
  });
  it('makes legacy answers review-only without discarding original explanation', () => {
    const x = hydrate(load('fornerds-hold.json'));
    const result = importCandidateReview(x.prepared.input, JSON.stringify(x.answer)).view;
    expect(result.legacy).toBe(true);
    expect(result.nextAction).toBe('research_public');
    expect(result.statement).toBe(x.answer.commitment.statement);
    expect(result.verificationNotice).toContain('이전 형식');
  });
});
