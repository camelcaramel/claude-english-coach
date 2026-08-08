---
name: en-review
description: 지금까지 쌓인 개발 영어 학습 로그로 복습 리포트를 만든다. HTML 리포트(히트맵·표현 빈도·플래시카드)를 브라우저로 열거나, --chat 으로 채팅 안에 요약만 출력한다.
argument-hint: "[--chat]"
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/review.js":*)
---

`$ARGUMENTS` 에 `--chat` 이 있으면:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/review.js" --chat
```

없으면:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/review.js"
```

스크립트 출력을 그대로 사용자에게 보여준다. 집계는 스크립트가 전부 끝내므로
로그 파일을 직접 읽거나 숫자를 다시 세지 않는다.

출력에 반복된 표현이 있으면 한 문장만 덧붙인다 — 어떤 표현이 굳어지고 있는지,
아직 표본이 부족한지. 그 외에는 해설하지 않는다.
