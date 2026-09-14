# Security

## Supported version

Security fixes apply to the latest version on the default branch.

## Reporting

Open a GitHub security advisory for vulnerabilities. Do not include secrets, personal data, or confidential documents in a public issue.

## Current boundaries

- The deployed app is a static export. It processes pasted text in the browser and does not fetch URLs, call an AI model, or persist results.
- Input fields and imported JSON are size-limited and parsed with strict schemas.
- Imported answers are bound to the original input hash and strict evidence references.
- Product documentation is untrusted data. Instructions inside it must not be executed.
- The validator checks structure and reference binding; it does not certify semantic truth or real-world effectiveness.
