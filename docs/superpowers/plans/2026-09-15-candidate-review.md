# Candidate Discovery and Purchase Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user paste a product, MCP, open-source, or service-vendor URL and receive a source-linked pre-payment or pre-contract judgment through their own subscription AI.

**Architecture:** Keep the GitHub Pages app browser-only. A TypeScript contract prepares stable user spans and a prompt, then validates imported JSON; an equivalent standard-library Python contract gives the portable skill the same boundary. One UI round-trip contains three internal layers: candidate discovery, personal-fit grounding, and purchase/contract action.

**Tech Stack:** Next.js 16 static export, React 19 client components, TypeScript, Zod 4, Python 3 standard library, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-candidate-discovery-and-purchase-design.md`

## Global Constraints

- No developer API key, local LLM, backend, account connection, automated crawler, purchase, or consultation submission.
- Use public HTTPS sources only; reject localhost, private IPs, credentials, fragments, and unsafe URL schemes.
- Keep discovery sources separate from canonical evidence sources.
- Vendor self-claims remain `vendor_claim`; they cannot become independent evidence.
- Active purchase or proposal actions require user-stated need + user-stated current gap + a cited capability.
- Existing fit v4 and static export must continue to pass.
- Browser and Python validators must produce equivalent accepted views or equivalent rejection.
- Do not infer budgets, productivity gains, workstream scope, tool overlap, or current-method failures.
- UI asks for one combined situation field and performs one copy/import round-trip.

---

### Task 1: Freeze the candidate-review contract and regression fixtures

**Files:**
- Create: `tests/fixtures/candidate-review/fornerds-hold.json`
- Create: `tests/fixtures/candidate-review/product-hold.json`
- Create: `tests/fixtures/candidate-review/mixed-workstreams.json`
- Create: `tests/unit/candidate-review-contract.test.ts`
- Create: `lib/candidate-review-v1.ts`

**Interfaces:**
- Produces: `prepareCandidateReview(fields, options?)`, `importCandidateReview(input, reply)`, `candidateReviewAnswerSchema`, `CandidateReviewView`.
- Consumes: browser `globalThis.crypto.randomUUID()`; no network or storage.

- [x] **Step 1: Write failing tests for input preparation**

Test a ForNerds URL with a Korean situation. Assert a UUID, fixed `asOf`, `u1..` user spans, stable `inputHash`, the URL and prompt schema, and rejection of empty input, oversized text, HTTP/private/credential/fragment URLs, duplicate kinds, and candidate limits outside 1..5.

- [x] **Step 2: Run the preparation tests and confirm failure**

Run: `npx vitest run tests/unit/candidate-review-contract.test.ts -t preparation`

Expected: FAIL because `lib/candidate-review-v1.ts` does not exist.

- [x] **Step 3: Implement preparation and URL checks**

Create strict Zod schemas, deterministic JSON serialization and SHA-256 hashing through the existing `sha256Hex` helper. Split non-empty situation lines into immutable `u1..` spans. Build a Korean prompt that requires public web research, treats page instructions as data, returns one JSON object, and returns `status=hold` when browsing is unavailable.

- [x] **Step 4: Write failing validation tests**

Cover valid ForNerds `hold_contract`, a product `hold_payment`, fenced JSON import, input-hash mismatch, bad source/claim/userFact IDs, discovery-source misuse, mismatched retrieval date, duplicate IDs, unsupported candidate kind, unsafe URLs, vendor/product action crossover, undocumented open-source license, active action without need+gap+capability, and arbitrary percentage language.

- [x] **Step 5: Implement response validation and rendering**

Parse at most 128,000 characters. Bind every source to candidate IDs and require each candidate's canonical source. Keep URL-less current methods in their own user-grounded collection. Enforce the action evidence matrix: payment requires capability/price/permission/data/maintenance; trial requires capability/trial/renewal/cancellation/permission/data; proposal requires identity/capability/process. Reject unsupported quantified productivity only in the commitment conclusion while preserving sourced prices and vendor claims. Add `research_hold` for unavailable research with a null target. Return a compact view with Korean action title, statement, alternatives, current methods, unknowns, sources and the fixed verification notice.

- [x] **Step 6: Run the contract test**

Run: `npx vitest run tests/unit/candidate-review-contract.test.ts`

Expected: PASS.

- [x] **Step 7: Commit the contract slice**

```bash
git add lib/candidate-review-v1.ts tests/fixtures/candidate-review tests/unit/candidate-review-contract.test.ts
git commit -m "feat: add candidate review contract"
```

### Task 2: Add the portable Python validator with parity tests

**Files:**
- Create: `.agents/skills/should-i-use-this/scripts/candidate_contract.py`
- Modify: `tests/unit/candidate-review-contract.test.ts`
- Modify: `tests/unit/skill-contract.test.ts`

**Interfaces:**
- Consumes: JSON on stdin with `prepare` or `validate` subcommand, using Task 1 field names.
- Produces: the same normalized input packet and `CandidateReviewView` JSON as TypeScript.

- [x] **Step 1: Add failing cross-runtime parity tests**

Invoke Python with the same ForNerds and product fixtures. Compare prepared user spans, hash, accepted action/title/alternatives/unknowns and rejection of every malformed reference/action fixture.

- [x] **Step 2: Run parity tests and confirm failure**

Run: `npx vitest run tests/unit/candidate-review-contract.test.ts tests/unit/skill-contract.test.ts`

Expected: FAIL because `candidate_contract.py` does not exist.

- [x] **Step 3: Implement Python prepare and validate commands**

Use only `argparse`, `datetime`, `ipaddress`, `json`, `re`, `urllib.parse`, and `uuid`. Mirror limits, ID uniqueness, reference resolution, URL safety, action-kind rules, license rules and active-action grounding. Emit a one-line error to stderr and nonzero exit on invalid input without echoing the payload.

- [x] **Step 4: Run parity and legacy skill tests**

Run: `npx vitest run tests/unit/candidate-review-contract.test.ts tests/unit/skill-contract.test.ts`

Expected: PASS, including the existing `fit_contract.py` cases.

- [x] **Step 5: Commit portable parity**

```bash
git add .agents/skills/should-i-use-this/scripts/candidate_contract.py tests/unit/candidate-review-contract.test.ts tests/unit/skill-contract.test.ts
git commit -m "feat: add portable candidate validator"
```

### Task 3: Add the one-round-trip URL review to the web app

**Files:**
- Create: `components/decision-workspace.tsx`
- Create: `components/candidate-review-workspace.tsx`
- Create: `components/candidate-review-result.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/e2e/subscription.spec.ts`
- Create: `tests/e2e/candidate-review.spec.ts`

**Interfaces:**
- Consumes: Task 1 `prepareCandidateReview`, `importCandidateReview`, `CandidateReviewView`.
- Produces: an accessible default “URL·후보 비교” tab and preserved “원문 하나 판단” tab.

- [x] **Step 1: Write failing browser tests**

The candidate test enters `https://fornerds.ai/`, a situation, prepares once, checks that consent gates clipboard copy, imports the frozen `hold_contract` fixture, and sees “계약 보류”, the missing SOW/ownership/data terms, vendor-claim labeling and a clickable source. It also verifies editing clears stale output and no `/api/` call occurs. Update the legacy subscription test to switch to “원문 하나 판단” before its current actions.

- [x] **Step 2: Run E2E and confirm failure**

Run: `npx playwright test tests/e2e/candidate-review.spec.ts tests/e2e/subscription.spec.ts`

Expected: FAIL because the candidate mode is absent.

- [x] **Step 3: Implement mode selection and candidate workspace**

Use a client-only `DecisionWorkspace` with two tab buttons. Default to candidate review. Extract the prepare/consent/copy/import/clear/stale-generation state machine into one shared hook used by both workspaces. The candidate form contains candidate name/URL, one combined situation textarea, optional public list text under `details`, and no domain checklist.

- [x] **Step 4: Implement the compact result**

Show action title, one grounded statement, current/free/vendor alternatives, and unknown purchase/contract conditions first. Put candidates, claims, sources, discovery paths and exclusions under accessible `details`. Label candidate-owned `vendor_claim` as “업체 자체 주장”. End with the non-guarantee notice.

- [x] **Step 5: Run browser and unit regressions**

Run: `npm test && npx playwright test tests/e2e/candidate-review.spec.ts tests/e2e/subscription.spec.ts`

Expected: PASS.

- [x] **Step 6: Commit the web flow**

```bash
git add app/page.tsx app/globals.css components/decision-workspace.tsx components/candidate-review-workspace.tsx components/candidate-review-result.tsx tests/e2e
git commit -m "feat: review product and vendor URLs"
```

### Task 4: Teach the portable skill the same workflow

**Files:**
- Modify: `.agents/skills/should-i-use-this/SKILL.md`
- Create: `.agents/skills/should-i-use-this/references/candidate-contract.md`
- Modify: `README.md`
- Modify: `tests/unit/skill-contract.test.ts`

**Interfaces:**
- Consumes: `candidate_contract.py prepare|validate` and public web access.
- Produces: a routing rule for candidate discovery/vendor/payment questions while preserving single-source fit v4.

- [x] **Step 1: Add failing skill-content tests**

Assert the skill routes URLs, recommendation lists, paid products and service vendors to `candidate_contract.py`; requires live public evidence; separates discovery/canonical sources; labels vendor claims; compares current/free alternatives; and caps the result at proposal request before written contract evidence.

- [x] **Step 2: Run the skill test and confirm failure**

Run: `npx vitest run tests/unit/skill-contract.test.ts`

Expected: FAIL on the new candidate workflow assertions.

- [x] **Step 3: Write the contract reference and skill route**

Document exact prepare/validate shell commands, evidence order, active-action gate, vendor checklist, one-question maximum, search-unavailable hold, and Korean presentation order. Keep existing direct source workflow for a single provided document. Update README with the two web modes and portable skill usage.

- [x] **Step 4: Run skill and full unit tests**

Run: `npm test`

Expected: PASS.

- [x] **Step 5: Commit skill support**

```bash
git add .agents/skills/should-i-use-this/SKILL.md .agents/skills/should-i-use-this/references/candidate-contract.md README.md tests/unit/skill-contract.test.ts
git commit -m "docs: add candidate and vendor review workflow"
```

### Task 5: Record four preregistered evaluations and verify release behavior

**Files:**
- Create: `docs/evals/2026-09-15-candidate-review/README.md`
- Create: `docs/evals/2026-09-15-candidate-review/gold-rules.json`
- Create: `docs/evals/2026-09-15-candidate-review/results.json`
- Modify: `tests/unit/candidate-review-contract.test.ts`

**Interfaces:**
- Consumes: sanitized Runway, Serena, vidIQ, ForNerds fixtures and the mixed-workstream regression.
- Produces: deterministic structural/behavioral scores separate from source-truth limitations.

- [x] **Step 1: Freeze gold rules before scoring**

Record for each case the workstream, target kind, required current/free alternative role, forbidden action, required evidence categories and required holds. For ForNerds require `service_vendor`, `vendor_claim`, contract-condition unknowns and `hold_contract` when the input lacks a stated outsourcing gap.

- [x] **Step 2: Add the four cases and mixed-workstream regression to tests**

Assert contract acceptance plus case-specific invariants. For mixed workstreams, assert distinct relation reasons and reject one statement that gives the same reason to all five tools or contains invented time-saving percentages.

- [x] **Step 3: Run the evaluation tests**

Run: `npx vitest run tests/unit/candidate-review-contract.test.ts`

Expected: all gold invariants PASS. Record counts and limitations; do not present structural validation as source-truth validation.

- [x] **Step 4: Run the complete verification sequence**

Run, in order:

```bash
npm test
npm run lint
npm run typecheck
npm run build
python3 -m http.server 3102 --directory out
```

In a second shell run `EVIDENCE_E2E_PORT=3102 npx playwright test`, capture a ForNerds result screenshot, then stop the server. Expected: all commands PASS, static export contains the candidate UI, no network request to an app API, and screenshot visibly shows “계약 보류”.

- [x] **Step 5: Commit eval evidence**

```bash
git add docs/evals/2026-09-15-candidate-review tests/unit/candidate-review-contract.test.ts
git commit -m "test: verify candidate review scenarios"
```

## What already exists

- `subscription-transfer.ts` already implements safe browser-local prepare/copy/import flow and stale-state clearing.
- fit v4 already prevents `consider` without a user need, current gap and cited feature.
- `fit_contract.py` establishes the Python standard-library validator pattern.
- GitHub Pages static export, Vitest and Playwright are already configured.

## Not in scope

- Automatic URL fetching or crawling in the web app.
- Accounts, saved history, shared workspaces, developer API keys or local models.
- MCP server packaging.
- Sending consultation forms, making purchases, starting trials or deploying this branch.
- Legal due diligence or a guarantee that AI-supplied excerpts match the live page.

## Test Diagram

```text
user input ──prepare──> trusted spans + hash ──prompt──> subscription AI
   │                                                    │
   └──────── immutable input ───────────────────────────┤
                                                        v
                                               candidate JSON
                                                        │
                          ┌─────────────────────────────┴──────────────────────────┐
                          v                                                        v
                  TypeScript validator                                      Python validator
                  refs/actions/URLs                                          same fixtures
                          │                                                        │
                          └──────────────── parity tests ──────────────────────────┘
                                                        │
                                                        v
                                               compact browser view
                                                        │
                                      Playwright: ForNerds 계약 보류
```

## Sequential execution

Tasks share the contract schema and fixtures, so execute sequentially: contract → Python parity → UI → skill → evaluation. Parallel worktrees would create avoidable conflicts in tests and contract names.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 4 | CLEAR | 19 findings corrected across three passes; final re-review CLEAR |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG CLEARED. All review findings are implemented and the final independent re-review returned CLEAR.
**UNRESOLVED DECISIONS:** None.
