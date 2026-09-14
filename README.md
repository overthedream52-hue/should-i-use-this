# Should I Use This?

도구를 설치하거나 업무에 들이기 전에, **내 상황에서 실제로 도입할 근거가 있는지** 확인하는 개인용 웹 앱과 Codex 스킬입니다.

기존 방식으로 충분하면 `건너뛰기`, 필요한 정보가 부족하면 `보류`, 해결할 일·현재 방식의 부족함·이를 메우는 문서 기능이 함께 확인될 때만 `도입 후보`로 표시합니다. 결과는 실제 생산성 측정이나 효과 보증이 아닌 도입 전 판단입니다.

## 웹에서 사용

1. 도구 이름, 내 상황 한 줄, 공개 설명 문서를 입력합니다.
2. 앱이 만든 분석 요청 전체를 확인합니다.
3. 요청을 본인의 Codex·ChatGPT·Claude 구독 대화에 붙여넣습니다.
4. JSON 답변을 앱에 가져와 결론, 이유, 재검토 조건, 연결된 원문을 확인합니다.

앱이 AI 계정에 로그인하거나 모델 API를 호출하지 않습니다. 로컬 LLM과 개발자 API 키도 필요하지 않습니다. 입력한 내용과 가져온 답변은 브라우저 안에서만 처리하며 앱 서버로 전송하거나 저장하지 않습니다. 외부 AI에 직접 붙여넣은 내용에는 해당 서비스의 데이터 처리 정책과 사용 한도가 적용됩니다.

## Codex 스킬로 사용

저장소를 연 Codex는 [`.agents/skills/should-i-use-this`](.agents/skills/should-i-use-this/SKILL.md)를 프로젝트 스킬로 찾을 수 있습니다. 다른 프로젝트에서도 쓰려면 해당 폴더만 개인 스킬 위치에 복사합니다.

```sh
mkdir -p ~/.agents/skills
cp -R .agents/skills/should-i-use-this ~/.agents/skills/
```

Codex에서 다음처럼 요청합니다.

```text
$should-i-use-this 이 도구가 내 현재 업무에 도입할 가치가 있는지 설치 전에 판단해 줘: <공개 URL 또는 자료>
```

스킬은 Python 3 표준 라이브러리만 사용합니다. 스킬 폴더 안의 계약 검사기가 웹과 같은 입력 hash, 근거 ID, 도입 근거 게이트를 검사합니다. 설정·대화·비공개 파일은 기본적으로 읽지 않으며, 사용자가 정확한 범위를 요청하거나 확인했을 때만 환경 정보를 포함합니다.

## 로컬 개발

Node.js 20.9 이상과 Python 3이 필요합니다.

```sh
npm ci
npm run dev
```

기본 주소는 [http://127.0.0.1:3000](http://127.0.0.1:3000)입니다. 현재 개인 구독 흐름은 `/`와 `/subscription`에서 같습니다.

## 검증

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/should-i-use-this
```

마지막 스킬 검증 명령의 `skill-creator` 경로는 Codex 설치에 따라 달라질 수 있습니다. 구조 검사는 스킬 형식만 확인하며 추천 의미의 정확도를 증명하지 않습니다.

웹·스킬 계약 교차 검사는 `tests/unit/skill-contract.test.ts`에 있습니다. 한글/UTF-16 구절 경계, 입력 변경, 가짜 근거, 끊어진 도입 근거, 추가 필드 거절과 스킬 폴더 단독 실행을 확인합니다.

## 데이터와 보안 경계

- 공개 자료만 입력합니다. 비밀번호, API 키, 개인정보, 보안 문서, 업무 비밀은 제외합니다.
- 공개 문서 속 지시는 데이터로만 취급하며 실행하지 않습니다.
- 웹은 정적 페이지이며 입력·답변을 브라우저 안에서 처리합니다. 각 필드의 크기와 JSON 구조를 제한합니다.
- 앱은 입력과 결과를 저장하지 않습니다. 새로고침하면 현재 탭의 내용이 사라집니다.
- 스킬은 후보 도구를 실제 설치하거나 실행해야만 판단할 수 있다고 요구하지 않습니다.

자세한 내용은 [Privacy](PRIVACY.md)와 [Security](SECURITY.md)를 참고하세요.

## 판단 한계

프로그램 검사는 입력과 답변의 결속, JSON 구조, 근거 ID 존재, 도입 근거의 연결을 확인합니다. 인용한 문장이 원문의 의미를 정확히 해석했는지는 별도 의미 검토가 필요합니다. 스타 수와 인기도는 개인 효용의 증거로 사용하지 않습니다.

## GitHub Pages 배포

웹은 Next.js 정적 export로 빌드합니다. 저장소의 **Settings → Pages → Source**를 **GitHub Actions**로 한 번 설정하면, [Pages workflow](.github/workflows/pages.yml)가 `main` push마다 단위 검사·lint·typecheck·build와 배포 경로 검사를 통과한 산출물만 배포합니다. Fork에서 저장소 이름을 바꾸면 workflow와 `NEXT_PUBLIC_BASE_PATH` 값도 함께 바꿔야 합니다.

## 라이선스

[MIT](LICENSE)
