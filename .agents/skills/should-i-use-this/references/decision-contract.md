# Decision contract v4

Use this reference after `fit_contract.py prepare` creates the trusted packet.

## Output shape

Return one JSON object with exactly these fields:

```json
{
  "id": "copy packet.id",
  "inputHash": "copy packet.inputHash",
  "decision": "consider | hold | skip",
  "facts": [
    { "id": "lowercase_id", "category": "feature | requirement", "statement": "한국어 원자 주장", "spanIds": ["S1"] }
  ],
  "userFacts": [
    { "id": "lowercase_id", "statement": "사용자가 명시한 상황", "spanIds": ["U1"] }
  ],
  "judgments": [
    { "statement": "근거와 사용자 상황을 비교한 예상 판단", "factIds": ["fact_id"], "userFactIds": ["user_id"] }
  ],
  "burdenFactIds": ["requirement_id"],
  "unknowns": ["결론에 중요한 미확인 정보"],
  "questionCode": null,
  "adoptionBasis": null
}
```

`questionCode` is `null`, `goal`, or `constraint`. `adoptionBasis` is `null` or:

```json
{
  "needUserFactId": "user need id",
  "gapUserFactId": "current-method gap id",
  "benefitFactId": "documented feature id"
}
```

## Decision gate

- `consider`: The user explicitly states a job or pain, explicitly states that the current method cannot do it or is insufficient, and a documented feature addresses that exact gap. Put those three IDs in `adoptionBasis` and connect all three in at least one judgment.
- `hold`: A need, current gap, relevant feature, or decisive condition is missing. `adoptionBasis` must be `null`.
- `skip`: The user states a conflict with a required condition, or explicitly says the current method is sufficient and the candidate adds no needed benefit. `adoptionBasis` must be `null`.

Do not use “the user is building something,” “the user is curious,” the candidate's popularity, or a general capability as the gap. Do not infer a missing capability from the name of an existing tool. Actual installation, trial, or measured time savings is not required for `consider`, but never claim it already happened.

## Evidence fields

- `facts`: Product statements supported in full by the selected `sourceSpans`. One statement contains one claim. Preserve headings, table columns, scope, negation, optionality, product edition, and hosting path. A source's marketing or benchmark claim remains a source claim, not an independent measurement.
- `userFacts`: Only facts explicitly present in `userSpans`. Do not mix product claims into user facts or turn a goal into a current-method gap.
- `judgments`: Comparisons between selected product facts and user facts. Every `consider` or `skip` judgment needs at least one valid ID from both groups. A `hold` may use empty references when the absence of evidence is itself the reason.
- `burdenFactIds`: Only documented `requirement` facts relevant to the considered path. Do not convert a feature, assumed storage, or unspecified operator into a burden.
- `unknowns`: Important missing information only. Do not present missing evidence as proof of absence and do not ask the user to investigate the product.

IDs are unique lowercase identifiers matching `[a-z][a-z0-9_-]{0,31}`. Use at most six product facts, four user facts, three judgments, three unknowns, and six burden IDs. Statements and unknowns are at most 400 UTF-16 code units.

## Question rule

Use `goal` only if the user's intended work is absent. Use `constraint` only if a user-owned constraint can change the current outcome. Do not ask again when the situation already contains the answer. Product documentation gaps produce `hold`, not a request for the user to find documentation.

## Report meaning

The validator proves input binding, shape, reference existence, and the adoption-basis connection. It does not prove that a statement faithfully follows from the cited text. Re-read each cited span and its `contextIds` before reporting. Label the result as an evidence-based prediction before adoption.
