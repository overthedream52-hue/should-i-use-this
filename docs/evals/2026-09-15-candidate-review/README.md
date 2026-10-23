# 후보 탐색·결제 전 판단 v1 평가

이 평가는 계약 검사와 추천 품질을 분리한다. tests/fixtures/candidate-review는 위조된 ID, 후보 간 출처 바꿔치기, 행동 유형 오류를 잡는 결정적 회귀 자료다. results.json은 동결한 네 사용자 상황에 대해 Codex가 공개 원문을 조사한 한 번의 결과를 사람이 공식 원문과 대조한 기록이다.

네 축을 따로 채점했다.

- **후보 관련성:** 후보와 대안이 지정한 workstream에 직접 관련되는가
- **출처 진위:** 기록한 요약이 2026-09-15에 읽은 정본 원문과 일치하는가
- **업무 근거:** 행동이 사용자가 말한 need·gap·현재 방법만 사용하는가
- **행동 안전성:** 가격이나 계약 정보가 부족할 때 결제·계약을 권하지 않는가

이번 단일 실행의 비식별화된 실제 출력은 [model-output.json](model-output.json), claim별 공식 원문 대조는 [claim-audit.json](claim-audit.json)에 저장했다. 네 사례가 네 축을 모두 통과했지만 모델 간 재현성이나 실제 효과를 증명하지 않는다. 특히 ForNerds의 재계약률 90%는 업체 자체 주장으로만 보존했고 계약 성공 가능성으로 사용하지 않았다.

브라우저 표시 증거는 [ForNerds 계약 보류 화면](fornerds-result.png), 검증 상태는 [engineering receipt](engineering-receipt.md)에 보존한다.

실제 제품 품질을 다음 단계에서 높이려면 같은 gold-rules.json을 여러 구독 모델에 반복 실행해 후보 recall과 행동 일치율을 별도로 비교한다.
