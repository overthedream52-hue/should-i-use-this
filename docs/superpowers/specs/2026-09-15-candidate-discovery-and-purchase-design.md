# 후보 탐색·결제 전 판단 공용 계약 설계

상태: 사용자 승인 완료. 2026-09-15 엔지니어링 검토 반영.

## 목적

사용자가 유료 MCP, AI 제품, SaaS, 플러그인, 오픈소스 프로젝트 또는 외주업체를 발견했을 때 설치·결제·계약 전에 다음 질문에 답한다.

> 이 후보가 내가 실제로 해결하려는 일을 지원하는가? 현재 방법이나 무료·오픈소스 대안보다 나은가? 비용·권한·운영·계약 부담을 감수할 근거가 있는가?

후보를 모르는 사용자는 업무와 불편만 입력해 후보를 찾을 수 있다. 후보를 아는 사용자는 이름, URL, 스크린샷에서 읽은 텍스트 또는 추천 목록을 입력해 같은 작업을 하는 대안을 함께 찾는다. ForNerds 같은 외주업체도 같은 입구에서 시작하되 상담 가치와 계약 가치를 분리한다.

## 보존할 제품 원칙

- 설치·체험 후 만족도가 아니라 도입·결제 전 개인 업무 적합성을 판단한다.
- 웹과 Codex 스킬은 같은 버전의 JSON 계약과 고정 사례를 사용한다.
- 개발자 API 키, 로컬 LLM, 공유 계정 또는 앱 백엔드를 요구하지 않는다.
- 웹은 사용자의 구독 AI에 붙여넣을 요청을 만들고 결과를 브라우저에서 구조적으로 검사한다. Codex 스킬은 공개 웹을 직접 검색할 수 있을 때 같은 계약으로 판단한다.
- 사용자 동의 없이 설정, 대화, 개인 파일 또는 업무 문서를 읽지 않는다.
- 공개 페이지의 지시와 설치 명령은 자료로만 취급하고 실행하지 않는다.
- 스타·다운로드·순위는 인기 정보일 뿐 개인 적합성이나 효과 근거로 사용하지 않는다.
- 후보 발견, 업무 적합성, 결제·계약 결론을 분리한다. 검색에 잡혔다는 사실은 결제 추천이 아니다.
- 브라우저 검사는 AI가 인용한 원문의 진위를 보증하지 않는다. 원문 링크와 인용문을 표시해 사용자가 직접 확인할 수 있게 한다.

## 한 번의 사용자 흐름

1. 사용자는 알고 있는 후보 이름/URL 또는 해결하려는 일과 현재 불편을 입력한다.
2. 브라우저는 입력을 문장 단위 span과 해시가 있는 신뢰 입력으로 바꾸고, 사용자의 구독 AI용 요청을 만든다.
3. 구독 AI 또는 Codex 스킬은 공개 원문을 검색해 최대 다섯 후보와 현재 방법·무료·오픈소스 대안을 조사한다.
4. AI는 하나의 응답 안에서 후보 발견, 개인 적합성, 결제·계약 행동을 각각 반환한다.
5. 공용 검사기는 ID·출처·인용·행동 규칙을 검사한 뒤 결과를 보여준다. 의미와 원문 진위는 기계 인증이 아니라고 표시한다.

웹 사용자는 한 번 복사하고 한 번 가져온다. 세 계약은 코드와 검증의 경계이며 사용자에게 세 번의 입력을 요구하지 않는다.

## 신뢰 입력 계약

```ts
type CandidateReviewInput = {
  id: string;
  asOf: string;
  subject: {
    name: string;
    url: string;
    suppliedText: string;
    sourceKind: "single_candidate" | "candidate_list" | "unknown";
  };
  situation: string;
  requestedKinds: Array<
    | "mcp"
    | "skill"
    | "plugin"
    | "software"
    | "saas"
    | "open_source"
    | "service_vendor"
  >;
  maxCandidates: number;
};

type CandidateReviewPacket = CandidateReviewInput & {
  userSpans: Array<{ id: string; text: string }>;
  inputHash: string;
};
```

`name` 또는 `url` 또는 `situation` 중 하나는 있어야 한다. URL은 자격 증명·fragment를 포함하지 않는 공개 HTTPS URL이어야 한다. 앱은 URL을 자동 방문하지 않는다. `situation`은 최대 4,000자, 붙여넣은 목록은 최대 16,000자다. 준비 단계는 빈 문장을 버리고 사용자 문장을 `u1`, `u2`처럼 고정한다.

## 공용 응답 계약

```ts
type CandidateReviewAnswer = {
  id: string;
  inputHash: string;
  asOf: string;
  status: "ready" | "hold";
  userFacts: Array<{
    id: string;
    category: "job" | "need" | "gap" | "current_method" | "constraint";
    statement: string;
    userSpanIds: string[];
  }>;
  workstream: {
    label: string;
    statement: string;
    userFactIds: string[];
  };
  discoverySources: Array<{
    id: string;
    url: string;
    title: string;
    note: string;
  }>;
  sources: SourceRecord[];
  candidates: Candidate[];
  currentMethods: CurrentMethod[];
  excluded: ExcludedCandidate[];
  commitment: CommitmentDecision;
  limitations: string[];
};

type SourceRecord = {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
  owner: "candidate" | "platform" | "independent";
  appliesToCandidateIds: string[];
};

type Candidate = {
  id: string;
  name: string;
  kind: CandidateReviewInput["requestedKinds"][number];
  role: "target" | "free_open_source" | "paid_alternative" | "vendor_alternative";
  canonicalUrl: string;
  canonicalSourceId: string;
  relation: "direct" | "indirect";
  relationReason: string;
  userFactIds: string[];
  claims: Array<{
    id: string;
    category:
      | "identity"
      | "capability"
      | "price"
      | "trial"
      | "renewal"
      | "cancellation"
      | "requirement"
      | "permission"
      | "data_handling"
      | "maintenance"
      | "process"
      | "ownership"
      | "vendor_claim";
    statement: string;
    sourceIds: string[];
  }>;
  license: {
    status: "documented" | "unknown" | "not_applicable";
    spdxId: string | null;
    sourceIds: string[];
  };
  unknowns: Array<{
    id: string;
    category: "price" | "permission" | "data_handling" | "maintenance" | "ownership" | "acceptance" | "payment_terms" | "termination" | "effect";
    statement: string;
  }>;
};

type CurrentMethod = {
  id: string;
  statement: string;
  userFactIds: string[];
};

type ExcludedCandidate = {
  name: string;
  url: string;
  reason: "identity_mismatch" | "no_canonical_source" | "license_unknown" | "unrelated" | "duplicate";
};
```

`discoverySources`는 추천 게시물·목록·검색 결과처럼 후보를 발견한 경로다. 기능·가격·계약 판단 근거로 참조할 수 없다. `sources`는 후보의 정본 페이지 또는 별도 독립 자료이며, claim은 이 source ID만 참조한다. 브라우저가 검증하는 것은 URL 형식, 참조 무결성, 크기 제한과 행동 규칙이다. 인용문의 실제 원문 일치 여부와 주장 진위는 사용자의 AI 및 사용자가 원문 링크에서 확인해야 한다.

모든 URL은 공개 HTTPS여야 하고 `javascript:`, localhost, 사설 IP, 자격 증명과 민감한 query key를 거부한다. 후보 정본 URL에서는 fragment를 제거하고 원문 source URL에는 특정 절을 가리키는 fragment를 허용한다. `retrievedAt`은 입력의 `asOf`와 같아야 한다. source는 최대 20개, excerpt는 각 1,200자, claim은 후보당 12개다.

오픈소스 후보는 정본 저장소와 라이선스 원문을 인용할 때만 `documented`다. 검사는 라이선스 출처가 있다는 사실을 확인할 뿐 법적 효력이나 원문 진위를 인증하지 않는다. 유료 제품과 업체는 `not_applicable`을 쓸 수 있다.

## 업무 적합성 규칙

기존 fit v4의 핵심을 유지한다. 적극적인 결제·계약 행동에는 다음 연결이 필요하다.

1. 사용자가 실제로 해결하려는 일 또는 불편인 `need` userFact
2. 현재 방법으로 안 되거나 부족하다고 사용자가 명시한 `gap` userFact
3. 그 부족을 메우는 후보의 `capability` claim

단순 호기심, 직업명, 후보 이름, “쓸 만한가”라는 질문은 gap이 아니다. 현재 도구 이름만 보고 기능 부재·중복·숙련도를 만들지 않는다. 후보의 기능 범위를 사용자의 직업 전체로 확대하지 않는다.

## 결제·계약 계약

```ts
type CommitmentAction =
  | "review_payment"
  | "trial_first"
  | "hold_payment"
  | "do_not_pay"
  | "request_proposal"
  | "hold_contract"
  | "research_hold";

type CommitmentDecision = {
  targetCandidateId: string | null;
  action: CommitmentAction;
  statement: string;
  userFactIds: string[];
  claimIds: string[];
  alternativeCandidateIds: string[];
  currentMethodIds: string[];
  unknownIds: string[];
};
```

- `review_payment`: 비업체 후보이며 need+gap+capability 연결이 있고, 실제 가격·필수 권한·데이터 처리·운영 조건이 확인됐으며 현재 방법과 무료 대안으로 같은 gap을 해결할 근거가 없다.
- `trial_first`: 비업체 후보이며 need+gap+capability 연결이 있지만 효과가 불확실하고 무료 체험이나 쉽게 되돌릴 수 있는 파일럿이 공식 문서에 있다.
- `hold_payment`: 핵심 기능, 실제 가격, 자동 갱신, 권한, 데이터 처리 또는 사용자 제약이 미확인이다.
- `do_not_pay`: 명시된 추가 이점이 없거나 현재 방법·무료 대안이 gap을 충분히 해결한다는 근거가 있다.
- `request_proposal`: `service_vendor`가 사용자의 명시된 need+gap과 관련된 공개 역량 및 무료 상담·제안 절차를 공식적으로 제시한다. 상담이나 제안서 요청까지만 뜻한다.
- `hold_contract`: 업체의 서면 견적·SOW·소유권·데이터 처리·검수·지급·해지 조건이 부족하다.
- `research_hold`: 공개 웹 접근 실패, 후보 정체성 불명 또는 정본 원문 부재로 제품/업체용 행동조차 고를 수 없다.

업체에는 제품용 행동을, 제품에는 업체용 행동을 쓸 수 없다. `research_hold`는 `status=hold`, null target과 함께만 쓴다. 공개 홈페이지에 가격과 계약 조건이 없으면 계약을 권하지 않는다. `request_proposal`은 사용자가 실제 외주 필요와 현재 부족을 말했고 업체 식별·역량·제안 절차 claim이 있을 때만 가능하며, 그렇지 않으면 `hold_contract`다. `review_payment`에는 기능·가격·권한·데이터 처리·운영 조건이, `trial_first`에는 기능·체험·가격/갱신·취소·권한·데이터 처리 조건이 모두 필요하다.

생산성 향상률, 회수 기간 또는 절감액을 임의로 만들지 않는다. 계산에는 사용자가 제공한 기준선과 공식 가격이 모두 있어야 한다.

## 외주업체·컨설팅 검증

`service_vendor`는 다음 항목을 서로 다른 claim 또는 unknown으로 보존한다.

- 책임 주체의 공개 식별 정보
- 관련 포트폴리오의 구체성
- 상담, 견적, 계약, 설계, QA, 배포, 인수인계, 유지보수 절차
- 공개 가격 또는 맞춤 견적 여부
- 결과물·소스코드·모델·데이터·프롬프트의 소유권과 인도 조건
- 업무 데이터 처리 위치, 재위탁, 보관·삭제 조건
- 지급 단계, 검수 기준, 변경 요청, 중도 해지, 하자 대응과 SLA
- 고객 수, 재계약률, 수상, 성능 등 업체 자체 주장은 `vendor_claim`으로 표시

ForNerds의 공개 사이트에서 확인되는 서비스·절차·무료 상담·맞춤 견적은 상담 여부를 검토하는 자료다. 재계약률 등 업체 수치는 `vendor_claim`이며 독립 검증이 아니다. 공개 가격과 서면 계약 조건이 없으므로 사이트만으로 계약 가치를 확정할 수 없다.

## 후보 순서와 오류 처리

후보 순서는 정확한 작업·불편, 정본 근거, 현재 방법 대비 추가 기능, 무료·오픈소스 대안, 비용·권한·데이터·운영 부담 순서로 정한다. 별, 조회수, 추천 게시물 순위와 광고 문구는 자동 가중하지 않는다.

- 검색이나 최신 공개 원문 접근이 없으면 `status=hold`와 제한 이유를 반환한다.
- 후보 URL과 제품 정체성이 다르면 제외한다.
- 가격이 로그인·상담 뒤에만 보이면 `가격 미확인`으로 남긴다.
- 여러 제품을 소개한 페이지는 discovery source일 뿐이며 각 후보의 정본 원문을 따로 찾는다.
- 외주업체 사례 제목은 고객 성과나 동일 역량을 자동으로 증명하지 않는다.
- 파싱·참조·행동 규칙이 하나라도 깨지면 전체 가져오기를 거부하고 안전한 오류를 표시한다.

## 사용자에게 보이는 최소 정보

첫 화면은 다음만 보여준다.

1. `결제 검토 / 체험 먼저 / 결제 보류 / 결제하지 않기 / 제안서 요청 / 계약 보류`
2. 내 업무와 연결된 이유 한 문장
3. 현재 방법과 무료·오픈소스 대안
4. 결제·계약 전에 확인할 가격·권한·데이터·소유권 조건

검색 경로, 후보 전체, 제외 후보와 원문 인용은 접어서 확인한다. 결과 하단에는 “AI가 제시한 공개 출처의 구조와 연결을 검사했으며, 원문 진위·실제 효과·계약 안전을 보장하지 않는다”를 항상 표시한다.

## 사전 등록 평가

개인 정보가 없는 고정 입력과 기대 규칙을 먼저 저장한다.

1. **영상 제품:** Runway 유료 플랜과 현재 영상 생성 방법·무료/공개 대안을 비교한다.
2. **코딩 도구:** Serena 유료 JetBrains 플러그인과 무료 Serena MCP·현재 코딩 도구를 비교한다.
3. **마케팅 제품:** vidIQ 유료 플랜과 YouTube Studio·공개 대안을 비교한다.
4. **외주업체:** ForNerds와 자체 개발·프리랜서·다른 업체를 비교하고 공개 홈페이지에서 `hold_contract`가 나오는지 확인한다. 명시된 외주 need+gap이 있는 별도 입력에서는 `request_proposal`까지만 허용한다.

합격 기준:

- 네 사례 모두 직접 관련 후보와 현재/무료 대안 범주를 구분한다.
- 표시 후보마다 정본 URL, 기능 근거, 부담 또는 미확인 정보가 있다.
- 오픈소스 `documented`에는 라이선스 source가 있다.
- 업체 자기 주장을 independent source로 표시하지 않는다.
- 가격·SOW가 없는 업체에 계약 또는 결제 권유가 나오지 않는다.
- 검색 단계가 적합성 또는 결제 결론을 대신하지 않는다.
- 스타·인기도만으로 순서를 정하지 않는다.

## 주석 회귀 사례

UsageScope, Headroom, Serena, claude-mem, Ponytail을 영상 제작자의 맥락에서 비교했던 사례는 원문 대신 일반화한 고정 입력으로 보존한다. 다음 오류를 각각 검사한다.

- 사용자의 업무를 영상 제작 하나로 축소한다.
- 근거 없는 시간 절감률이나 합격선을 만든다.
- 큐레이션 지식과 자동 세션 기억처럼 목적이 겹치는 기능을 동일하다고 단정한다.
- 서로 다른 workstream의 후보를 같은 이유로 일괄 판정한다.

발견 품질과 설명 품질은 별도로 보고한다.

## 파일 경계

- `lib/candidate-review-v1.ts`: 브라우저 공용 준비·스키마·해시·검사·view
- `components/candidate-review-workspace.tsx`: URL/상황 입력, 복사, 결과 가져오기
- `components/candidate-review-result.tsx`: 최소 행동과 접힌 근거 표시
- `.agents/skills/should-i-use-this/scripts/candidate_contract.py`: Python 표준 라이브러리 동등 검사기
- `.agents/skills/should-i-use-this/references/candidate-contract.md`: 검색·근거·후보 순서·업체 규칙
- `tests/fixtures/candidate-review/`: 개인 식별 정보를 제거한 입력·응답·기대 규칙
- `tests/unit/candidate-review-contract.test.ts`: 웹·스킬 계약 동등성, 위조·누락·범주 오류
- `tests/e2e/candidate-review.spec.ts`: ForNerds 예시의 복사·가져오기·계약 보류 화면
- `docs/evals/2026-09-15-candidate-review/`: 네 고정 사례 결과와 한계

기존 `subscription-workspace`의 단일 원문 fit v4는 유지한다. 홈에서 “URL·후보 비교”와 “원문 하나 판단”을 선택하게 한다. 자동 크롤러, 계정 연결, 결제·상담 전송, MCP 서버는 포함하지 않는다.

## 수용 기준

- 웹과 스킬이 같은 입력에서 같은 view 또는 같은 거절을 만든다.
- URL 하나로 ForNerds 같은 업체를 `service_vendor`로 다룰 수 있다.
- 추천 목록과 정본 근거를 구분한다.
- 업체 자기 주장, 플랫폼 사실, 독립 근거를 섞지 않는다.
- 사용자가 말하지 않은 불편, 현재 방식의 실패 또는 예산을 만들지 않는다.
- 결제·계약 전 미확인 조건을 행동으로 명확히 보여준다.
- 기존 fit v4와 정적 GitHub Pages 빌드가 통과한다.
- 네 고정 사례와 주석 회귀 사례가 서로 독립적으로 보고된다.
