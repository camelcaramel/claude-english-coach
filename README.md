# english-coach 사용법

한국어로 프롬프팅하면 개발용 영어 표현을 옆에서 알려주고 자동으로 적립한다.
별도 API 키를 쓰지 않고 Claude Code 세션 인증 안에서 동작한다.

플러그인 내부 설계는 [plugins/english-coach/README.md](plugins/english-coach/README.md),
검증 근거는 [srd.md](srd.md) 참고.

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

마켓플레이스 소스가 이 로컬 경로라서 그대로는 안 된다. 저장소를 GitHub에 올린 뒤:

```
/plugin marketplace add <owner>/<repo>
/plugin install english-coach@english-coach-dev
```

---

## 쓰는 법

특별히 할 게 없다. 평소대로 한국어로 프롬프팅하면 된다.

```
› 로그인 실패할 때 리트라이 로직 좀 넣어줘
```

다음 프롬프트를 보낼 때 위에 이렇게 뜬다:

```
↩ 직전 프롬프트

KO  로그인 실패할 때 리트라이 로직 좀 넣어줘
EN  Add retry logic for when login fails.

익힐 표현
  1. add ~ for when ...  —  ~할 때를 대비해 추가
     "add a fallback for when the cache is cold"
  2. retry logic  —  재시도 처리
     "the retry logic should back off exponentially"
```

원문과 번역을 나란히 놓아 짝을 눈으로 맞출 수 있게 하고, 그 문장에서 반복해서
쓸 만한 표현을 2~3개 뽑아 한국어 뜻과 **다른** 예문을 붙인다. `~` 는 갈아끼우는
자리다. 번역문을 그대로 재탕하면 패턴이 아니라 그 문장 하나만 남기 때문에
예문은 항상 별개 문장으로 만든다.

**왜 다음 프롬프트인가** — 번역에 20~50초가 걸린다. 기다리게 하면 개발이 끊기므로
백그라운드로 돌리고 결과를 다음 턴에 보여준다. 체감 지연은 약 160ms다.

**첫 줄 `↩ 직전 프롬프트` 는 이 영어가 어느 프롬프트의 것인지 알려준다.**
방금 보낸 것이 아니라 이전 것이다. 이걸 놓치면 멀쩡한 번역을 오역으로 오해하게 된다.

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
{"t":1786170589,"ko":"로그인 실패할 때 리트라이 로직 좀 넣어줘","en":"Add retry logic for login failures","key":"on failure","note":"에러 처리 시 사용하는 패턴","cwd":"C:/proj","mode":"exposure","ms":17560}
```

지금 쌓인 것 보기:

```bash
cat ~/.claude/plugins/data/english-coach-english-coach-dev/log.jsonl
```

이 로그가 Phase 2 복습(`/en-review`)의 재료가 된다. 아직 커맨드는 없지만
**로그는 지금부터 쌓이고 있다.**

---

## 설정

`~/.claude/settings.json`의 `env`에 넣거나 셸 환경변수로:

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `EN_COACH_MODEL` | `haiku` | 번역 모델. `sonnet`으로 올리면 표현 품질이 좋아진다 |
| `EN_COACH_TIMEOUT_MS` | `150000` | 번역 자식 세션 제한시간. 넘기면 그 프롬프트는 로그에 안 남는다 |
| `EN_COACH_DEBUG` | (없음) | 설정 시 데이터 디렉터리에 `debug.log` 기록 |

---

## 개발 중 수정 사항 반영

저장소를 고쳐도 바로 안 먹는다. 설치될 때 `~/.claude/plugins/cache/`로 복사되기 때문이다.

```bash
node plugins/english-coach/test/run-tests.js                # 훅 엣지 케이스 45개
node plugins/english-coach/test/test-statusline-install.js  # statusline 경로 해석 7개
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

```
/plugin              →  English Coach 선택 → disable
```

훅 전체를 급히 막으려면 설정에 `"disableAllHooks": true`.

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
번역은 백그라운드라 체감 지연에 영향을 주지 않는다. 느리다고 느껴지면 다른 원인이다.

---

## 현재 범위

Phase 1(노출·적립)까지 구현됐다. 아직 없는 것:

- `/en-review` 복습 커맨드와 HTML 리포트 (Phase 2)
- `/en-mode` 교정 모드 — 어설픈 영어로 써도 교정본을 보여주고 Claude에게는
  정확한 의도를 전달 (Phase 3, 이게 최종 목표다)

Phase 2·3의 방향은 1주일 실사용 결과가 정한다. 특히 확인할 것:

- [ ] 표시를 **실제로 읽었는가**, 아니면 3일 만에 눈이 미끄러졌는가
- [ ] 같은 표현이 몇 번 반복되는가 (좁은 도메인 가설 검증)
- [ ] 다음 턴에 보여주는 방식이 즉시 보여주는 것보다 나은가
