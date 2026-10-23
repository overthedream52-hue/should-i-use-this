# Firecrawl 공식 자료 조사 및 Creator OS 종합 인계

확인일: 2026-10-21. 조사 의견이며 신규 adoption-v4 검증 결과나 도입 승인이 아니다. 기존 고정 입력의 분석 결과를 새 웹 근거로 덮어쓰지 않았다.

## 목적과 판단

사용자는 공개 도구 정보를 자동 수집하고 본인 업무 적합성을 분석하여 Mac에서 공유하며, 다른 에이전트가 개선을 제안하되 실행은 승인 후 하기를 원한다. 유료 모델 API나 로컬 LLM을 필수로 하지 않는다.

판단: Firecrawl은 공개 제품 홈페이지·공식 문서 수집을 보충하는 도입 검토 후보다. GitHub 수집은 이미 복구됐으므로 지금 전면 교체할 이유는 확인되지 않았다. 무료 한도와 Codex 연결 경로는 확인했지만 실제 수집 품질·절약 시간·일반 서비스의 정확한 데이터 보존 기간은 미확인이다. 자동 운영 도입은 아직 추가 확인 상태다.

대안은 기존 GitHub 수집과 공개 웹 조사 유지다. 추가 서비스 의존성은 적지만 비 GitHub 자료 수집은 별도 흐름이 필요하다. Firecrawl의 기대 이점은 검색과 본문 수집의 통일이며, 실제 효과를 측정한 것은 아니다.

## 공식 근거

- https://www.firecrawl.dev/pricing : 무료 계정 월 1,000크레딧, 매월 갱신, 카드 불필요. 기본 scrape 1페이지 1크레딧, search 10결과당 2크레딧. 검색 후 본문 수집 등은 같은 잔액에서 차감. 이를 모든 방식으로 월 1,000페이지 보장으로 해석하지 않는다.
- https://docs.firecrawl.dev/rate-limits : keyless hosted MCP는 Search/Scrape/Parse 3개. IP별 하루 요청 수와 크레딧 양에 각각 제한, 초과 시 429. 읽은 문서에 정확한 일일 숫자는 없다. 계정 Free의 분당 제한과 keyless 일일 한도는 다르다.
- https://docs.firecrawl.dev/mcp-server : Codex 지원 및 브라우저 로그인 안내. OAuth 주소는 https://mcp.firecrawl.dev/v2/mcp-oauth ; API 키 방식 주소는 https://mcp.firecrawl.dev/v2/mcp 이며 bearer token 사용. 계정 로그인 방식은 API 키를 직접 관리하지 않아도 되지만 Firecrawl 사용량 조건은 별도다. 사용자 Codex 환경에서 연결은 미실행·미검증이다.
- https://www.firecrawl.dev/privacy-policy : 최종 수정 표기 2024-12-26. PII는 서면 삭제 요청까지 보관하며 정기 삭제 정책이 현재 없다고 설명한다. 이는 모든 스크랩 본문 보존 기간을 뜻하지 않는다. 일반 서비스의 본문·캐시·로그별 보존 일수는 이번 확인 자료로 확정할 수 없다.
- https://docs.firecrawl.dev/features/scrape : 일반 scrape ZDR은 Enterprise에서 팀 활성화 필요, 페이지당 추가 1크레딧, 스크린샷과 병용 불가. batch job의 24시간 만료는 전체 데이터 삭제 보장이 아니다.
- https://github.com/firecrawl/firecrawl-docs/blob/main/features/search.mdx : search ZDR도 Enterprise 기능. 검색 제공자까지 포함하는 end-to-end와 anonymized 방식은 보존 범위가 다르다.
- https://www.firecrawl.dev/changelog/lockdown-mode : 별도 lockdown 모드는 캐시만 사용하고 외부 요청 없이 ZDR을 기본 적용한다고 설명한다. 이는 최신 원문을 새로 가져오는 일반 search/scrape의 무보존 보장이 아니다.

무료 서비스가 무보존이라는 결론은 불가. 공개 URL과 공개 검색어만 검토 범위로 하고 개인 프로필·보안 문서·인증 쿠키는 보내지 않는다. 개인 Codex 구독을 분석에 쓰는 것과 Firecrawl 클라우드로 수집 요청을 보내는 것은 별개다.

## SIUT 개발·도입 현황 인계

- TLS: Python 기본 CA 파일 부재가 원인. 수집기에만 macOS 시스템 CA fallback을 추가했으며 인증서 검증은 유지했다. 전역 Python CA는 수정되지 않았으므로 임의 urllib 스크립트에서는 같은 오류가 남는다.
- 실제 수집 run 40: 5건 수집, 실패 0. 상세 근거: ../evals/2026-10-21-inbox-tls/receipt.md
- Python 56개 통과, lint/build 통과. JS 335개 테스트 통과, legacy fixture 누락으로 1 suite 로드 실패. 전체 테스트가 모두 통과한 상태가 아니다.
- BioMCP, ContextMode, n8n, Firecrawl 4개 분석 저장 완료. 현재 jobs 재조회는 빈 배열. 앞의 TLS receipt에 있는 대기 4건은 수리 시점 기록이며 이후 처리됐다.
- BioMCP: 저장된 업무에 생의학 데이터 필요 근거 없음. ContextMode: 실제 맥락 문제와 Codex 연결 근거 부족. n8n: 현재 흐름의 구체적 빈틈과 구독 기반 연결 조건 미확인. Firecrawl: 위 후속 조사 참조. 모두 자동 설치·결제 승인이 아니다.
- Creator OS context_brief 2026-10-21T00:22:18Z: 전체 후보 41, 네 후보 모두 analyzed, 마지막 수집 collected. 이것은 MCP 조회 증거이며 화면 검증이 아니다.

## Creator OS로 모으는 운영 원칙과 요청

사용자가 이번 대화에서 모든 개발·도입 관련 작업을 Creator OS로 모으라고 명시했다. 이 프로젝트의 개발 결과·검증 한계·도입 판단·다음 행동을 Creator OS에 인계한다. 다른 프로젝트 전체의 자동 발송 장치가 구현됐다는 뜻은 아니다.

SIUT는 후보/원문/분석/승인 정본, Creator OS는 통합 현황과 후속 작업 입구로 둔다. 기존 siut-overview-v1은 분석 이유·제안 본문을 제외하므로 상세 보고서까지 자동 공유되지 않는다. 사용자 개인정보 제외를 유지하며 보고서 경로/결론/확인일/근거/검증 상태를 참조하는 상세 연결을 다음 개발 후보로 검토한다. 새 계약과 소비자 양쪽 검증이 필요하다. 상태 읽기는 실행 승인이 아니다.

## 다음 작업 제안 — 아직 실행 승인 아님

범위: 공개 제품 홈페이지, 공식 가격 문서, 동적 공개 문서 각 1건으로 기존 수집과 Firecrawl을 비교한다. 먼저 출처 묶음과 채점 기준을 고정하고 새 adoption-v4 조사 입력으로 묶는다.
효과: 비 GitHub 근거 수집이 실제로 나아지는지 판단.
비용/위험: 무료 한도 소진, 429, 클라우드 전송, 오래된 캐시, 차단/부분 수집. 유료 전환이나 크레딧 자동 충전 금지.
검증: 각 원문의 중요 조건 누락/왜곡, URL·확인시각 보존, 실패 표시, 소비 크레딧, 기존 방식 대비 추가로 얻은 근거를 기록. 3건 결과는 일반 정확도나 생산성 보장이 아니다.
되돌리기: 후보 어댑터 비활성화 및 MCP 연결 해제, 기존 GitHub 수집 유지. 저장 분석/원문은 유지.
설치·계정 연결·결제·배포는 이번 조사에서 실행하지 않았다.

## 완료 범위

DONE_WITH_CONCERNS: 공식 자료 조사 및 인계 문서 작성. 자동 전역 동기화와 Firecrawl 연결은 미구현.
Artifact: BUILT (보고서)
Machine: NOT_APPLICABLE (이번 조사에서 제품 코드 변경 없음; 기존 시험 결과는 위 한계 포함)
User-visible: UNVERIFIED (Creator OS 화면 반영)
Understanding: NOT_REQUESTED
