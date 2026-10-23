# Candidate review engineering receipt

Date: 2026-09-15

## Frozen acceptance criteria

- A user can enter a product, paid MCP, open-source project, or service-vendor URL without the site fetching it automatically.
- The prepared request asks the user's subscription AI to compare canonical public sources, current methods, and free alternatives.
- A service vendor cannot receive a payment action, and a product cannot receive a contract action.
- An active payment, trial, or proposal action needs user need, user gap, target capability, and its action-specific evidence.
- ForNerds without an explicit outsourcing gap produces `hold_contract` with typed contract unknowns.
- TypeScript and portable Python validators accept and reject the same core fixtures.
- The existing single-source review remains available.

## Confirmed

- Unit suite: 8 files, 57 tests passed.
- ESLint and TypeScript checks passed.
- Next.js static export built `/`, `/_not-found`, and `/subscription`.
- Playwright static-export suite: 7 tests passed, including the ForNerds contract hold and no automatic external request.
- The captured browser result visibly lists acceptance scope, ownership, and data handling as unresolved contract items.
- Four public-evidence cases were audited on separate relevance, source, user-grounding, and action-safety axes.

## Challenged

- The structural validator rejects cross-candidate sources, unsafe/private URLs, stale input hashes, product/vendor action crossover, active actions without a stated need and gap, unsupported productivity percentages, and `do_not_pay` without a current method or alternative.
- ForNerds' published 90% figure remains labeled as a candidate-owned vendor claim and is not used as a success probability.

## Unknown

- One subscription-model run does not establish output reproducibility across ChatGPT, Claude, and Codex.
- Schema-valid citations do not prove that a quoted excerpt still matches the live page; users must open the cited source.
- The product does not certify actual productivity, vendor quality, legal terms, or contract safety.

The local `engineering-receipt` executable was unavailable, so this receipt follows the required confirmed/challenged/unknown evidence state directly and is covered by repository tests rather than claiming tool validation.
