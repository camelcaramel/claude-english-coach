#!/usr/bin/env node
'use strict';
/**
 * 표시되는 영어가 어느 한국어의 것인지 화면에서 분명해야 한다.
 *
 * 회귀 방지 대상 (실사용에서 실제로 터진 문제):
 *   번역이 비동기라 표시되는 영어는 항상 이전 턴의 것인데, 화면에는 방금 보낸
 *   프롬프트가 붙어 있다. 출처 표시가 없으면 "현재 프롬프트의 오역"으로 읽힌다.
 *   학습 도구에서 잘못된 (한국어, 영어) 쌍을 각인시키는 건 치명적이다.
 *
 *   그리고 번역이 40초까지 걸리는 동안 프롬프트를 더 보내면 밀린 항목이
 *   조용히 버려졌다. FIFO 로 하나씩 소비해야 한다.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SCRIPTS = path.join(__dirname, '..', 'scripts');
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'en-coach-pair-'));
const ENV = { ...process.env, CLAUDE_PLUGIN_DATA: SANDBOX };

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function setPending(items) {
  fs.writeFileSync(path.join(SANDBOX, 'pending.jsonl'), items.map((i) => JSON.stringify(i)).join('\n') + '\n');
}
function readPending() {
  try {
    return fs.readFileSync(path.join(SANDBOX, 'pending.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}
function display() {
  const r = spawnSync('node', [path.join(SCRIPTS, 'display.js')], {
    input: JSON.stringify({ prompt: '지금 보내는 새 한국어 프롬프트입니다' }),
    encoding: 'utf8', env: ENV, timeout: 10000,
  });
  let obj = null;
  try { obj = JSON.parse(r.stdout); } catch {}
  return { r, obj, msg: obj && obj.systemMessage };
}

// ── 출처 한국어가 화면에 나오는가 ─────────────────────────────
console.log('출처 표시');
setPending([{ ko: '사이트 디자인 먼저 잡고 시작해보려고 해요', en: 'I want to nail down the site design first.', key: 'nail down', note: '확정 짓다' }]);
{
  const { msg } = display();
  check('출처 한국어가 포함됨', !!msg && msg.includes('사이트 디자인 먼저 잡고'), JSON.stringify(msg));
  check('영어도 포함됨', !!msg && msg.includes('nail down the site design'), JSON.stringify(msg));
  check('출처 줄이 맨 위', !!msg && msg.split('\n')[0].startsWith('↩'), JSON.stringify(msg));
  check('3줄', !!msg && msg.split('\n').length === 3, msg && String(msg.split('\n').length));
}

// ── FIFO 로 하나씩, 아무것도 버리지 않는가 ────────────────────
console.log('\n밀린 항목 처리');
setPending([
  { ko: '첫번째 프롬프트입니다', en: 'First one.', key: 'a', note: '1' },
  { ko: '두번째 프롬프트입니다', en: 'Second one.', key: 'b', note: '2' },
  { ko: '세번째 프롬프트입니다', en: 'Third one.', key: 'c', note: '3' },
]);
{
  const { msg } = display();
  check('가장 오래된 것부터 (FIFO)', !!msg && msg.includes('First one.'), JSON.stringify(msg));
  check('대기 개수 표시', !!msg && msg.includes('+2 대기'), JSON.stringify(msg));
  check('나머지 2개 보존됨', readPending().length === 2, String(readPending().length));

  const second = display();
  check('다음 턴에 두번째', !!second.msg && second.msg.includes('Second one.'), JSON.stringify(second.msg));
  check('하나 남음', readPending().length === 1, String(readPending().length));

  const third = display();
  check('그 다음 세번째', !!third.msg && third.msg.includes('Third one.'), JSON.stringify(third.msg));
  check('대기 표시 없음', !!third.msg && !third.msg.includes('대기'), JSON.stringify(third.msg));
  check('전부 소비됨', readPending().length === 0, String(readPending().length));

  const empty = display();
  check('빌 때 빈 출력', (empty.r.stdout || '').trim() === '', JSON.stringify(empty.r.stdout));
}

// ── 백로그 상한 ───────────────────────────────────────────────
console.log('\n백로그 상한');
setPending(Array.from({ length: 9 }, (_, i) => ({ ko: `프롬프트 ${i} 입니다`, en: `Item ${i}.`, key: 'k', note: 'n' })));
{
  display();
  check('3개까지만 보존', readPending().length === 3, String(readPending().length));
}

// ── 긴 입력 잘림 ──────────────────────────────────────────────
console.log('\n길이 제한');
setPending([{ ko: '가'.repeat(300), en: 'x'.repeat(400), key: 'k', note: 'n' }]);
{
  const { msg } = display();
  const lines = msg.split('\n');
  check('출처 줄이 60자 이내', lines[0].length <= 60, String(lines[0].length));
  check('EN 줄이 110자 이내', lines[1].length <= 110, String(lines[1].length));
  check('말줄임표 표시', msg.includes('…'), JSON.stringify(msg.slice(0, 60)));
}

// ── 여러 줄 번역이 와도 줄 수가 터지지 않는가 ────────────────
console.log('\n줄 수 통제');
setPending([{
  ko: '디자인 레퍼런스 몇 개 드릴게요\n1. https://a.com\n2. https://b.com',
  en: 'Here are some design references:\n1. https://a.com\n2. https://b.com\n\nStart with the design system.',
  key: 'using these\nas reference',
  note: '자료 제공 후\n작업 시작',
}]);
{
  const { msg } = display();
  check('모델이 여러 줄을 줘도 정확히 3줄', !!msg && msg.split('\n').length === 3, msg && String(msg.split('\n').length));
  check('URL 은 살아있음', !!msg && msg.includes('https://a.com'), JSON.stringify(msg));
}

// ── ko 없는 예전 항목도 깨지지 않는가 ────────────────────────
console.log('\n하위 호환');
setPending([{ en: 'No source recorded.', key: 'k', note: 'n' }]);
{
  const { r, msg } = display();
  check('exit 0', r.status === 0, `status=${r.status}`);
  check('출처 줄 없이 2줄', !!msg && msg.split('\n').length === 2, msg && String(msg.split('\n').length));
  check('영어는 표시됨', !!msg && msg.includes('No source recorded.'), JSON.stringify(msg));
}

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
