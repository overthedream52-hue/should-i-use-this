# Adoption ledger Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.
**Goal:** Separate adoption from payment and let the app own public evidence.
**Architecture:** New v4 source collection + immutable evidence ledger + reference-only judgment. Shared generated schemas/policy drive static browser and portable Python; legacy stays importable.
**Tech Stack:** TypeScript/Zod/Next static export, Python stdlib, Vitest, Chrome Playwright.
**Spec:** docs/superpowers/specs/2026-10-05-adoption-ledger.md

## Global Constraints
No APIs/auto network/secrets/installations/deployment; preserve old evals and dirty work. Source provenance is not authenticity. User already authorized design/implementation without repeat approvals.
## Review Focus
- Cross-candidate/cross-ledger reference laundering.
- Free price conflated with positive fit or paid obligation.
- Unicode and size boundary divergence Python/JS.
- Outside JSON prose promoted to actions or multiple blocks accepted.
- UI stale ledger/consent on edit and source collection no-result path.

### Task 1: Evidence ledger and adoption boundary
**Files:** lib/adoption-review.ts; lib/adoption-schema.ts; portable scripts/adoption_contract.py; generated adoption-schemas.json/adoption-policy.json; tests/unit/adoption-review.test.ts.
**Interfaces:** prepareSourceRequest(fields)->research packet; bindSourceReply(base,reply)->judgment prepared; prepareAdoptionReview(base,sources,provenance)->prepared; importAdoptionReview(input,reply)->view. Python prepare/bind/validate mirror.
- [ ] Write free-positive, paid-hold, keep, invalid refs/bindings/envelopes/limits tests first. Run focused tests: expected RED before new module.
- [ ] Implement schemas, immutable passage builder, shared prompt, gates, portable parity. Expected focused tests PASS and old suite unchanged.
- [ ] Record diff and ledger without mixing prior changes in a commit.
### Task 2: UI and portable workflow
**Files:** components/candidate-review-workspace.tsx; new adoption-result.tsx; skill docs; tests/e2e/adoption-review.spec.ts.
**Interfaces:** consumes Task1 prepared stages and view. Preserve v1-v3 fallback while new default is source collection.
- [ ] Implement source stage -> judgment stage with renewed explicit copy consent, direct supplied-source shortcut, separate verdict/cost, original numbered evidence and prose disclosure.
- [ ] Test real browser stages/edit/reset/no external requests; copied portable skill. Expected PASS.
### Task 3: New official-source evaluation and final review
**Files:** docs/evals/2026-10-05-adoption-ledger/*.
**Interfaces:** consume exact final prepare/import, persist inputs/oracles/prompts/hashes/raw outputs before interpretation.
- [ ] Read official sources, freeze3 new cases and rubric, run existing subscription CLI with no tools/API overrides. Expected report actual first response results, no repair or hidden widening.
- [ ] Run lint/typecheck/build/unit/ChromeE2E; fresh independent reviewer, one important fix pass RED/GREEN.
- [ ] Browser raw-response replay, receipt and append-only Wiki. Expected honest status/axes; no deployment.
