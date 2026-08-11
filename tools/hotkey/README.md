# en-coach 핫키 (프로토타입)

터미널 밖 — Claude Desktop 채팅, 브라우저 검색창, Slack — 어디서든 한국어를
개발 영어로 바꿔 붙여넣는다.

## 쓰는 법

1. 한국어(또는 어설픈 영어)를 **복사한다** (`Ctrl+C`)
2. **`Ctrl+Alt+E`**
3. 5초쯤 뒤 알림이 뜨면 **클립보드가 영어로 바뀌어 있다**
4. 그대로 `Ctrl+V`

실제 기록:

```
이 기능을 클로드 데스크탑 채팅창에서도 쓸 수 있게 해줘
  → Make this feature work in Claude Desktop chat too        5992ms

검색어를 자동완성으로 추천해주는 기능 추가해줘
  → Add search term autocomplete suggestions                 6229ms

이 부분은 나중에 리팩터링하자
  → Refactor this later                                      4154ms
```

한글이 있으면 번역하고, 없으면 교정한다.

## 설치

```powershell
.\install.ps1                       # 기본 핫키 Ctrl+Alt+E
.\install.ps1 -Hotkey "CTRL+ALT+D"  # 다른 조합 (Ctrl+Alt+문자 형태만 가능)
.\install.ps1 -Uninstall
```

시작 메뉴에 바로가기를, 시작프로그램에 데몬을 등록하고 데몬을 띄운다.
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

## 안 될 때

```bash
node ping.js      # pong 이면 데몬 정상
cat daemon.log    # 세션 시작·요청·에러 기록
```

**핫키를 눌러도 아무 일이 없다** — 바로가기가 시작 메뉴에 있어야 Windows 가
핫키를 등록한다. 다른 프로그램이 같은 조합을 선점했을 수도 있으니
`-Hotkey "CTRL+ALT+D"` 로 바꿔본다.

**클립보드가 그대로다** — 실패하면 토스트로 알리고 클립보드는 건드리지 않는다.
알림도 없었다면 데몬이 죽어 있을 수 있다. 다시 누르면 클라이언트가 띄운다
(첫 요청만 10초쯤 더 걸린다).

**`유효하지 않은 문자입니다 (800A0408)` 대화상자가 뜬다** — `run-hidden.vbs` 에
BOM 이 붙은 것이다. wscript 가 BOM 을 스크립트 본문의 첫 글자로 읽는다.
`.\install.ps1` 을 다시 돌리면 고쳐진다. 설치 스크립트가 쓰고 나서 BOM 과
비 ASCII 바이트를 검사하므로 이제는 조용히 넘어가지 않는다.

**한글이 깨진다** — PowerShell 5.1 은 BOM 없는 UTF-8 `.ps1` 을 CP949 로 읽는다.
`install.ps1` 과 `toast.ps1` 에는 BOM 이 **있어야** 하고, `run-hidden.vbs` 에는
**없어야** 한다. 같은 인코딩 문제인데 정반대 처방이라 반드시 다시 걸린다.

## 아직 프로토타입이다

- 트레이 아이콘이 없다. 데몬은 유휴 30분이면 스스로 죽고, 핫키를 누르면
  클라이언트가 다시 띄운다.
- `.lnk` 핫키는 `Ctrl+Alt+문자` 형태만 된다. Windows 제약이다.
- 실패하면 토스트로 알리고 클립보드는 건드리지 않는다.
- Windows 전용이다.
