#!/usr/bin/env node
'use strict';
/**
 * 표시 훅 — 동기, ~10ms.
 *
 * 번역을 하지 않는다. 이전 턴에 translate.js 가 쌓아둔 결과를 꺼내서
 * systemMessage 로 내보내기만 한다. LLM 호출이 없으므로 지연이 없다.
 *
 * 이게 "지연 노출(deferred exposure)" 설계의 핵심이다.
 * 번역에 10~17초가 걸려도 사용자는 한 번도 기다리지 않는다.
 * 방금 쓴 문장의 영어를 다음 프롬프트에서 보게 되는데, 즉시 보는 것보다
 * 한 박자 뒤에 보는 쪽이 오히려 간격 반복에 가깝다.
 *
 * systemMessage 는 사용자에게만 보이고 Claude 컨텍스트에는 안 들어간다.
 * (Phase 0 P6 에서 실측 확인: Claude 는 [CH-SYS] 마커를 보지 못했다.)
 */

const fs = require('fs');
const L = require('./lib');

function main() {
  if (L.isChild()) L.passthrough();

  L.readStdin(); // stdin 을 비워준다. 안 그러면 파이프가 막힐 수 있다

  const pending = L.readJsonl(L.P.pending());
  if (!pending.length) L.passthrough();

  // 가장 최근 것 하나만 보여준다. 밀린 게 여러 개여도 3줄 넘기면 안 읽는다.
  const item = pending[pending.length - 1];

  try {
    fs.writeFileSync(L.P.pending(), ''); // 소비했으므로 비운다
  } catch (e) {
    L.debug(`pending clear failed: ${e.message}`);
  }

  if (!item || !item.en) L.passthrough();

  const key = item.key ? `${item.key}` : '';
  const note = item.note ? ` : ${item.note}` : '';

  // SRD §3.3 — 정확히 2줄. 3줄을 넘기면 읽지 않는다.
  const msg = `EN: ${item.en}\n→ ${key}${note}`;

  process.stdout.write(JSON.stringify({ systemMessage: msg }));
  process.exit(0);
}

try {
  main();
} catch (e) {
  L.debug(`display FATAL ${e && e.stack}`);
  process.exit(0);
}
