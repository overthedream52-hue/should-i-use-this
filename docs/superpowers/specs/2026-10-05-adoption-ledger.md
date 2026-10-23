# Adoption decision and evidence ledger v4
Architectural interface change, authorized recommended continuation. Preserve pre-install judgment, minimal questions, personal subscriptions/no API keys, optional current-method maintenance; no forced trial. Existing v1-v3 public import remains available.

## User flow / design review
Default URL flow: collect public sources with user's existing AI -> user pastes source bundle -> app numbers fixed passages -> copy judgment request -> paste judgment. Source collection never judges fit. If suppliedText is already a valid public source list, skip collection. The extra exchange for URL-only inputs is the explicit cost of retaining static/no-API architecture; a scraping backend is a realistic alternative but would add hosting/privacy obligations, so not selected. No automatic remote fetch or transmission. All state clears on edit, mode switch or reset. New consent for each copied prompt.

Sources are supplied by user or AI, NOT independently authenticated. Store source URL/title/candidate identity/raw normalized text and provenance in the input; partition every text into deterministic 600-Unicode-codepoint passages without dropping any text. Number passages globally. Input key hashes the base input and complete source ledger; stale or changed ledgers reject old replies. Model cites numbers only; app renders original passages. Candidate ownership is bound to canonical candidate URL; references crossing candidates reject.

## Judgment contract
Three verdicts: consider / keep_current / needs_info. Separate cost state free / paid / unknown with evidence numbers. Free never implies fit or lack of fit. No installation/payment/trial execution CTA. Each candidate references need/gap/current-method user span numbers; interpretations remain semantically unverified. consider requires need+gap+capability+price+permission+data_handling+maintenance, known cost, selected offer, current-method comparison, and no material unknowns. Open-source consider additionally needs license evidence. Product-wide conditions may support the selected offer; capability/price require selected offer scope. Unknown or other-offer facts cannot satisfy these gates. keep_current requires a user current-method reference and grounded target capability/requirement so empty recommendations cannot pass. needs_info requires at least one typed missing condition and nextCheck public_sources or one user-owned question. Preserve all unknowns; no silent truncation.
Candidates: maximum5, raw sources10 each12000 UTF16 and total60000, derived passages<=120, claims<=12, answer<=64000. Strict unknown-field rejection. One compact answer per candidate listed in ledger (no omission); exact source and user refs, duplicate-free, 1-based integer, nonboolean. Cost evidence must be supported by selected price claim; product identity/cost scope interpreted by model, not truth guarantee.
Accept pure JSON OR exactly one JSON code fence; optional outside prose is excluded with visible disclosure. Two fences/ambiguous structures reject. Preserve unmodified reply in evaluation artifacts. Old parser behavior unchanged.

## Frozen acceptance
- Positive free adoption is represented as consider+free, not do_not_pay; paid needs_info and keep_current both supported.
- No model-authored source text accepted in judgment; changed source/request/cross-candidate/invalid numbering fail closed.
- Source collection supports long public extracts without old1200 output recopy problem; oversized bundles reject, never truncate.
- Web and portable Python identical prepare/passage/view; Unicode boundaries covered; copied skill works without repository.
- UI shows collected source provenance, step transition, separate verdict/cost and no ignored prose as action; edits clear sources/results.
- New independent official-source cases frozen before first model runs: free adoption candidate, paid missing conditions, existing adequate method. Record first untouched outputs and semantic quality separately; no forced-pass retries.
- Fresh unit, lint, typecheck, build, Chrome E2E and independent code review; manual receipt if tool unavailable. No deployment.
