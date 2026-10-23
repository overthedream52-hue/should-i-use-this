# Compact candidate answer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** Reduce first-attempt model reference failures with web/skill parity.
**Architecture:** A compact wire adapter expands deterministic IDs into the existing strict validator. Explicit scope v3 extends the normalized boundary; v1/v2 compatibility remains.
**Tech Stack:** TypeScript/Zod, Python stdlib, Next static export, Vitest, Chrome Playwright.
**Spec:** docs/superpowers/specs/2026-10-05-compact-answer.md

## Global Constraints
No API spend, deployment, secrets, source installs or old eval mutation. Preserve existing dirty work. No semantic accuracy claim from structure.

## Review Focus
- Unknown scope accidentally accepted as product-wide active evidence.
- Wrong/stale request rebound by adapter.
- Duplicate/bool/fraction/out-of-range references diverge in Python/TS.
- Legacy new fields bypass scope gates.
- Model source claims counted as independent verification.

### Task 1: Compact contract and portable parity
**Files:** lib/candidate-review-v1.ts; new lib/candidate-compact.ts; portable scripts/candidate_contract.py and candidate_compact.py; references/candidate-compact-policy.json, generated candidate-compact-schema.json; producer scripts/generate-candidate-schema.ts; tests/unit/candidate-compact.test.ts.
**Interfaces:** prepareCandidateReview(fields, options) -> bound compact prompt; importCandidateReview(input, reply) -> unchanged view; Python prepare/validate same.
- [x] Write acceptance/mutation/parity tests first; run npm test -- --run tests/unit/candidate-compact.test.ts. Expected: compact inputs rejected/default prompt old (RED).
- [x] Add compiler, explicit scopes, shared policy/schema; update only prompt assertions intentionally changed.
- [x] Run npm test. Expected: all legacy + new tests pass.
- [x] Record diff (no bulk commit because pre-existing changes are user work).

### Task 2: Actual first-response evaluation and browser verification
**Files:** new docs/evals/2026-10-05-compact-answer/*; skill contract docs; tests/e2e/candidate-review.spec.ts.
**Interfaces:** consumes compact prepare/import from Task 1. Produces original raw model exchanges, freeze manifest, results and receipt.
- [x] Freeze three official-source cases and semantic acceptance before model calls; record provenance and source limitations.
- [x] Use existing Claude subscription tools-disabled calls (no API override), first responses only, no silent repair. Expected: observed results recorded, failure retained.
- [x] Add E2E compact import, stale-reply rejection, actual raw reply screenshots. Expected: deterministic tests pass; report semantic uncertainty separately.
- [x] Run lint, typecheck, build, unit, Chrome E2E. Expected: exit0 or disclose remaining failures.
- [x] Fresh reviewer on current changes, fix important findings with RED/GREEN; receipt and append-only Wiki metadata; no deployment.
