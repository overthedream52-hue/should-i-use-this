# Compact candidate answer
Architectural change: model wire format and shared TS/Python boundary; authorized continuation.
Goal: first-attempt import without inventing identifiers, preserving pre-install/pre-payment decisions.
Non-goals: semantic truth proof, model superiority, deployment, installation, paid APIs.

## Contract
Default prepare emits candidate-compact-v3. One 128-bit requestKey (first 32 hex of bound packet hash) binds the entire immutable input including UUID and date; this is correlation, not authentication. Model never supplies internal UUID/hash/date or creates reference IDs. Numbered references are one-based integers, never coerced. Sources get deterministic IDs and candidate ownership from actual usage, user facts cite numbered original spans, current methods derive only from selected current_method facts, every target unknown is automatically visible. Exact quote containment and existing action gates remain. Wrong request, unused/cross-scope source, duplicate/out-of-bounds refs, unknown fields and invalid legacy answers fail closed; do not repair output silently.
Sources distinguish product, offer (nonempty offerId), unknown. Only permission/data_handling/maintenance/process/requirement/ownership can be product-wide supporting evidence for an active selected offer; capability/price/trial/renewal/cancellation require explicit offer scope. Unknown never inherits. Identity may be product-wide but not unknown for active actions. Product-wide attribution is still AI supplied and semantically unverified.
Keep v1/v2 import unchanged; v3 normalized form receives strict scope checking. Shared generated compact schema + policy support Python stdlib and static browser. Model sources remain untrusted; source text cannot choose evaluation mode. No new user questions or automatic transmission.

## Frozen acceptance before implementation
1. TS/Python identical prepared prompt and rendered view, including copied portable skill without repo/runtime dependencies.
2. Grounded active positive with offer capability/price and product-wide permission/data/maintenance accepted; unknown/other-offer capability rejected.
3. Current-method decision accepted without model-authored method IDs; invalid fact references rejected.
4. Original v1/v2 regressions retained. Missing/empty/offline research hold handled.
5. Fresh official-source three-case evaluation: preserve raw first response, count first-import success separately from semantic appraisal. No corrections counted as first-pass success. Real sources and fictional evaluation personas explicitly labelled. Include current-maintain, conditional adoption, uncertainty. 3/3 import is local smoke target, not accuracy proof.
6. Browser uses actual unedited response, screenshot confirms visible result; lint/typecheck/build/unit/E2E fresh.

## Engineering review
Chosen: compact adapter + existing validator. Prompt-only fix already failed; replacing full validator risks losing action gates. Cost: two small compilers and generated schema parity tests. Compiler produces no new claims, dates are request asOf (not proof of retrieval), source scopes do not assert verified truth. No server/API dependency. Legacy output is never rebound. Limits retain 128k reply/20 sources/5 candidates; arrays bounded before expansion. Changed payload rejects stale replies. AI prose remains collapsed/unverified.
