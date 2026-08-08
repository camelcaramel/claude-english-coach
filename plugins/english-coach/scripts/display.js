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

/** 밀린 결과를 이 개수까지만 들고 간다. 더 오래된 건 로그에만 남고 화면에선 포기한다. */
const MAX_BACKLOG = 3;

/**
 * 한 줄로 눌러 담는다.
 * 모델이 목록형 요청을 번호 매긴 여러 줄로 돌려주는 경우가 있는데, 그대로 쓰면
 * 3줄 포맷이 6줄, 7줄로 터진다. 줄 수는 우리가 통제해야 한다.
 */
function oneLine(s, n) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

function main() {
  if (L.isChild()) L.passthrough();

  L.readStdin(); // stdin 을 비워준다. 안 그러면 파이프가 막힐 수 있다

  const pending = L.readJsonl(L.P.pending());
  if (!pending.length) L.passthrough();

  // FIFO. 예전에는 마지막 것만 보여주고 나머지를 버렸는데, 번역이 40초까지
  // 걸리는 동안 프롬프트를 두어 개 더 보내면 중간 것들이 조용히 사라졌다.
  const item = pending[0];
  const rest = pending.slice(1, 1 + MAX_BACKLOG);

  try {
    fs.writeFileSync(L.P.pending(), rest.map((r) => JSON.stringify(r)).join('\n') + (rest.length ? '\n' : ''));
  } catch (e) {
    L.debug(`pending rewrite failed: ${e.message}`);
  }

  if (!item || !item.en) L.passthrough();

  const key = oneLine(item.key, 60);
  const note = item.note ? ` : ${oneLine(item.note, 40)}` : '';

  // 출처 한국어를 같이 보여준다.
  //
  // SRD §3.3 은 정확히 2줄을 요구하지만 여기서 3줄로 늘렸다. 번역이 비동기라
  // 표시되는 영어는 항상 이전 턴의 것인데, 화면에는 방금 보낸 프롬프트가 붙어 있다.
  // 라벨이 없으면 "지금 이 프롬프트의 오역"으로 읽힌다 — 실제로 그렇게 오해받았다.
  // 학습 도구에서 잘못된 (한국어, 영어) 쌍을 머리에 넣는 건 아무것도 안 하느니만 못하다.
  // 한 줄 더 쓰는 값보다 짝이 어긋나는 손해가 크다.
  const lines = [];
  if (item.ko) lines.push(`↩ "${oneLine(item.ko, 44)}"`);
  lines.push(`EN: ${oneLine(item.en, 100)}`);
  lines.push(`→ ${key}${note}`);
  if (rest.length) lines[lines.length - 1] += `   (+${rest.length} 대기)`;

  process.stdout.write(JSON.stringify({ systemMessage: lines.join('\n') }));
  process.exit(0);
}

try {
  main();
} catch (e) {
  L.debug(`display FATAL ${e && e.stack}`);
  process.exit(0);
}
