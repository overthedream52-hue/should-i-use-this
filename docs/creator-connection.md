# Creator OS 연결 경계

Should I Use This는 후보 수집·업무 적합성 분석·원문/승인 기록의 정본이다. Creator OS는 공통 CLI의 읽기 전용 요약을 표시하는 소비자다. 같은 Mac의 같은 DB를 참조하면 새로운 후보와 분석 상태는 다음 조회 때 반영되지만 두 제품의 화면·코드·배포까지 자동으로 합쳐지는 것은 아니다.

## 공통 계약

- 생산자: `python3 scripts/local-inbox.py overview`
- 버전: `siut-overview-v1`
- 자동 점검: `python3 scripts/check-creator-connection.py`
- 점검 exit0: 생산자 계약과 DB 가용성 확인. exit3: 계약은 맞지만 DB 없음. exit2: 실행/형식 오류. 이 결과는 Creator OS 화면이나 배포 완료를 증명하지 않는다.
- 공유: 후보 이름/공개 GitHub URL/수집시각, 분석 및 제안 상태, 전체 개수, 최근 수집 상태. 목록은 최대20개이고 전체 개수는 별도다.
- 제외: 사용자 상황, README 본문, 분석 이유, 제안 본문, 승인 토큰.
- `pendingApproval`과 `approved`는 제안 건수가 아니라 해당 상태를 가진 후보 수다. 같은 후보에 두 상태의 제안이 있으면 화면 label은 approved 우선이므로 pending label 수와 pendingApproval이 다를 수 있다.
- 읽기 요약은 실행 허가가 아니다. 구체적 범위와 현재 승인은 후보함의 `approved` 계약으로 실행 직전에 재확인한다.

`inbox.creator_contract.validate_overview`는 예상 밖 필드, 버전 변경, 모순되는 개수/상태, 지원하지 않는 URL, 개인 데이터 필드 혼입을 거절한다. 필드 안의 자연어에 민감정보가 섞였는지를 판독하는 DLP 도구는 아니다. 새 출처를 지원하려면 생산자와 소비자의 URL/근거 계약을 함께 갱신해야 한다.

## 소비자 연결 확인 순서

1. 복제 DB나 별도 스케줄러를 만들지 않고 정본 CLI와 저장소를 지정한다.
2. 정상/DB 없음/생산자 오류/새 버전/20개 초과 응답을 소비자에서도 검사한다.
3. 데이터 조회 실패는 미연결로 표시하며 과거 값을 실시간 값으로 표현하지 않는다.
4. 연결된 개발 화면에서 새로고침 반영과 후보함 이동을 확인한다.
5. 운영 반영은 기존 승인 규칙을 따른다. 개발 작업본 검증을 운영 화면 완료로 보고하지 않는다.

2026-10-06 협업 작업의 전달 상태: Creator OS 쪽은 격리 작업본의 `tool_candidates.py` → `/api/tool-candidates` → 프로젝트 현황 패널 연결을 진행 중이라고 알렸다. 운영8770은 v06으로 해당 패널이 없다고 보고했다. 이 문서는 그쪽 보고를 인계한 것이며 여기서 운영 화면을 검증한 기록이 아니다.

## 상세 요약 계약 `siut-digest-v1` (2026-10-23)

- 생산자: `python3 scripts/local-inbox.py digest [--no-reason]`. 검사: `inbox.digest_contract.validate_digest`.
- `overview`와 같은 읽기 전용 연결(`mode=ro`, `query_only`)이며 DB를 만들거나 바꾸지 않는다. 기존 `siut-overview-v1`은 그대로 유지한다.
- 공유: 후보 이름/공개 GitHub URL/수집시각, 분석·제안 상태, 저장된 adoption-v4 판정 중 `verdict`, `reason`(300자 상한, `--no-reason`으로 제외 가능), `claims[]`의 `statement/scope`와 근거 `url/title`, `unknowns[]` 문장, `nextCheck`, `costKind`, 제안 상태 갱신 시각, 작업 ID 앞 8자. 최대 20개.
- 제외: `settings.profile`, `jobs.input`, 원문 README(`observations.text`), 근거 발췌문(`evidence.text`), 제안 본문, 승인 토큰, 이벤트.
- 소비자(Creator OS `creator-digest-v1` 생산자)는 받은 자연어를 다시 민감정보 검사에 통과시킨 뒤에만 외부 요약에 넣는다. 이 계약 자체는 외부 배포나 승인 변경이 아니다.
