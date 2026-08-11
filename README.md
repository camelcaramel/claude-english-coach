# english-coach 사용법

한국어로 프롬프팅하면 개발용 영어 표현을 옆에서 알려주고 자동으로 적립한다.
별도 API 키를 쓰지 않고 Claude Code 세션 인증 안에서 동작한다.

플러그인 내부 설계는 [plugins/english-coach/README.md](plugins/english-coach/README.md),
핫키 도구는 [tools/hotkey/README.md](tools/hotkey/README.md),
검증 근거는 [srd.md](srd.md) 참고.

## 네 가지 사용법

| 무엇 | 어떻게 | 어디서 |
| --- | --- | --- |
| **노출** — 한국어로 쓰면 영어를 보여준다 | 아무것도 안 함 (자동) | Claude Code |
| **교정** — 어설픈 영어를 고쳐서 작업까지 | `/en <영어>` | Claude Code |
| **복습** — 리포트·플래시카드 | `/en-review` | Claude Code |
| **변환** — 클립보드를 영어로 | **Ctrl+Alt+E** | **어디서든** |

앞의 셋은 Claude Code(터미널·Desktop Code 탭) 안에서만 된다. 마지막 하나는
Claude Desktop 채팅창, 브라우저 검색창, Slack 등 **터미널 밖 아무 데서나** 된다.

네 경로 모두 같은 `log.jsonl` 에 쌓여 `/en-review` 한 화면에 모인다.

---

## 다른 세션에서 쓰려면 — 이미 됩니다

`user` 스코프로 설치돼서 `~/.claude/settings.json`의 `enabledPlugins`에 들어가 있다.
**모든 프로젝트, 모든 세션에 자동 적용된다.** 프로젝트마다 다시 설치할 필요 없다.

```json
"enabledPlugins": { "english-coach@english-coach-dev": true }
```

이미 열려 있던 다른 세션에만 반영이 안 돼 있다. 그 세션에서 한 번만:

```
/reload-plugins
```

또는 그냥 재시작하면 된다. 확인:

```
/plugin        →  English Coach 가 enabled 로 보이면 끝
```

### 다른 PC에서 쓰려면

비공개 저장소이므로 그 PC에서 `gh auth login` 이 돼 있어야 한다.

```
/plugin marketplace add camelcaramel/claude-english-coach
/plugin install english-coach@english-coach-dev
```

학습 로그는 PC 간에 동기화되지 않는다. 옮기려면
`~/.claude/plugins/data/english-coach-english-coach-dev/log.jsonl` 을 복사한다.

---

## 쓰는 법

특별히 할 게 없다. 평소대로 한국어로 프롬프팅하면 된다.

```
› 로그인 실패할 때 리트라이 로직 좀 넣어줘
```

다음 프롬프트를 보낼 때 위에 이렇게 뜬다:

```
UserPromptSubmit says:
내 프롬프트로 배우는 개발 영어

KO  로그인 실패할 때 리트라이 로직 좀 넣어줘
EN  Add retry logic for when login fails.

익힐 표현
  ▸ add ~ for when ... — ~할 때를 대비해 추가
    "add a fallback for when the cache is cold"
  ▸ retry logic — 재시도 처리
    "the retry logic should back off exponentially"
```

긴 문장은 76칸에서 접히고 이어지는 줄은 라벨 너비만큼 들여쓴다. 한글은 2칸으로
세므로 한국어 줄만 삐져나가는 일이 없다. URL 과 파일 경로는 중간에서 끊지 않는다 —
두 조각으로 갈리면 복사도 클릭도 안 되기 때문이다.

원문과 번역을 나란히 놓아 짝을 눈으로 맞출 수 있게 하고, 그 문장에서 반복해서
쓸 만한 표현을 2~3개 뽑아 한국어 뜻과 **다른** 예문을 붙인다. `~` 는 갈아끼우는
자리다. 번역문을 그대로 재탕하면 패턴이 아니라 그 문장 하나만 남기 때문에
예문은 항상 별개 문장으로 만든다.

**왜 다음 프롬프트인가** — 번역에 20~50초가 걸린다. 기다리게 하면 개발이 끊기므로
백그라운드로 돌리고 결과를 다음 턴에 보여준다. 체감 지연은 약 160ms다.

**첫 줄은 이 영어가 어느 프롬프트의 것인지 알려준다.** 방금 보낸 것이 아니라
이전 것이다. 이걸 놓치면 멀쩡한 번역을 오역으로 오해하게 된다.
제목은 `EN_COACH_TITLE` 로 바꿀 수 있다.

앞에 붙는 `UserPromptSubmit says:` 는 Claude Code 가 렌더러에 하드코딩해 둔
것이라 없앨 수 없다 (`[hookName," says: ",content]`, hookName 은 이벤트 이름
리터럴이고 훅 설정에 이름 필드가 없다). 대신 내용을 줄바꿈으로 시작해 그
접두사를 자기 줄에 떼어놓고, 블록은 제목부터 새 줄에서 시작한다.

번역이 여러 개 밀리면 오래된 것부터 한 턴에 하나씩 나오고, 첫 줄에 남은 개수가
`(+2 대기)` 처럼 붙는다.

이 표시는 **당신에게만 보인다.** Claude의 작업 컨텍스트에는 안 들어가므로
작업 품질에 영향을 주지 않는다.

### 조용히 넘어가는 경우

다음은 아무 일도 일어나지 않는다:

- 한글이 없는 프롬프트 (`refactor this to use a map`)
- 슬래시 커맨드 (`/hooks`)
- 코드 블록이 들어간 입력
- 500자 초과 / 20자 미만 (`ㅇㅋ`, `계속해`)

즉 실질적인 문장을 한국어로 쓸 때만 동작한다.

---

## 복습 — `/en-review`

```
/en-review          HTML 리포트를 만들어 브라우저로 연다
/en-review --chat   채팅 안에 요약 5줄만
```

LLM 을 부르지 않는다. 순수 집계라 즉시 끝나고 비용이 0이며 결과가 매번 같다.

리포트에 들어 있는 것:

| | |
| --- | --- |
| **플래시카드** | 한국어 뜻 → 영어 표현. 예문에서 표현을 빈칸으로 가리고, 답에는 그 표현이 나왔던 내 프롬프트를 같이 보여준다. 틀리면 1번 상자로, 맞히면 다음 상자로 — 간격이 0/1/3/7/21일로 벌어진다. 진도는 브라우저 localStorage 에 남는다 (스페이스=답 보기, 1=다시, 2=알았다) |
| **일별 학습량** | 최근 16주 히트맵 |
| **표현 빈도** | 상위 15개. 좁은 도메인 가설이 맞는지 여기서 보인다 |
| **전체 기록** | 원문·영어·표현 전부, 검색 가능 |

생성물은 `${CLAUDE_PLUGIN_DATA}/review.html` 이고 외부 리소스를 하나도 참조하지
않는 단일 파일이라 그대로 복사해 어디서든 열 수 있다.

**재사용률**은 표현 하나가 평균 몇 번 등장했는지다. 1.00 이면 한 번도 안 겹친
것이고, 올라갈수록 "개발 프롬프트 영어는 유한한 목록"이라는 SRD 의 전제가
데이터로 확인되는 것이다. 이 숫자가 몇 주 뒤에도 1에 가깝다면 전제가 틀렸거나
표현 추출이 지나치게 문장별로 특화된 것이다.

---

## 교정 — `/en`

어설픈 영어로 요청하면 교정본을 보여주고, **교정된 의도대로 작업까지 진행한다.**
영어를 못해도 안전하게 영어로 프롬프팅할 수 있게 하는 것이 목적이다.

```
/en can you extract this fetch call into a helper, and make it retry when the network fail
```

```
✎ can you extract this fetch call into a helper, and make it retry when the network fail
→ Can you extract this fetch call into a helper function and make it retry when the
  network request fails?
  · extract ~ into a helper — 코드 일부를 재사용 가능한 함수로 뽑아낼 때 쓰는 표준 패턴
  · retry when ~ fails — "네트워크가 실패하다"가 아니라 "요청이 실패하다"가 자연스럽다

(이어서 실제 작업을 진행한다)
```

교정 기록은 노출 모드와 같은 `log.jsonl` 에 `mode: "correction"` 으로 쌓이고,
`/en-review` 리포트와 플래시카드에 `✎` 표시로 함께 나온다.

**왜 훅이 아니라 커맨드인가** — SRD §5 는 영어 프롬프트를 훅이 자동으로 잡아
`additionalContext` 로 정확한 의도를 주입하는 그림이었다. 실측으로 막혔다:

- `type:"prompt"` 훅은 `systemMessage` 도 `additionalContext` 도 통과시키지 않는다.
  모델이 스스로를 "hook condition evaluator" 로 인식해 임의 출력을 거부하고,
  거부하면 `Operation stopped by hook` 으로 **사용자 프롬프트가 차단된다.**
  §1 의 절대 제약을 정면으로 위반하므로 쓸 수 없다.
- `type:"command"` 훅 + `claude -p` 는 20~50초가 걸린다. 노출은 다음 턴으로
  미룰 수 있지만 교정은 **이번 턴에** 의도가 들어가야 해서 미룰 수 없다.
- `UserPromptExpansion` 은 슬래시 커맨드 확장 때만 발화하고 출력도 block 계열뿐이다.

커맨드로 가면 메인 Claude 가 이번 턴에 어차피 답하므로 **추가 지연이 0이고,
훅이 아니라 차단 위험도 없다.** 대가는 `/en ` 을 앞에 붙이는 것 하나다.

SRD §5 의 `/en-mode` 토글은 만들지 않았다. 커맨드 자체가 모드라서 상태가 필요 없다.

---

## 변환 — `Ctrl+Alt+E` (터미널 밖)

Claude Code 밖에서는 훅도 슬래시 커맨드도 못 쓴다. 대신 전역 핫키를 쓴다.

### 설치

```powershell
cd tools\hotkey
.\install.ps1
```

시작 메뉴에 바로가기를, 시작프로그램에 데몬을 등록하고 데몬을 띄운다.
`node` 와 `claude` 가 PATH 에 있어야 한다.

```powershell
.\install.ps1 -Hotkey "CTRL+ALT+D"   # 조합 바꾸기 (Ctrl+Alt+문자 형태만 가능)
.\install.ps1 -Uninstall             # 제거
```

### 쓰는 법

1. 한국어(또는 어설픈 영어)를 **복사한다** — 드래그해서 `Ctrl+C`
2. **`Ctrl+Alt+E`** 를 누른다
3. 5초쯤 뒤 알림이 뜨면 **클립보드가 영어로 바뀌어 있다**
4. 그대로 `Ctrl+V`

```
클립보드: 이 기능을 클로드 데스크탑 채팅창에서도 쓸 수 있게 해줘
   ↓ Ctrl+Alt+E  (5992ms)
클립보드: Make this feature work in Claude Desktop chat too
```

한글이 있으면 번역하고, 없으면 교정한다. **클립보드는 핫키를 눌렀을 때만 읽는다** —
감시하지 않으므로 평소 복사하는 내용은 이 프로그램이 보지 못한다.

### 속도

| | 지연 |
| --- | --- |
| 번역만 (기본) | **4.6~7.1초** |
| + 익힐 표현 1개 (`EN_COACH_PHRASES=1`) | 15~23초 |

지연은 세션 부팅이 아니라 **출력 토큰에 비례한다.** 표현을 요구하면 모델이 길게
궁리해서 10~15초가 더 붙는다. 그래서 기본은 번역만 받는다 — `(원문, 영어)` 쌍은
그대로 적립되므로 학습 재료는 남는다.

### 안 될 때

```bash
cd tools\hotkey
node ping.js       # pong 이면 데몬 정상
cat daemon.log     # 세션 시작·요청·에러
```

데몬은 30분 놀면 스스로 종료한다. 핫키를 누르면 클라이언트가 다시 띄우므로
(첫 요청만 10초쯤 더 걸린다) 신경 쓰지 않아도 된다.

---

## statusline (선택)

하단에 누적 현황을 상시 표시한다. 비용도 지연도 0이다.

```
EN 🔥 6일 연속 · 오늘 12개 · 이번주 반복: short-circuit ×4
```

플러그인이 자동으로 등록할 수 없다 — 플러그인 `settings.json`은 `agent`와
`subagentStatusLine` 키만 지원한다. `~/.claude/settings.json`에 직접 넣어야 한다:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"$HOME/.claude/plugins/data/english-coach-english-coach-dev/bin/statusline.js\""
  }
}
```

경로가 플러그인 설치 위치가 아니라 데이터 디렉터리인 이유: 설치 경로는 업데이트마다
바뀌지만 데이터 디렉터리는 안 바뀐다. SessionStart 훅이 매 세션 최신 스크립트를
저기로 복사해 두므로, 플러그인을 업데이트해도 이 설정은 그대로 두면 된다.

### Orca를 쓰고 있다면

`statusLine` 슬롯은 하나뿐이고 Orca가 이미 쓰고 있다. 그런데 Orca의
`claude-statusline.cmd`는 stdin을 로컬 데몬으로 POST만 하고 화면에는 아무것도 안 쓴다.

그래서 `statusline.js`는 **덮어쓰지 않고 감싼다.** 받은 payload를 Orca로 그대로
통과시킨 뒤 우리 줄만 덧붙이므로 Orca UI가 계속 살아있다. 위 설정을 그냥 넣으면 된다.

---

## 학습 로그

`~/.claude/plugins/data/english-coach-english-coach-dev/`

| 파일 | 내용 |
| --- | --- |
| `log.jsonl` | 학습 로그. **플러그인 업데이트/재설치를 넘어 살아남는다** |
| `pending.jsonl` | 아직 표시 안 된 결과. 표시되면 비워진다 |
| `bin/` | statusline용 안정 경로 사본 |

한 줄에 하나씩:

```json
{"t":1786170589,"ko":"로그인 실패할 때 리트라이 로직 좀 넣어줘","en":"Add retry logic for when login fails.","key":"add ~ for when ...","note":"~할 때를 대비해 추가","phrases":[{"p":"add ~ for when ...","ko":"~할 때를 대비해 추가","ex":"add a fallback for when the cache is cold"}],"cwd":"C:/proj","mode":"exposure","ms":45287}
```

지금 쌓인 것 보기:

```bash
cat ~/.claude/plugins/data/english-coach-english-coach-dev/log.jsonl
```

이 로그를 `/en-review` 가 리포트로 만든다.

---

## 설정

`~/.claude/settings.json`의 `env`에 넣거나 셸 환경변수로:

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `EN_COACH_MODEL` | `haiku` | 번역 모델. `sonnet`으로 올리면 표현 품질이 좋아진다 |
| `EN_COACH_TIMEOUT_MS` | `150000` | 번역 자식 세션 제한시간. 넘기면 그 프롬프트는 로그에 안 남는다 |
| `EN_COACH_WIDTH` | `76` | 줄 접는 폭(칸). 터미널이 좁으면 줄인다 |
| `EN_COACH_TITLE` | `내 프롬프트로 배우는 개발 영어` | 블록 제목 |
| `EN_COACH_PHRASES` | (없음) | 핫키에서 `1` 이면 익힐 표현까지 받는다 (10~15초 추가) |
| `EN_COACH_RESET_AFTER` | `30` | 핫키 데몬이 이 횟수마다 세션을 새로 띄운다 |
| `EN_COACH_IDLE_MIN` | `30` | 핫키 데몬이 이만큼 놀면 스스로 종료한다 |
| `EN_COACH_COLOR` | (없음) | `1` 이면 ANSI 색을 넣는다. systemMessage 의 ANSI 지원은 미검증 |
| `EN_COACH_DEBUG` | (없음) | 설정 시 데이터 디렉터리에 `debug.log` 기록 |

---

## 개발 중 수정 사항 반영

마켓플레이스가 가리키는 곳은 `C:\Users\v2008\orca\projects\english-coach` 의
**master** 다. 작업 워크트리(`orca/workspaces/...`)를 고치는 것만으로는 반영되지
않는다 — Orca 가 워크트리를 정리해도 살아남게 하려고 영구 경로를 물려 뒀다.

```bash
git commit ...                                    # 작업 브랜치에
git -C ~/orca/projects/english-coach merge --ff-only <브랜치>
```

**버전을 올리지 않으면 재설치가 건너뛰어진다.** `claude plugin update` 가
`already at the latest version` 으로 넘어가서, 저장소를 고쳐도 실제로 도는 코드는
옛 버전인 채로 남는다. `plugin.json` 과 `marketplace.json` 의 `version` 을 같이 올린다.

설치될 때 `~/.claude/plugins/cache/` 로 복사되므로 저장소를 고쳐도 바로 안 먹는다.

```bash
node plugins/english-coach/test/run-tests.js                # 훅 엣지 케이스 45개
node plugins/english-coach/test/test-statusline-install.js  # statusline 경로 해석 7개
node plugins/english-coach/test/test-display-pairing.js     # 짝 맞춤·레이아웃 46개
node plugins/english-coach/test/test-review.js              # 리포트 생성 32개
node plugins/english-coach/test/test-correction.js          # 교정 적립 44개
claude plugin validate ./plugins/english-coach              # 매니페스트 검증
```

그 다음 세션 안에서:

```
/plugin marketplace update english-coach-dev
/plugin update english-coach@english-coach-dev
/reload-plugins
```

`hooks/` 변경은 `/reload-plugins` 없이는 반영되지 않는다. (SKILL.md만 즉시 반영)

---

## 끄기

플러그인 (노출·`/en`·`/en-review`):

```
/plugin              →  English Coach 선택 → disable
```

핫키:

```powershell
cd tools\hotkey
.\install.ps1 -Uninstall     # 바로가기·자동시작 제거 + 데몬 종료
```

훅 전체를 급히 막으려면 설정에 `"disableAllHooks": true`.
어느 쪽을 꺼도 학습 로그는 남는다.

문제가 생겨도 개발이 멈추지는 않는다. 이 플러그인은 어떤 경로에서도 exit 0으로
빠져나가고, `UserPromptSubmit`에서 프롬프트를 지워버리는 exit 2를 절대 반환하지 않는다.

---

## 문제 해결

**아무것도 안 보인다**
첫 프롬프트에서는 원래 안 보인다 — 표시할 이전 결과가 없기 때문이다. 두 번째 한국어
프롬프트부터 뜬다. 그래도 안 보이면 `/hooks`로 `UserPromptSubmit`에 english-coach
훅 2개가 등록됐는지 확인한다.

**로그가 안 쌓인다**

```bash
EN_COACH_DEBUG=1 claude
cat ~/.claude/plugins/data/english-coach-english-coach-dev/debug.log
```

`skip: <사유>`가 찍혀 있으면 스킵 조건에 걸린 것이다. 훅 자체의 stderr는 exit 0일 때
디버그 로그로만 가므로 `claude --debug-file /tmp/cc-debug.log`로 따로 봐야 한다.

**너무 느리다**
플러그인의 번역은 백그라운드라 체감 지연에 영향을 주지 않는다. 느리다고 느껴지면
다른 원인이다.

**핫키를 눌러도 아무 일이 없다**
바로가기가 시작 메뉴에 있어야 Windows 가 핫키를 등록한다. 다른 프로그램이 같은
조합을 선점했을 수도 있다 — `.\install.ps1 -Hotkey "CTRL+ALT+D"` 로 바꿔본다.
`node ping.js` 가 `pong` 을 돌려주는지, `daemon.log` 에 에러가 있는지 확인한다.

**핫키를 눌렀는데 클립보드가 그대로다**
실패하면 토스트로 알리고 클립보드는 건드리지 않는다. 알림이 없었다면 데몬이
죽어 있을 수 있다 — 다시 누르면 클라이언트가 띄운다 (첫 요청만 10초쯤 더 걸린다).

---

## 현재 범위

Phase 1(노출·적립), Phase 2(복습), Phase 3(교정)까지 구현됐고,
터미널 밖에서 쓰는 핫키 도구가 프로토타입으로 붙어 있다.

SRD §7 대로 제외된 것: MCP `Elicitation` 퀴즈, 공개 마켓플레이스 배포,
다국어 지원, `type:"agent"` 훅.

핫키 도구는 Windows 전용이고 트레이 아이콘이 없다. 계속 쓰게 되면 Tauri 로
포팅해 exe 로 배포할 수 있다 — 로직이 작아서 옮기는 비용이 낮다.

방향은 1주일 실사용 결과가 정한다. 확인할 것:

- [ ] 표시를 **실제로 읽었는가**, 아니면 3일 만에 눈이 미끄러졌는가
- [ ] 같은 표현이 몇 번 반복되는가 (좁은 도메인 가설 검증 — 현재 재사용률 1.04)
- [ ] 다음 턴에 보여주는 방식이 즉시 보여주는 것보다 나은가
- [ ] 핫키를 눌러 5초 기다렸다 붙여넣는 걸 **실제로 하게 되는가**
