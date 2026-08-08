# english-coach

한국어로 프롬프팅하면서 개발용 영어 표현을 노출·적립한다.
별도 API 키를 쓰지 않고 Claude Code 세션 인증 안에서 동작한다.

## 어떻게 동작하나 — 지연 노출

Phase 0 실측에서 `claude -p` 헤드리스 호출은 훅 안에서 종단 **17.3초**가 걸렸다
(CLI 기동은 192ms뿐이고 나머지는 세션 부트스트랩 + 모델 왕복이라 모델을 낮춰도 안 줄어든다).
2초 예산의 8배라 동기로는 쓸 수 없다.

그래서 **번역과 표시를 분리**했다.

```
프롬프트 제출
   ├─ display.js    동기 ~160ms  이전 턴 결과를 systemMessage 로 표시
   └─ translate.js  async 17초   백그라운드 번역 → log.jsonl + pending.jsonl
                                 (아무도 기다리지 않는다)
```

방금 쓴 문장의 영어를 **다음 프롬프트에서** 보게 된다. 체감 지연은 0이고,
즉시 보는 것보다 한 박자 뒤에 보는 쪽이 오히려 간격 반복에 가깝다.

표시는 사용자에게만 보인다. Phase 0 P6 에서 Claude 가 `[CH-SYS]` 마커를
보지 못하는 것을 실측으로 확인했다 — 작업 컨텍스트가 오염되지 않는다.

```
EN: Add retry logic for login failures
→ on failure : 에러 처리 시 사용하는 패턴
```

## 설치

```
/plugin marketplace add .
/plugin install english-coach@english-coach-dev
/reload-plugins
```

`hooks/`, `.mcp.json`, `agents/` 변경은 세션에 즉시 반영되지 않는다.
`/reload-plugins` 또는 재시작이 필요하다.

## statusline (선택)

플러그인은 `statusLine` 을 직접 등록할 수 없다 — 플러그인 `settings.json` 은
`agent` 와 `subagentStatusLine` 키만 지원한다. 쓰려면 `~/.claude/settings.json` 에
직접 넣어야 한다.

`${CLAUDE_PLUGIN_ROOT}` 는 업데이트마다 경로가 바뀌므로 거기를 가리키면 안 된다.
대신 SessionStart 훅이 매 세션 스크립트를 안정 경로로 복사해 둔다:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"$HOME/.claude/plugins/data/english-coach-english-coach-dev/bin/statusline.js\""
  }
}
```

출력:

```
EN 🔥 6일 연속 · 오늘 12개 · 이번주 반복: short-circuit ×4
```

### Orca 사용자

`~/.claude/settings.json` 의 `statusLine` 슬롯은 하나뿐이고 Orca 가 이미 쓰고 있다.
하지만 Orca 의 `claude-statusline.cmd` 는 stdin 페이로드를 로컬 데몬으로 POST 만 하고
stdout 에는 아무것도 쓰지 않는다 — 슬롯은 점유돼 있지만 화면은 비어 있다.

`statusline.js` 는 이걸 이용해 **덮어쓰지 않고 감싼다**. 받은 payload 를 Orca cmd 로
그대로 통과시킨 뒤 우리 줄만 덧붙이므로 Orca UI 가 계속 살아있다. Orca 쪽이 실패하거나
사라져도 우리 줄은 반드시 찍힌다.

## 설정

| 환경변수 | 기본값 | 용도 |
| --- | --- | --- |
| `EN_COACH_MODEL` | `haiku` | 번역에 쓸 모델 |
| `EN_COACH_DEBUG` | (없음) | 설정 시 `debug.log` 기록 |
| `EN_COACH_CHILD` | (자동) | 무한 루프 가드. 직접 설정하지 말 것 |

## 스킵 조건

다음은 훅이 아무것도 하지 않고 즉시 통과시킨다 (SRD §3.5):

- 한글이 없는 프롬프트
- 슬래시 커맨드로 시작하는 입력
- 코드 블록 포함, 또는 500자 초과
- 20자 미만의 단답 (`ㅇㅋ`, `계속해`)

## 데이터

`${CLAUDE_PLUGIN_DATA}` = `~/.claude/plugins/data/{plugin-id}/` — 플러그인 업데이트를
넘어 살아남는다. 개발 중(미설치)에는 `~/.claude/en-coach/` 로 떨어진다.

| 파일 | 내용 |
| --- | --- |
| `log.jsonl` | 학습 로그 (영구) |
| `pending.jsonl` | 아직 표시 안 된 결과. 표시되면 비워진다 |
| `state.json` | `{"mode":"exposure"}` — Phase 3 에서 토글 |
| `bin/` | statusline 용 안정 경로 사본 |

로그 스키마 (SRD §3.4):

```json
{"t":1754630400000,"ko":"원문","en":"영어 버전","key":"핵심 표현","note":"짧은 한국어 설명","cwd":"/path","mode":"exposure","ms":17560}
```

## 테스트

```bash
node test/run-tests.js               # 훅 스크립트 엣지 케이스 45개
node test/test-statusline-install.js # 설치된 statusline 사본의 경로 해석 7개
```

둘 다 격리된 샌드박스 데이터 디렉터리에서 돌기 때문에 실제 학습 로그를 건드리지 않는다.
`stdout 이 JSON 하나이거나 완전히 비어있는가`, `어떤 입력에도 exit 0 인가`,
스킵 조건, 특수문자 이스케이프, 깨진 로그, 권한 없는 경로까지 검사한다.

`UserPromptSubmit` 에서 exit 2 는 프롬프트를 아예 지워버린다. 이 플러그인은
어떤 경로에서도 2를 반환하지 않는다.

## 안 되면

`~/.claude/settings.json` 또는 프로젝트 설정에 `"disableAllHooks": true`.
훅의 stderr 는 exit 0 일 때 디버그 로그로만 가므로:

```bash
claude --debug-file /tmp/cc-debug.log
EN_COACH_DEBUG=1 claude   # 플러그인 자체 로그
```

## 아직 없는 것

- `/en-review` 복습 커맨드 (Phase 2)
- `/en-mode` 교정 모드 토글 (Phase 3)
