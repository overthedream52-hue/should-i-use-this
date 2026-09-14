# Security

## Supported version

Security fixes apply to the latest version on the default branch.

## Reporting

Open a GitHub security advisory for vulnerabilities. Do not include secrets, personal data, or confidential documents in a public issue.

## Current boundaries

- `/api/subscription` accepts same-origin JSON only and applies request and field limits.
- It processes pasted text in memory and does not fetch URLs, call an AI model, or persist results.
- Imported answers are bound to the original input hash and strict evidence references.
- Product documentation is untrusted data. Instructions inside it must not be executed.
- The validator checks structure and reference binding; it does not certify semantic truth or real-world effectiveness.
