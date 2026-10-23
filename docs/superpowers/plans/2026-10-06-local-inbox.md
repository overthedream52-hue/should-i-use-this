# Local inbox implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Existing user authorization requests autonomous execution.

**Goal:** Automatically discover candidates, persist source-bound analyses, and expose human-approved proposals to local agents.
**Architecture:** Python SQLite store + GitHub collector + subscription-agent CLI + loopback dashboard. Existing adoption validator is reused.
**Tech Stack:** Python stdlib, existing portable adoption-v4.
**Spec:** docs/superpowers/specs/2026-10-06-local-inbox.md

## Global Constraints
No paid AI API, model install, candidate execution, deployment or secrets. Keep public static app and unrelated changes. Store private data outside git. Never imply structural validation proves accuracy.

## Review Focus
- Identical observations must not duplicate analysis work.
- Changed profile/source must revoke applicability of previous approval.
- Agents cannot submit analysis for the wrong job or mutate approved proposals.
- Foreign websites cannot approve via loopback requests.
- Collection failures and empty results must remain visible without erasing history.

### Task 1 — store/agent contract
- [x] Add failing Python tests for persistence, dedup, stale submission, pending vs approved, immutable proposals.
- [x] Implement scripts/inbox/store.py using SQLite transactions; jobs return fixed adoption input.
- [x] Run unittest suite; preserve existing work without bulk commit.

### Task 2 — collection and dashboard
- [x] Add failing tests for offline collection and Origin/Host checks.
- [x] Implement scripts/inbox/discovery.py GitHub fixed-host bounded requests, server.py loopback + dashboard.html, scripts/local-inbox.py CLI.
- [x] Run tests, collect real public sources, inspect persisted records and browser.

### Task 3 — integration/verification
- [x] Document agent commands, ownership, approval rules and recurring heartbeat.
- [x] Run Python suite, public unit/E2E, lint/typecheck/build; fresh reviewer, address important findings.
- [x] Save evidence, sync append-only Wiki metadata, report remaining limitations.

## Rulings / progress
- Work in existing feature branch: needed prior implementation is uncommitted; do not copy or discard it for a worktree.
- No bulk commits: unrelated work shares this checkout.
- Initial sources default to GitHub while optional source preference is pending.

## Final evidence and rulings
- Tasks 1–3 complete for the bounded first source (GitHub). Full new/fresh evidence: docs/evals/2026-10-06-local-inbox/README.md.
- Ruling: keep existing dirty feature branch and do not bulk commit; otherwise prior implementation/unrelated work could be lost or included.
- Ruling: first discovery source GitHub, local SQLite rather than Sheets; Instagram and cross-device viewing remain unavailable until their connectors are added.
- Ruling: only proposals with submitted immutable analyses can be approved; needs_info may propose bounded public investigation.
- Final: fixed pre-analysis approval, store regression RED→GREEN.
- Final: fixed failed-save draft loss, real Chrome regression RED→GREEN; edits during save remain dirty.
- Final: no deferred minor findings from independent reviewer. First heartbeat run remains unobserved; existing quality gate remains NOT_PASSED.
