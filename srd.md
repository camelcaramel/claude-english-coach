# english-coach 플러그인 개발 요청서

Claude Code에게 그대로 붙여넣는 용도의 스펙 문서입니다. **한 번에 다 만들라고 시키지 마세요.** Phase 0 → 1 → 2 순서로 끊어서 요청하는 것이 핵심입니다.

---

## 0. 배경과 목표

한국인 개발자가 Claude Code에 한국어로 프롬프팅을 한다. 이 사람은 영어 실력이 부족하지만, 어차피 매일 하는 프롬프팅 과정에서 개발용 영어를 자연스럽게 익히고 싶어 한다.

개발 프롬프트 영어는 도메인이 매우 좁다는 점이 이 프로젝트의 전제다. (`refactor A to use B`, `extract this into a helper`, `add a guard for the case where...`, `this should short-circuit when...`, `wire it up to...`, `stub out the API call` 등 100개 남짓한 패턴이 실무의 대부분을 커버한다.) 따라서 목표는 "영어 교육"이 아니라 **유한한 표현 목록을 반복 노출로 정복하는 것**이다.

### 학습 설계 3단계


| 단계  | 이름              | 하는 일                                            |
| --- | --------------- | ----------------------------------------------- |
| 1   | 노출 (exposure)   | 한국어 프롬프트 → 자연스러운 영어 버전 + 핵심 표현 1개를 화면에 표시       |
| 2   | 축적/복습           | 모든 (한국어, 영어) 쌍을 로컬에 적립하고 주기적으로 복습               |
| 3   | 생산 (production) | 사용자가 어설픈 영어로 쓰면 교정본을 보여주고, Claude에게는 정확한 의도를 전달 |


3단계가 진짜 목표다. 1·2단계는 거기로 가기 위한 온보딩이다.

---

## 1. 절대 제약

- **별도 API 키를 쓰지 않는다.** `ANTHROPIC_API_KEY`를 요구하는 구현은 채택 불가. Claude Code 세션 인증 안에서 해결해야 한다.
- **훅이 실패해도 절대 작업을 막지 않는다.** 어떤 예외가 나도 조용히 `exit 0`. 영어 공부하려다 개발이 멈추면 이틀 만에 삭제된다.
- **체감 지연은 프롬프트당 2초 이내.** 넘으면 샘플링(N개마다 1번)이나 async로 전환한다.
- **학습 로그는 플러그인 업데이트를 넘어 살아남아야 한다.** `${CLAUDE_PLUGIN_DATA}`(영속 데이터 디렉터리)에 저장한다. `${CLAUDE_PLUGIN_ROOT}`는 업데이트마다 경로가 바뀌므로 절대 여기에 데이터를 두지 않는다.

---

## 2. Phase 0 — 검증 (여기부터 시작)

구현 전에 다음 3가지를 실험으로 확인한다. 결과에 따라 아키텍처가 갈리므로 **Phase 0을 건너뛰고 구현에 들어가지 말 것.**

### 검증 1 — `type: "prompt"` 훅이 자유 텍스트를 `systemMessage`로 통과시키는가 (최우선)

공식 문서는 프롬프트 훅을 "모델이 JSON으로 yes/no 결정을 반환한다"고 설명한다. 즉 설계 의도는 판단용이며, 자유 텍스트를 `systemMessage`로 흘려보내는 것은 문서에 명시된 용법이 아니다. 다른 훅과 JSON 출력 스키마를 공유하므로 통과할 가능성이 높지만, 반드시 실측해야 한다.

테스트용 `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "prompt",
            "timeout": 20,
            "statusMessage": "영어 표현 뽑는 중",
            "prompt": "Input JSON: $ARGUMENTS\nIf .prompt contains no Hangul, return {}.\nOtherwise rewrite .prompt as the English a native engineer would type to a coding agent.\nReturn ONLY: {\"systemMessage\": \"EN: <english>\\n→ <one phrase worth memorizing>\"}"
          }
        ]
      }
    ]
  }
}

```

확인 항목:

- `systemMessage`가 실제로 화면에 렌더링되는가
- `\n` 줄바꿈이 살아있는가, 길이는 어디서 잘리는가
- Claude의 응답에 이 영어 문장이 영향을 주지는 않는가 (오염 여부)
- 왕복 지연이 몇 초인가

**실패 시 폴백:** `type: "command"` 훅에서 `claude -p`를 헤드리스로 호출한다. 단 자식 세션이 같은 훅을 다시 실행해 **무한 루프**가 나므로 환경변수 가드가 필수다. (예: 훅 스크립트 시작부에서 `if (process.env.EN_COACH_CHILD) process.exit(0)`, 자식 호출 시 `EN_COACH_CHILD=1` 주입.) 지연이 3~5초로 늘어나므로 이 경우 샘플링을 도입한다.

### 검증 2 — statusline 입력 스키마와 ANSI 지원 범위

statusline은 훅이 아니라 별도 설정(`statusLine`)이며 하단에 상시 표시되는 1줄이다. LLM 호출 없이 로컬 로그만 읽으므로 비용 0, 지연 0이다. **statusline 공식 문서를 먼저 읽고** 다음을 확인한다:

- 스크립트가 stdin으로 받는 JSON의 필드
- 출력이 첫 줄만 쓰이는지, ANSI 색상이 통하는지
- 폭이 좁을 때 잘리는 방식

### 검증 3 — 체감 지연 수용 가능성

검증 1의 지연 실측치를 놓고 사용자가 견딜 수 있는지 판단한다. 못 견디면 1단계를 "매 프롬프트"가 아니라 "N개마다 1번"으로 바꾼다. 어차피 매번 보여줘도 사람은 안 읽는다. 샘플링이 오히려 학습 효과가 높을 수 있다.

---

## 3. Phase 1 — MVP 구현

Phase 0에서 검증 1이 통과했다는 전제.

### 3.1 파일 구조

```
english-coach/
├── .claude-plugin/plugin.json
├── hooks/hooks.json              # UserPromptSubmit
├── scripts/
│   ├── log.js                    # JSONL 적립
│   └── statusline.js             # 하단 배지
├── commands/
│   └── en-review.md              # 복습 (Phase 2)
└── README.md

```

플러그인 스크립트는 `${CLAUDE_PLUGIN_ROOT}`로 참조하고, 경로 플레이스홀더를 쓸 때는 exec form(`command` + `args`)을 쓴다. shell form은 따옴표 처리가 까다롭다.

### 3.2 출력 채널 분리 (핵심 설계)


| 채널                                     | 사용자에게 보임 | Claude에게 보임 | 용도                      |
| -------------------------------------- | -------- | ----------- | ----------------------- |
| `systemMessage`                        | O        | X           | **영어 예시를 여기에 넣는다**      |
| 평문 stdout                              | O        | O           | 쓰지 않는다 (Claude 컨텍스트 오염) |
| `hookSpecificOutput.additionalContext` | X        | O           | Phase 3 교정 모드용          |
| statusline                             | O (상시)   | X           | 연속일·누적 개수·이번 주 표현       |


`systemMessage`는 사용자에게만 보이므로 Claude의 작업 컨텍스트를 오염시키지 않는다. 반면 `UserPromptSubmit`의 평문 stdout은 트랜스크립트에 표시되면서 **동시에 Claude의 컨텍스트로도 들어간다.**

### 3.3 표시 포맷

정확히 2줄. 3줄을 넘기면 사용자가 읽지 않는다.

```
EN: Add retry logic for when login fails.
→ retry logic for when ~ : 실패 조건 붙일 때

```

문장 전체보다 **핵심 표현 1개**를 강조하는 것이 요구사항이다.

### 3.4 로그 스키마

`${CLAUDE_PLUGIN_DATA}/log.jsonl`, 한 줄에 하나:

```json
{"t": 1754630400000, "ko": "원문", "en": "영어 버전", "key": "핵심 표현", "note": "짧은 한국어 설명", "cwd": "/path/to/project", "mode": "exposure"}

```

### 3.5 스킵 조건

다음은 훅이 아무것도 하지 않고 즉시 통과시킨다:

- 한글이 없는 프롬프트 (`/[가-힣]/` 미매치)
- 슬래시 커맨드로 시작하는 입력
- 코드 블록이 포함된 입력, 또는 500자 초과 입력
- 20자 미만의 단답 (`ㅇㅋ`, `계속해` 등)

---

## 4. Phase 2 — 축적과 복습

`/en-review` 슬래시 커맨드. 두 가지 모드:

- **기본**: `log.jsonl`을 읽어 `${CLAUDE_PLUGIN_DATA}/review.html`을 생성하고 브라우저로 연다 (`open` / `xdg-open` / `start`). 브라우저 안에서는 제약이 없으므로 히트맵, 표현별 빈도, 플래시카드, 간격 반복 스케줄까지 자유롭게 만든다.
- `--chat`: 채팅 안에 요약 5줄만 출력.

이 커맨드는 커맨드 마크다운이 메인 Claude에게 작업을 지시하는 형태이므로 **별도 LLM 호출이 필요 없다.** 커맨드 파일에는 "로그를 읽고 HTML을 생성한 뒤 열어라"라고 쓴다.

statusline은 같은 `log.jsonl`을 읽어 `🔥 6일 연속 · 오늘 12개 · 이번주 반복: short-circuit` 형태로 표시한다.

---

## 5. Phase 3 — 교정 모드 (최종 목표)

`/en-mode` 로 `exposure` ⇄ `correction` 토글. 상태는 `${CLAUDE_PLUGIN_DATA}/state.json`에 저장.

correction 모드에서 사용자가 어설픈 영어로 프롬프트를 쓰면, 훅 하나가 출력을 두 방향으로 나눈다:

```json
{
  "systemMessage": "✎ add retry logic → Add retry logic for the login failure case.\n   → 'for the ~ case' 로 조건 붙이기",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "The user is a Korean developer practicing English. Their intended request: <교정된 영어>"
  }
}

```

사용자는 교정본만 보고, Claude는 정확한 의도를 받는다. 영어를 못해도 안전하게 영어로 프롬프팅할 수 있게 되는 것이 이 기능의 목적이다.

**주의사항 2가지:**

1. `UserPromptSubmit`은 프롬프트 자체를 교체할 수 없다. 옆에 `additionalContext`를 주입하는 것만 가능하다. 따라서 원문 broken English도 Claude에게 함께 전달된다.
2. `additionalContext`는 **명령형이 아니라 사실 서술형**으로 써야 한다. 시스템 명령처럼 쓰면 프롬프트 인젝션 방어가 걸려서, Claude가 그 텍스트를 컨텍스트로 쓰는 대신 사용자에게 그대로 노출해버린다.

---

## 6. 테스트 방법

### 6.1 훅 스크립트 단독 테스트 (Claude Code 없이)

가장 빠른 피드백 루프. 먼저 이걸로 로직을 다 잡는다.

```bash
echo '{"session_id":"test","cwd":"/tmp","hook_event_name":"UserPromptSubmit","prompt":"로그인 실패할 때 리트라이 로직 좀 넣어줘"}' \
  | node scripts/log.js

```

확인: stdout이 **오직 JSON 객체 하나**여야 한다. 셸 프로파일이 뭔가를 출력하면 JSON 파싱이 깨진다.

엣지 케이스 입력 세트를 만들어 전부 돌린다:

- 한글 없는 영어 프롬프트 → 빈 출력
- 슬래시 커맨드 → 빈 출력
- 코드 블록 포함 → 빈 출력
- 5000자 초과 → 빈 출력
- 따옴표·역슬래시·이모지 포함 → JSON 이스케이프 정상
- 로그 파일 권한 없음 / 디렉터리 없음 → 크래시 없이 exit 0

### 6.2 격리된 테스트 프로젝트에서 확인

**절대** `~/.claude/settings.json`**에 바로 붙이지 말 것.** 실서비스 개발이 마비된다.

```bash
mkdir /tmp/en-coach-test && cd /tmp/en-coach-test
# .claude/settings.json 에 훅 등록
claude

```

- `/hooks` 로 훅이 실제로 등록됐는지, 어느 설정 파일에서 왔는지 확인
- 한국어 프롬프트를 몇 개 던져보고 `systemMessage` 렌더링 확인
- 문제가 생기면 설정에 `"disableAllHooks": true` 를 넣어 즉시 전체 차단

### 6.3 디버깅

훅의 stderr는 exit 0일 때 디버그 로그로만 간다. 트랜스크립트에도 안 뜨고 Claude도 못 본다. 따라서 디버그 로깅을 켜야 보인다.

```bash
claude --debug-file /tmp/cc-debug.log
tail -f /tmp/cc-debug.log

```

exit code 규칙 주의: 대부분의 이벤트에서 **exit 1은 논블로킹 에러**로 취급되어 그냥 진행되고, **exit 2가 차단**이다. `UserPromptSubmit`에서 exit 2는 프롬프트를 아예 지워버리므로 이 플러그인에서는 절대 2를 반환하면 안 된다.

### 6.4 플러그인으로 패키징 후 로컬 설치

```bash
# 마켓플레이스 저장소 루트에 .claude-plugin/marketplace.json 배치
/plugin marketplace add .
/plugin install english-coach@<marketplace-name>

```

플러그인의 `hooks/`, `.mcp.json`, `agents/` 변경은 세션에 즉시 반영되지 않는다. `/reload-plugins` 또는 Claude Code 재시작이 필요하다. ([SKILL.md](http://SKILL.md) 변경만 즉시 반영)

### 6.5 실사용 검증 (가장 중요)

1주일간 실제 개발에 쓰면서 다음을 관찰한다:

- [ ] 지연 때문에 짜증나서 끄고 싶어졌는가
- [ ] `systemMessage`를 **실제로 읽었는가**, 아니면 3일 만에 눈이 미끄러졌는가
- [ ] 로그에 같은 표현이 몇 번 반복되는가 (좁은 도메인 가설 검증)
- [ ] Claude의 응답 품질이 훅 때문에 나빠지지 않았는가

읽지 않게 됐다면 그건 구현 문제가 아니라 설계 문제다. 그 피드백이 Phase 2·3의 방향을 정한다. **처음부터 완성품을 만들려 하지 말 것.**

---

## 7. 이번 범위에서 제외

- MCP 서버 기반 `Elicitation` 퀴즈 다이얼로그 (네이티브 입력 폼은 가능하지만 난이도가 급상승. Phase 4)
- 공개 마켓플레이스 배포
- 다국어 지원 (한국어 → 영어만)
- `type: "agent"` 훅 (문서상 실험적이고 기본 타임아웃 60초로 매 프롬프트용으로는 과하다)

---

## 8. Claude Code에게 보낼 첫 메시지 (예시)

> 이 문서([`english-coach-spec.md`](http://english-coach-spec.md))를 읽고 **Phase 0만** 진행해줘. 검증 1(prompt 훅이 systemMessage로 자유 텍스트를 통과시키는지)을 확인할 수 있는 최소 테스트 세트를 `/tmp/en-coach-test`에 만들고, 내가 직접 돌려볼 수 있게 실행 방법과 무엇을 관찰해야 하는지 알려줘. 아직 플러그인 구조는 만들지 마.

