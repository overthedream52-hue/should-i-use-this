import { z } from 'zod';
import { compactAnswerSchema, expandCompactAnswer } from './candidate-compact';
import compactPolicy from '../.agents/skills/should-i-use-this/references/candidate-compact-policy.json';
import { sha256Hex } from './sha256';
import policy from '../.agents/skills/should-i-use-this/references/candidate-policy.json';

const kinds = ['mcp','skill','plugin','software','saas','open_source','service_vendor'] as const;
const roles = ['target','free_open_source','paid_alternative','vendor_alternative'] as const;
const claimCategories = ['identity','capability','price','trial','renewal','cancellation','requirement','permission','data_handling','maintenance','process','ownership','vendor_claim'] as const;
const unknownCategories = ['price','permission','data_handling','maintenance','ownership','acceptance','payment_terms','termination','effect'] as const;
const actions = ['review_payment','trial_first','hold_payment','do_not_pay','request_proposal','hold_contract','research_hold'] as const;
const idSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type CandidateReviewFields = { name: string; url: string; suppliedText: string; situation: string };
const fieldsSchema = z.strictObject({
  name: z.string().trim().max(200),
  url: z.string().trim().max(2048),
  suppliedText: z.string().max(16000),
  situation: z.string().max(4000),
}).refine(value => Boolean(value.name || value.url || value.suppliedText.trim() || value.situation.trim()), 'candidate or situation required');

export function parsePublicHttps(value: string, allowFragment: boolean) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('public HTTPS URL required'); }
  if (url.protocol !== 'https:' || url.username || url.password || (!allowFragment && url.hash)) throw new Error('public HTTPS URL required');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host.endsWith('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.includes(':')) throw new Error('public HTTPS URL required');
  const parts = host.split('.');
  if (parts.length === 4 && parts.every(part => /^\d+$/.test(part))) {
    const bytes = parts.map(Number);
    if (bytes.some(byte => byte < 0 || byte > 255)) throw new Error('public HTTPS URL required');
    const [a, b, c] = bytes;
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) throw new Error('public HTTPS URL required');
  }
  if (!host.includes('.')) throw new Error('public HTTPS URL required');
  for (const key of url.searchParams.keys()) if (/(?:token|secret|password|passwd|auth|api[_-]?key|signature|credential)/i.test(key)) throw new Error('sensitive URL query');
  return url;
}
const canonicalUrl = z.string().max(2048).superRefine((value, ctx) => { try { parsePublicHttps(value, false); } catch { ctx.addIssue({ code: 'custom', message: 'public canonical URL required' }); } });
const evidenceUrl = z.string().max(2048).superRefine((value, ctx) => { try { parsePublicHttps(value, true); } catch { ctx.addIssue({ code: 'custom', message: 'public evidence URL required' }); } });

const sourceSchema = z.strictObject({
  scope: z.enum(['product','offer','unknown']).optional(),
  offerId: idSchema.nullable().optional(),
  id: idSchema, url: evidenceUrl, title: z.string().trim().min(1).max(300),
  excerpt: z.string().trim().min(1).max(1200), retrievedAt: dateSchema,
  owner: z.enum(['candidate','platform','independent']),
  appliesToCandidateIds: z.array(idSchema).min(1).max(5),
});
const userFactSchema = z.strictObject({
  id: idSchema, category: z.enum(['job','need','gap','current_method','constraint','trial_preference']),
  statement: z.string().trim().min(1).max(500), userSpanIds: z.array(z.string().regex(/^u[1-9]\d*$/)).min(1).max(4),
});
const claimSchema = z.strictObject({
  scope: z.enum(['product','offer','unknown']).optional(),
  offerId: idSchema.nullable().optional(), quote: z.string().trim().min(1).max(1200).optional(),
  id: idSchema, category: z.enum(claimCategories), statement: z.string().trim().min(1).max(600),
  sourceIds: z.array(idSchema).min(1).max(4),
});
const unknownSchema = z.strictObject({
  id: idSchema, category: z.enum(unknownCategories), statement: z.string().trim().min(1).max(500),
});
const candidateSchema = z.strictObject({
  id: idSchema, name: z.string().trim().min(1).max(200), kind: z.enum(kinds), role: z.enum(roles),
  canonicalUrl, canonicalSourceId: idSchema, relation: z.enum(['direct','indirect']),
  relationReason: z.string().trim().min(1).max(500), userFactIds: z.array(idSchema).max(8),
  claims: z.array(claimSchema).max(12),
  license: z.strictObject({ status: z.enum(['documented','unknown','not_applicable']), spdxId: z.string().trim().min(1).max(64).nullable(), sourceIds: z.array(idSchema).max(4) }),
  unknowns: z.array(unknownSchema).max(12),
});
const currentMethodSchema = z.strictObject({
  id: idSchema, statement: z.string().trim().min(1).max(500), userFactIds: z.array(idSchema).min(1).max(4),
});
const commitmentSchema = z.strictObject({
  offerId: idSchema.nullable().optional(),
  nextAction: z.enum(['keep_current','research_public','ask_user','optional_trial','review_terms','request_proposal']).optional(),
  question: z.string().trim().min(1).max(300).optional(),
  targetCandidateId: idSchema.nullable(), action: z.enum(actions), statement: z.string().trim().min(1).max(800),
  userFactIds: z.array(idSchema).max(8), claimIds: z.array(idSchema).max(12),
  alternativeClaimIds: z.array(idSchema).max(12),
  alternativeCandidateIds: z.array(idSchema).max(5), currentMethodIds: z.array(idSchema).max(6),
  unknownIds: z.array(idSchema).max(12),
});

export const candidateReviewAnswerSchema = z.strictObject({
  policyVersion: z.enum(['candidate-policy-v2','candidate-policy-v3']).optional(),
  id: z.string().uuid(), inputHash: z.string().regex(/^[a-f0-9]{64}$/), asOf: dateSchema, status: z.enum(['ready','hold']),
  userFacts: z.array(userFactSchema).max(12),
  workstream: z.strictObject({ label: z.string().trim().min(1).max(100), statement: z.string().trim().min(1).max(500), userFactIds: z.array(idSchema).max(8) }),
  discoverySources: z.array(z.strictObject({ id: idSchema, url: evidenceUrl, title: z.string().trim().min(1).max(300), note: z.string().trim().min(1).max(500) })).max(10),
  sources: z.array(sourceSchema).max(20), candidates: z.array(candidateSchema).max(5),
  currentMethods: z.array(currentMethodSchema).max(6),
  excluded: z.array(z.strictObject({ name: z.string().trim().min(1).max(200), url: z.union([z.literal(''), evidenceUrl]), reason: z.enum(['identity_mismatch','no_canonical_source','license_unknown','unrelated','duplicate']) })).max(12),
  commitment: commitmentSchema, limitations: z.array(z.string().trim().min(1).max(500)).max(12),
});

export type CandidateReviewAnswer = z.infer<typeof candidateReviewAnswerSchema>;
export type CandidateReviewInput = {
  id: string; asOf: string;
  subject: { name: string; url: string; suppliedText: string; sourceKind: 'single_candidate' | 'candidate_list' | 'unknown' };
  situation: string; requestedKinds: Array<(typeof kinds)[number]>; maxCandidates: number;
};
export type CandidateReviewPacket = CandidateReviewInput & { userSpans: Array<{ id: string; text: string; start: number; end: number }>; inputHash: string };

const inputSchema = z.strictObject({
  id: z.string().uuid(), asOf: dateSchema,
  subject: z.strictObject({ name: z.string().max(200), url: z.union([z.literal(''), canonicalUrl]), suppliedText: z.string().max(16000), sourceKind: z.enum(['single_candidate','candidate_list','unknown']) }),
  situation: z.string().max(4000), requestedKinds: z.array(z.enum(kinds)).min(1).max(kinds.length),
  maxCandidates: z.number().int().min(1).max(5),
});

const unique = <T,>(values: T[]) => new Set(values).size === values.length;
const today = () => {
  const date = new Date();
  const two = (value: number) => String(value).padStart(2, '0');
  return [date.getFullYear(), two(date.getMonth() + 1), two(date.getDate())].join('-');
};
function sentenceSpans(text: string) {
  const spans: Array<{ id: string; text: string; start: number; end: number }> = [];
  const matcher = /[^\n.!?。！？]+(?:[.!?。！？]+|(?=\n|$))/g;
  for (const match of text.matchAll(matcher)) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const value = raw.trim();
    if (!value) continue;
    const start = (match.index ?? 0) + leading;
    spans.push({ id: 'u' + (spans.length + 1), text: value, start, end: start + value.length });
  }
  return spans;
}

export function buildCandidateReviewPacket(raw: CandidateReviewInput): CandidateReviewPacket {
  const input = inputSchema.parse(raw);
  if (!unique(input.requestedKinds)) throw new Error('duplicate candidate kind');
  const bound = { id: input.id, asOf: input.asOf, subject: input.subject, situation: input.situation, requestedKinds: input.requestedKinds, maxCandidates: input.maxCandidates };
  return { ...input, userSpans: sentenceSpans(input.situation), inputHash: sha256Hex(JSON.stringify(bound)) };
}

export function prepareCandidateReview(raw: CandidateReviewFields, options: { id?: string; asOf?: string; requestedKinds?: string[]; maxCandidates?: number } = {}) {
  const fields = fieldsSchema.parse(raw);
  let normalizedUrl = fields.url;
  if (normalizedUrl) {
    const parsed = parsePublicHttps(normalizedUrl, true);
    parsed.search = parsed.searchParams.toString();
    parsed.hash = '';
    normalizedUrl = parsed.toString();
  }
  const requestedKinds = options.requestedKinds ?? [...kinds];
  const sourceKind = fields.suppliedText.trim() ? 'candidate_list' : (fields.name || normalizedUrl ? 'single_candidate' : 'unknown');
  const input = inputSchema.parse({
    id: options.id ?? globalThis.crypto.randomUUID(), asOf: options.asOf ?? today(),
    subject: { name: fields.name, url: normalizedUrl, suppliedText: fields.suppliedText, sourceKind },
    situation: fields.situation, requestedKinds, maxCandidates: options.maxCandidates ?? 5,
  });
  if (!unique(input.requestedKinds)) throw new Error('duplicate candidate kind');
  const packet = buildCandidateReviewPacket(input);
  const corePolicy = ['정책 버전: ' + compactPolicy.version, ...compactPolicy.rules].join('\n');
  const responseSchema = z.toJSONSchema(compactAnswerSchema);
  const property = responseSchema.properties!.requestKey;
  responseSchema.properties!.requestKey = { ...(property as object), const: packet.inputHash.slice(0,32) };
  const prompt = [corePolicy, 'JSON Schema:', JSON.stringify(responseSchema), '신뢰 입력:', JSON.stringify(packet)].join('\n');
  return { input, packet, prompt, corePolicy, policyVersion: compactPolicy.version };
}

const refsValid = (refs: string[], allowed: Set<string>) => unique(refs) && refs.every(id => allowed.has(id));
const sameRefs = (left: string[], right: string[]) => left.length === right.length && refsValid(left, new Set(right));
const productActions = new Set(['review_payment','trial_first','hold_payment','do_not_pay']);
const vendorActions = new Set(['request_proposal','hold_contract']);
const activeActions = new Set(['review_payment','trial_first','request_proposal']);
const quantifiedProductivity = /(?:생산성|시간\s*절감|업무\s*효율|비용\s*절감).{0,20}(?:\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*퍼센트|몇\s*배)|(?:\d+(?:\.\d+)?\s*%).{0,20}(?:생산성|시간|효율|절감)/;

// Scope equality and literal quotes are structural evidence, not semantic truth.
function validatePolicy(answer: CandidateReviewAnswer) {
  const decision = answer.commitment;
  const claims = answer.candidates.flatMap(candidate => candidate.claims);
  const v3 = answer.policyVersion === 'candidate-policy-v3';
  if (!v3 && [...answer.sources, ...claims].some(item => item.scope !== undefined)) throw new Error('partial scope version');
  if (v3 && [...answer.sources, ...claims].some(item => !item.scope || (item.scope === 'offer' ? !item.offerId : item.offerId !== null))) throw new Error('invalid explicit scope');
  if (!answer.policyVersion) {
    if (decision.nextAction !== undefined || decision.offerId !== undefined || decision.question !== undefined ||
        answer.sources.some(s => s.offerId !== undefined) || claims.some(c => c.offerId !== undefined || c.quote !== undefined) ||
        answer.userFacts.some(f => f.category === 'trial_preference')) throw new Error('partial policy version');
    return;
  }
  if (decision.offerId === undefined || !decision.nextAction || !policy.nextActions[decision.action].includes(decision.nextAction)) throw new Error('incompatible next action');
  if ((decision.nextAction === 'ask_user') !== (decision.question !== undefined)) throw new Error('question action mismatch');
  if (decision.nextAction === 'keep_current' && !decision.currentMethodIds.length) throw new Error('keep requires current method');
  const sources = new Map(answer.sources.map(s => [s.id, s]));
  if (answer.sources.some(s => s.offerId === undefined)) throw new Error('missing source scope');
  for (const claim of claims) {
    if (claim.offerId === undefined || !claim.quote) throw new Error('missing claim scope');
    for (const id of claim.sourceIds) {
      const source = sources.get(id);
      if (!source || source.offerId !== claim.offerId || (v3 && source.scope !== claim.scope) || !source.excerpt.includes(claim.quote)) throw new Error('offer or quote mismatch');
    }
  }
  if (activeActions.has(decision.action)) {
    if (!decision.offerId) throw new Error('active offer required');
    const required = claims.filter(c => decision.claimIds.includes(c.id) && (v3 || c.category !== 'identity'));
    const common = new Set(['identity','permission','data_handling','maintenance','process','requirement','ownership']);
    if (required.some(c => v3
      ? !(c.scope === 'offer' && c.offerId === decision.offerId || c.scope === 'product' && common.has(c.category))
      : c.offerId !== decision.offerId)) throw new Error('active offer mismatch');
    if (v3 && claims.some(c => decision.claimIds.includes(c.id) && c.scope === 'unknown')) throw new Error('unknown active scope');
  }
  if (decision.nextAction === 'optional_trial' && !answer.userFacts.some(f => decision.userFactIds.includes(f.id) && f.category === 'trial_preference')) throw new Error('trial preference required');
}

function validateCandidateReview(raw: unknown, input: CandidateReviewInput): CandidateReviewAnswer {
  const answer = candidateReviewAnswerSchema.parse(raw);
  const packet = buildCandidateReviewPacket(input);
  validatePolicy(answer);
  if (answer.id !== packet.id || answer.inputHash !== packet.inputHash || answer.asOf !== input.asOf) throw new Error('input binding mismatch');
  if (answer.sources.some(source => source.retrievedAt !== input.asOf)) throw new Error('source date mismatch');
  if (answer.candidates.length > input.maxCandidates || answer.candidates.some(candidate => !input.requestedKinds.includes(candidate.kind))) throw new Error('candidate boundary');

  const allIds = [
    ...answer.userFacts.map(x => x.id), ...answer.discoverySources.map(x => x.id), ...answer.sources.map(x => x.id),
    ...answer.candidates.map(x => x.id), ...answer.currentMethods.map(x => x.id),
    ...answer.candidates.flatMap(x => x.claims.map(y => y.id)), ...answer.candidates.flatMap(x => x.unknowns.map(y => y.id)),
  ];
  if (!unique(allIds)) throw new Error('duplicate id');
  const candidateIds = new Set(answer.candidates.map(candidate => candidate.id));
  const spanIds = new Set(packet.userSpans.map(span => span.id));
  const userFactIds = new Set(answer.userFacts.map(fact => fact.id));
  for (const fact of answer.userFacts) if (!refsValid(fact.userSpanIds, spanIds)) throw new Error('invalid user span');
  if (!refsValid(answer.workstream.userFactIds, userFactIds)) throw new Error('invalid workstream premise');
  for (const method of answer.currentMethods) if (!refsValid(method.userFactIds, userFactIds) || !method.userFactIds.every(id => answer.userFacts.find(f => f.id === id)?.category === 'current_method')) throw new Error('invalid current method');
  for (const source of answer.sources) if (!refsValid(source.appliesToCandidateIds, candidateIds)) throw new Error('invalid source candidate binding');

  const sourceIds = new Set(answer.sources.map(source => source.id));
  const sourceById = new Map(answer.sources.map(source => [source.id, source]));
  for (const candidate of answer.candidates) {
    if (!refsValid(candidate.userFactIds, userFactIds)) throw new Error('invalid candidate premise');
    const canonical = sourceById.get(candidate.canonicalSourceId);
    if (!canonical || !canonical.appliesToCandidateIds.includes(candidate.id)) throw new Error('invalid canonical source');
    for (const claim of candidate.claims) {
      if (!refsValid(claim.sourceIds, sourceIds) || claim.sourceIds.some(id => !sourceById.get(id)!.appliesToCandidateIds.includes(candidate.id))) throw new Error('cross-candidate claim source');
      if (claim.category === 'vendor_claim' && claim.sourceIds.some(id => sourceById.get(id)?.owner !== 'candidate')) throw new Error('vendor claim source owner');
    }
    if (!refsValid(candidate.license.sourceIds, sourceIds) || candidate.license.sourceIds.some(id => !sourceById.get(id)!.appliesToCandidateIds.includes(candidate.id))) throw new Error('invalid license source');
    if (candidate.kind === 'open_source' && candidate.license.status === 'documented' && (!candidate.license.spdxId || !candidate.license.sourceIds.length)) throw new Error('undocumented license');
    if (candidate.license.status !== 'documented' && (candidate.license.spdxId || candidate.license.sourceIds.length)) throw new Error('unexpected license evidence');
  }

  const decision = answer.commitment;
  const candidatesById = new Map(answer.candidates.map(candidate => [candidate.id, candidate]));
  const methodIds = new Set(answer.currentMethods.map(method => method.id));
  const allClaimIds = new Set(answer.candidates.flatMap(candidate => candidate.claims.map(claim => claim.id)));
  const allUnknownIds = new Set(answer.candidates.flatMap(candidate => candidate.unknowns.map(unknown => unknown.id)));
  if (!refsValid(decision.userFactIds, userFactIds) || !refsValid(decision.claimIds, allClaimIds) || !refsValid(decision.alternativeClaimIds, allClaimIds) || !refsValid(decision.alternativeCandidateIds, candidateIds) || !refsValid(decision.currentMethodIds, methodIds) || !refsValid(decision.unknownIds, allUnknownIds)) throw new Error('invalid decision reference');
  if (decision.targetCandidateId && decision.alternativeCandidateIds.includes(decision.targetCandidateId)) throw new Error('target cannot be alternative');

  if (answer.status === 'hold') {
    if (decision.action !== 'research_hold' || decision.targetCandidateId !== null) throw new Error('invalid research hold');
    return answer;
  }
  if (decision.action === 'research_hold' || !decision.targetCandidateId) throw new Error('ready answer needs target');
  const target = candidatesById.get(decision.targetCandidateId);
  if (!target) throw new Error('unknown target');
  if (target.kind === 'service_vendor' ? !vendorActions.has(decision.action) : !productActions.has(decision.action)) throw new Error('action kind mismatch');
  const targetClaimIds = new Set(target.claims.map(claim => claim.id));
  const targetUnknownIds = new Set(target.unknowns.map(unknown => unknown.id));
  if (!refsValid(decision.claimIds, targetClaimIds) || !refsValid(decision.unknownIds, targetUnknownIds)) throw new Error('decision must use target evidence');
  if (!sameRefs(decision.unknownIds, target.unknowns.map(unknown => unknown.id))) throw new Error('all target unknowns must be visible');
  const alternatives = answer.candidates.filter(candidate => decision.alternativeCandidateIds.includes(candidate.id));
  const allowedAlternativeClaims = new Set(alternatives.flatMap(candidate => candidate.claims.map(claim => claim.id)));
  if (!refsValid(decision.alternativeClaimIds, allowedAlternativeClaims)) throw new Error('invalid alternative evidence');
  const alternativeClaims = alternatives.flatMap(candidate => candidate.claims).filter(claim => decision.alternativeClaimIds.includes(claim.id));
  if (decision.alternativeCandidateIds.length && !alternativeClaims.some(claim => claim.category === 'capability')) throw new Error('alternative capability required');
  if (quantifiedProductivity.test(decision.statement)) throw new Error('unverified productivity number');

  const usedClaims = target.claims.filter(claim => decision.claimIds.includes(claim.id));
  const usedFacts = answer.userFacts.filter(fact => decision.userFactIds.includes(fact.id));
  const usedGapIds = new Set(usedFacts.filter(fact => fact.category === 'gap').map(fact => fact.id));
  if (activeActions.has(decision.action)) {
    if (!usedFacts.some(fact => fact.category === 'need') || !usedFacts.some(fact => fact.category === 'gap') || !usedClaims.some(claim => claim.category === 'capability')) throw new Error('active action grounding');
  }
  const categories = new Set(usedClaims.map(claim => claim.category));
  const requireCategories = (required: string[]) => { if (required.some(category => !categories.has(category as typeof claimCategories[number]))) throw new Error('missing action evidence'); };
  if ((decision.action === 'review_payment' || decision.action === 'do_not_pay') && alternatives.length && alternatives.some(candidate => !candidate.userFactIds.some(id => usedGapIds.has(id)))) throw new Error('alternative must address decision gap');
  if (decision.action === 'review_payment') { requireCategories(['capability','price','permission','data_handling','maintenance']); if (target.unknowns.length) throw new Error('payment unknowns remain'); if (!decision.currentMethodIds.length && !decision.alternativeCandidateIds.length) throw new Error('payment review needs comparison'); if (decision.currentMethodIds.length && !usedFacts.some(fact => fact.category === 'current_method')) throw new Error('payment comparison needs current method fact'); }
  if (decision.action === 'trial_first') { requireCategories(['capability','trial','price','renewal','cancellation','permission','data_handling']); if (target.unknowns.some(unknown => ['price','permission','data_handling','payment_terms','termination'].includes(unknown.category))) throw new Error('trial safety unknowns remain'); }
  if (decision.action === 'request_proposal') { requireCategories(['identity','capability','process']); if (!target.unknowns.length) throw new Error('proposal needs contract unknowns'); }
  if (decision.action === 'do_not_pay' && !decision.currentMethodIds.length && !decision.alternativeCandidateIds.length) throw new Error('do not pay needs current method or alternative');
  if (decision.action === 'do_not_pay' && decision.currentMethodIds.length && !decision.alternativeCandidateIds.length && usedGapIds.size) throw new Error('current method cannot resolve stated gap');
  if ((decision.action === 'hold_payment' || decision.action === 'hold_contract') && !decision.unknownIds.length) throw new Error('hold needs typed unknown');
  return answer;
}

const actionTitles: Record<typeof actions[number], string> = {
  review_payment:'결제를 검토할 근거가 있습니다', trial_first:'체험 조건을 확인하세요',
  hold_payment:'결제 조건을 더 확인해야 합니다', do_not_pay:'지금은 결제하지 않는 편이 낫습니다',
  request_proposal:'서면 제안서까지만 요청해 볼 수 있습니다', hold_contract:'계약 조건을 더 확인해야 합니다',
  research_hold:'공개 근거를 더 조사해야 합니다',
};

export function importCandidateReview(inputRaw: CandidateReviewInput, reply: string) {
  const input = inputSchema.parse(inputRaw);
  if (!reply.trim() || reply.length > 128000) throw new Error('reply size');
  const raw = reply.trim();
  const fence = /^\x60{3}(?:json)?\s*\n([\s\S]*?)\n\x60{3}$/i.exec(raw);
  const parsed = JSON.parse(fence ? fence[1] : raw);
  const normalized = parsed?.format === 'candidate-compact-v3' ? expandCompactAnswer(compactAnswerSchema.parse(parsed), buildCandidateReviewPacket(input)) : parsed;
  const answer = validateCandidateReview(normalized, input);
  const sourceById = new Map(answer.sources.map(source => [source.id, source]));
  const candidates = answer.candidates.map(candidate => ({ ...candidate, claims: candidate.claims.map(claim => ({ ...claim, sources: claim.sourceIds.map(id => sourceById.get(id)!), sourceOwner: sourceById.get(claim.sourceIds[0])!.owner })) }));
  const target = candidates.find(candidate => candidate.id === answer.commitment.targetCandidateId) ?? null;
  const legacy = !answer.policyVersion;
  const nextAction = legacy ? 'research_public' : answer.commitment.nextAction!;
  return { view: {
    legacy, policyVersion: answer.policyVersion ?? null, nextAction, nextActionText: policy.nextActionLabels[nextAction], question: answer.commitment.question ?? null,
    action: answer.commitment.action, title: legacy ? '이전 답변의 조건을 다시 확인하세요' : actionTitles[answer.commitment.action], statement: answer.commitment.statement,
    status: answer.status, workstream: answer.workstream, target,
    alternatives: answer.commitment.alternativeCandidateIds.map(id => candidates.find(candidate => candidate.id === id)!),
    currentMethods: answer.commitment.currentMethodIds.map(id => answer.currentMethods.find(method => method.id === id)!),
    unknowns: target ? answer.commitment.unknownIds.map(id => target.unknowns.find(unknown => unknown.id === id)!) : [],
    candidates, sources: answer.sources, discoverySources: answer.discoverySources, excluded: answer.excluded, limitations: answer.limitations,
    verificationNotice: (legacy ? policy.legacyNotice + ' ' : '') + policy.verificationNotice,
  }};
}
export type CandidateReviewView = ReturnType<typeof importCandidateReview>['view'];
