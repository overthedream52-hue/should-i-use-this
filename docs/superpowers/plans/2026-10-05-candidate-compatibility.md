# Candidate recommendation compatibility implementation plan

Goal: Stop forced trials, free/paid scope leaks and web/skill policy drift before adoption. Preserve public static web and portable Python skill.
Architecture: Shared JSON policy in skill references, two existing validators, controlled next-action view. No API/server or new model requirement.
Tech Stack: Next 16 static export, Zod4, Python3 standard library, Vitest, Playwright.
Spec: /Users/nod/Projects/shoul i use it/docs/evals/2026-09-24-remediation-review/plan.md

## Global Constraints
Current-method retention is valid. No invented user gap, guaranteed benefit or percentage. No compulsory alternative/trial. Sources are untrusted data. No new private collection, API keys, install, deploy or paid calls. Existing unrelated .DS_Store preserved. Prior18model runs remain untouched and are not product accuracy.

## Engineering review
Selected target: prior remediation plan above; this file carries implementation decisions. Authorization: user explicitly requested plan-eng-review then Superpowers implementation/re-evaluation, and prior no additional approvals. Routine internal arrangement choices resolved under that authorization.
Scope accepted as-is. Eight authored implementation/test/document files estimated, no new classes/services. Smallest arrangement reuses TS/Python and one policy asset; no parallel v2 engine. Additional review/eval artifacts are evidence, not runtime services.
Architecture findings: A1 same behavior rules must ship inside portable skill; A2 scoped claims must bind candidate+offer+quoted excerpt; A3 legacy imports cannot acquire new verification credit. Accepted remedies: shared JSON policy; optional root policyVersion v2 gates mandatory scoped fields and structured nextAction; unversioned legacy is view-only with research guidance and original model text collapsed. Unknown explicit version rejected; no silent downgrade. Unknown product/offer scope represented null, never inherited into a concrete offer. Scoped sources and claims must exactly match and excerpt quote must be substring; this does not prove semantic support.
Code quality findings: Q1 free trial label is unconditional; Q2 raw statement acts like trusted CTA. Accepted: neutral title, deterministic nextAction labels separate from raw model reasoning. Preserve raw reason inside labeled details (no regex-based sentence meaning gate). One policy JSON shared by both prompt builders, action rules and labels. Both prepare return same policyVersion/core policy; schemas/reference formatting may differ but explicit answer fields must agree.
Tests: Vitest+Python parity+Playwright already exist. Protect strict fields, candidate binding, null scope, cross-offer scope, invalid quotes, active offer consistency, hold/trial conflict, optional trial consent from user spans, unversioned legacy and partial/unknown versions; positive conditional payment/proposal remains possible. No tests retired. Real generated prompt must go through subscription CLI then both validators, then browser display. Frozen3new cases plus oldregressions, raw results retained. Semantic scoring provisional and distinct from structural acceptance; no general accuracy claim.
Performance: no new network IO; bounded arrays (5candidates/20sources/12claims) mean local validation remains bounded. JSON import is static-export compatible per installed Next guide. No queue/cache/db needed.
Failure flow: missing source/offer => reject actionable v2 reply with existing import error; previous valid view must not masquerade as current. Missing browsing => research_hold. Legacy => neutral review-only display. No automatic retries beyond skill's existing one correction.

Input -> shared policy + packet -> subscription answer -> TS/Python validation
  -> v2 scoped evidence + compatible nextAction -> controlled visible guidance
  -> legacy -> review-only + collapsed original; malformed -> existing error

## Review Focus
Inspect false trust from excerpts and offer ids, unsupported free capability even with valid substring, user trial-consent fabrication, hold+trial incompatibility, legacy/partial-version bypass, web and portable distributions diverging. Structural checks cannot judge semantic truth. Multi-workstream needs must not be collapsed.

## Task 1: Shared policy and contract guards
Interfaces: prepare yields policyVersion/corePolicy/prompt; v2 answers root policyVersion='candidate-policy-v2'; sources/claims offerId:string|null; claims quote:string; commitment offerId:string|null and nextAction enum and optional question. Existing fields retained. nextAction allowed per action; trial_first additionally requires userFact category trial_preference cited by decision. No inferred consent. All required active target claims use same non-null decision.offerId; identity may remain null. Source scope must match claim scope for every citation. Ask-user may use one question only, while research_public has none.
Steps: Add regressions first -> run focused Vitest (Expected: FAIL on new fields/parity/neutral title). Implement minimal TS/Python/policy asset and references -> same suite (Expected: PASS). Preserve legacy accepted inputs as non-actionable views.
Files: lib/candidate-review-v1.ts; .agents/skills/should-i-use-this/scripts/candidate_contract.py; .agents/skills/should-i-use-this/references/candidate-policy.json; .agents/skills/should-i-use-this/SKILL.md; .agents/skills/should-i-use-this/references/candidate-contract.md; tests/unit/candidate-review-contract.test.ts.

## Task 2: Render and re-evaluate
Interfaces: Task1 view.nextAction/text, legacy notice, raw statement. UI primary reason labeled unverified and collapsed; deterministic guidance primary. Structured checks never claim sentence accuracy.
Steps: Add E2E hold+trial raw text collapsed test first (Expected FAIL). Update result renderer and run E2E (Expected PASS). Freeze three synthetic public-fixture cases (adequate current method, positive scoped benefit, unknown price) and fatal semantic criteria BEFORE model run; generate actual prepare prompt, retain raw model output; run both validators and browser import. Compare archived v1 failure probes without regrading historical18responses. A/B uses original HEAD prompt on same new cases if subscription runtime available; unavailable provider recorded honestly. Run npm test, lint, typecheck, build, E2E. Fresh-context final branch review, regression-fix important findings. No publish.
Files: components/candidate-review-result.tsx; tests/e2e/candidate-review.spec.ts; evidence docs/scripts.

## Acceptance criteria frozen before implementation
1. Paid trial never gets free heading. 2. Shared core policy exact equality. 3. Cross-offer and invalid excerpt rejected in both runtimes. 4. Hold+trial structured CTA rejected, arbitrary prose never actionable CTA. 5. Trial requires explicit user preference and known selected offer conditions. 6. Legacy still opens with safe downgrade notice; v2 omissions/unknown version fail. 7. Positive scoped recommendation passes without compulsory trial. 8. Fresh full checks and actual subscription-answer evaluation reported separately; tests are not truth/accuracy proof. 9. User-visible evidence from browser.

## NOT in scope
Deployment, installing screenshot tools, private workspaces, global model ranking, human confirmed accuracy, Muse/ChatGPT authentication repair. Candidate research independent and advisory.

## Outside review resolutions (before implementation)
Claude Code completed (claude-sonnet-5, supplementary haiku usage; subscription auth). First invocation lacked explicit review request and returned no review; preserved as failed review coverage. Second critique in outside-plan-review-2.json accepted these clarifications:
- Only absent policyVersion is legacy. Null/empty/unknown version rejected. Any v2 fields without version rejected, preventing partial downgrade. Legacy title neutral; raw result remains in details.
- Null offerId means unscoped product/unknown, not free. An identity-category claim may be null; every other required active claim must exactly equal non-null decision.offerId, which necessarily exists among sources through those claims.
- question required nonempty only for ask_user; forbidden for all other nextAction enums. This is one field, not a semantic proof that it contains only one question; prompt/eval enforce intent.
- Quote uses case-sensitive exact substring after existing trim, no case folding or Unicode normalization; every referenced excerpt must contain it. Emoji/decomposed unicode mismatch cases checked in both validators.
- Vitest parity tests execute real Python subprocess for each positive and negative; separate Python test framework is unnecessary. RED and final full suite cover both interpreters.
- Array bounds and missing-offer tests added; arbitrary model prose is visible only in explicitly labeled collapsed reasoning, never as next-action text.
- Shared policy key/version/rules parity and portable isolated-folder test guard distribution. One maintainer-only Bun producer exports Zod JSON schema to the portable skill; no new dependency or runtime service. Schema parity test prevents stale artifacts.
- Missing model execution -> re-evaluation BLOCKED, never pass; all model outputs even invalid retained. Three cases diagnostic only, not model ranking/general accuracy.
- Existing v1 filename retained to avoid import churn; named policy version defines new rules, documented explicitly.

## GSTACK REVIEW REPORT
| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| Eng Review | plan-eng-review | web/skill compatibility | 2 | CLEAR | 5 issues, remedies specified |
| Outside Review | Claude Code | independent plan critique | 1 valid / 1 invalid | completed | boundary/test ambiguities resolved above |
Scope accepted as-is. No new infrastructure. No unresolved implementation choice; deployment and human accuracy confirmation outside scope. Prior 2026-09-15 review stale, no approval credit.
VERDICT: ready for authorized implementation; execution tests and semantic evaluation still pending.
NO UNRESOLVED DECISIONS
