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
 *
 * 줄 수 자체는 더 이상 제한하지 않는다. 한 턴 늦게 보여주는 이상 원문과 번역을
 * 나란히 놓고 익힐 표현까지 곁들여야 학습이 되기 때문이다. 다만 각 항목이
 * 자기 줄 안에 머물러야 블록이 읽히므로, 모델이 목록형 응답을 여러 줄로 돌려주면
 * 여기서 눌러 담는다. 한계값은 잘림 방지가 아니라 가독성 기준이다.
 */
function oneLine(s, n) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return !n || t.length <= n ? t : t.slice(0, n - 1) + '…';
}

/** 예전 스키마(key/note)로 쌓인 항목도 같은 형태로 다룬다. */
function phrasesOf(item) {
  if (Array.isArray(item.phrases) && item.phrases.length) return item.phrases;
  if (item.key) return [{ p: item.key, ko: item.note || '', ex: '' }];
  return [];
}

/** 접는 폭. 좁은 터미널이면 EN_COACH_WIDTH 로 줄인다. */
const WIDTH = Math.max(40, Number(process.env.EN_COACH_WIDTH) || 76);

/**
 * 블록 제목.
 *
 * Claude Code 는 systemMessage 앞에 `UserPromptSubmit says: ` 를 붙인다.
 * 렌더러에 하드코딩돼 있고(`[hookName," says: ",content]`) 훅 설정에 이름을
 * 바꿀 필드가 없어서 없앨 수 없다. 그 자리에 뭐가 오는지가 유일하게 우리가
 * 통제할 수 있는 부분이므로, 첫 줄에서 이게 무슨 기능인지 밝힌다.
 *
 * ↩ 는 이 화면에서 렌더링되는 것을 확인한 글자다. 이모지는 폭이 터미널마다
 * 달라 블록 정렬을 흔들 수 있어 쓰지 않는다.
 */
const TITLE = process.env.EN_COACH_TITLE || '↩ 직전 프롬프트로 배우는 개발 영어';

/**
 * 색은 기본으로 끈다.
 * systemMessage 가 ANSI 를 통과시키는지 실측하지 않았고, 통과시키지 않으면
 * 이스케이프 문자가 그대로 찍혀 지금보다 더 안 읽힌다. 켜보고 판단할 수 있게
 * EN_COACH_COLOR=1 로만 열어둔다.
 */
const COLOR = process.env.EN_COACH_COLOR === '1';

function paint(lines) {
  if (!COLOR) return lines;
  const DIM = '\x1b[2m', BOLD = '\x1b[1m', CYAN = '\x1b[36m', R = '\x1b[0m';
  return lines.map((l) => {
    if (l.startsWith('↩')) return DIM + l + R;
    if (l.startsWith('KO')) return DIM + l + R;
    if (l.startsWith('익힐 표현')) return BOLD + l + R;
    if (l.startsWith('  ▸')) return CYAN + l + R;
    return l;
  });
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

  // 한 턴 늦게 보여주므로, 무엇에 대한 영어인지부터 밝히고 원문과 번역을
  // 나란히 놓는다. 짝을 눈으로 맞출 수 있어야 학습이 된다.
  const head = rest.length ? `${TITLE}  (+${rest.length} 대기)` : TITLE;
  const lines = [head, ''];

  // 접히는 줄은 라벨 너비만큼 들여쓴다. 들여쓰기가 없으면 KO 가 접힌 줄인지
  // EN 이 시작한 줄인지 구분이 안 돼서 한눈에 안 들어온다.
  if (item.ko) lines.push(...L.wrapLabeled('KO  ', oneLine(item.ko, 0), WIDTH));
  lines.push(...L.wrapLabeled('EN  ', oneLine(item.en, 0), WIDTH));

  const phrases = phrasesOf(item);
  if (phrases.length) {
    lines.push('', '익힐 표현');
    for (const ph of phrases) {
      const gloss = ph.ko ? `  —  ${oneLine(ph.ko, 0)}` : '';
      lines.push(...L.wrapLabeled('  ▸ ', oneLine(ph.p, 0) + gloss, WIDTH));
      if (ph.ex) lines.push(...L.wrapLabeled('    ', `"${oneLine(ph.ex, 0)}"`, WIDTH));
    }
  }

  process.stdout.write(JSON.stringify({ systemMessage: paint(lines).join('\n') }));
  process.exit(0);
}

try {
  main();
} catch (e) {
  L.debug(`display FATAL ${e && e.stack}`);
  process.exit(0);
}
