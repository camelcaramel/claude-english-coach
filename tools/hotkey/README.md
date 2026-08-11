# en-coach 핫키 (프로토타입)

터미널 밖 — Claude Desktop 채팅, 브라우저 검색창, Slack — 어디서든 한국어를
개발 영어로 바꿔 붙여넣는다.

한국어를 복사하고 **Ctrl+Alt+E**. 알림이 뜨면 클립보드가 영어로 바뀌어 있다.
영어를 복사하고 누르면 교정본이 나온다.

## 설치

```powershell
.\install.ps1                       # 기본 핫키 Ctrl+Alt+E
.\install.ps1 -Hotkey "CTRL+ALT+D"  # 다른 조합
.\install.ps1 -Uninstall
```

`node` 와 `claude` 가 PATH 에 있어야 한다. 별도 API 키는 쓰지 않는다 —
Claude Code 세션 인증을 그대로 쓴다.

## 왜 이렇게 만들었나

```
Ctrl+Alt+E → .lnk → run-hidden.vbs → client.js ──파이프──▶ daemon.js
                                                              ↓
                              클립보드 교체 + 토스트 + log.jsonl 적립
```

**전역 핫키를 Windows 가 공짜로 준다.** 바로가기(.lnk)의 Hotkey 속성이 그것이다.
AutoHotkey 도, Electron 의 `globalShortcut` 도, 네이티브 모듈도 쓰지 않는다.
클립보드와 알림은 PowerShell 을 거친다. **npm 패키지가 0개다.**

데몬이 warm `claude` 세션을 물고 있다. 매번 새로 띄우면 세션 부팅에만 10~20초가
더 붙는다.

클립보드는 **핫키를 눌렀을 때만** 읽는다. 감시하지 않는다 — 상주 프로그램이
복사한 것을 전부 들여다보는 물건은 만들 것이 못 된다.

## 속도

실측(haiku, `--effort low`):

| | 지연 |
| --- | --- |
| 번역만 (기본) | **4.6~7.1초** |
| + 익힐 표현 1개 | 15~23초 |
| + 표현 1~3개 | 최대 43초 |

지연은 세션 부팅이 아니라 **출력 토큰에 비례한다.** 표현을 1~3개 요구하면 모델이
3300토큰까지 궁리한다. 그래서 기본은 번역만 받는다. `(ko, en)` 쌍은 그대로
적립되므로 학습 재료는 남는다.

표현까지 한 번에 받으려면 `EN_COACH_PHRASES=1`.

## 설정

| 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `EN_COACH_PHRASES` | (없음) | `1` 이면 익힐 표현까지 받는다 (10~15초 추가) |
| `EN_COACH_MODEL` | `haiku` | 번역 모델 |
| `EN_COACH_RESET_AFTER` | `30` | 이 횟수마다 세션을 새로 띄운다 |
| `EN_COACH_IDLE_MIN` | `30` | 이만큼 놀면 데몬이 스스로 종료한다 |

## 적립

플러그인과 **같은** `log.jsonl` 에 `cwd: "hotkey"` 로 쌓인다. 터미널에서 쓴 것과
여기서 쓴 것이 `/en-review` 한 화면에 모인다.

## 확인

```bash
node ping.js      # 데몬이 살아있나
cat daemon.log    # 세션 시작·요청·에러 기록
```

## 아직 프로토타입이다

- 트레이 아이콘이 없다. 데몬은 유휴 30분이면 스스로 죽고, 핫키를 누르면
  클라이언트가 다시 띄운다.
- `.lnk` 핫키는 `Ctrl+Alt+문자` 형태만 된다. Windows 제약이다.
- 실패하면 토스트로 알리고 클립보드는 건드리지 않는다.
- Windows 전용이다.
