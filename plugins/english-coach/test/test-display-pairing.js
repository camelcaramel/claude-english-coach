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

// ── 원문·번역·익힐 표현이 다 나오는가 ────────────────────────
console.log('출처 표시와 학습 블록');
setPending([{
  ko: '사이트 디자인 먼저 잡고 시작해보려고 해요',
  en: 'I want to nail down the site design first.',
  phrases: [
    { p: 'nail down ~', ko: '확정 짓다', ex: 'nail down the API contract before coding' },
    { p: 'start with ~', ko: '~부터 착수', ex: 'start with the auth flow' },
  ],
}]);
{
  const { msg } = display();
  const lines = msg.split('\n');
  check('직전 프롬프트임을 맨 위에 밝힘', lines[0].startsWith('↩ 직전 프롬프트'), JSON.stringify(lines[0]));
  check('원문 한국어 전문', msg.includes('사이트 디자인 먼저 잡고 시작해보려고 해요'), JSON.stringify(msg));
  check('번역 전문', msg.includes('nail down the site design first.'), JSON.stringify(msg));
  check('KO / EN 라벨', msg.includes('\nKO  ') && msg.includes('\nEN  '), JSON.stringify(msg));
  check('익힐 표현 섹션', msg.includes('익힐 표현'), JSON.stringify(msg));
  check('표현 2개 모두', msg.includes('nail down ~') && msg.includes('start with ~'), JSON.stringify(msg));
  check('한국어 뜻', msg.includes('확정 짓다'), JSON.stringify(msg));
  check('예문', msg.includes('nail down the API contract before coding'), JSON.stringify(msg));
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
  check('대기 개수 표시', !!msg && msg.split('\n')[0].includes('+2 대기'), JSON.stringify(msg));
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

// ── 원문·번역은 자르지 않는다 ─────────────────────────────────
console.log('\n전문 보존');
setPending([{ ko: '가'.repeat(300), en: 'x'.repeat(400), phrases: [{ p: 'k', ko: 'n', ex: 'e' }] }]);
{
  const { msg } = display();
  check('원문 300자 그대로', msg.includes('가'.repeat(300)), '잘림');
  check('번역 400자 그대로', msg.includes('x'.repeat(400)), '잘림');
}

// ── 각 항목이 자기 줄 안에 머무는가 ──────────────────────────
console.log('\n줄 정렬');
setPending([{
  ko: '디자인 레퍼런스 몇 개 드릴게요\n1. https://a.com\n2. https://b.com',
  en: 'Here are some design references:\n1. https://a.com\n2. https://b.com\n\nStart with the design system.',
  phrases: [{ p: 'use ~ as\nreference', ko: '참고용으로\n활용', ex: 'use the\nApollo examples as reference' }],
}]);
{
  const { msg } = display();
  const koLines = msg.split('\n').filter((l) => l.startsWith('KO  '));
  const enLines = msg.split('\n').filter((l) => l.startsWith('EN  '));
  check('KO 는 한 줄', koLines.length === 1 && koLines[0].includes('https://b.com'), JSON.stringify(koLines));
  check('EN 는 한 줄', enLines.length === 1 && enLines[0].includes('Start with the design system.'), JSON.stringify(enLines));
  check('표현도 한 줄로 눌림', msg.includes('use ~ as reference'), JSON.stringify(msg));
  check('예문도 한 줄로 눌림', msg.includes('"use the Apollo examples as reference"'), JSON.stringify(msg));
}

// ── 예전 스키마로 쌓인 항목도 깨지지 않는가 ──────────────────
console.log('\n하위 호환');
setPending([{ en: 'No source recorded.', key: 'k', note: 'n' }]);
{
  const { r, msg } = display();
  check('exit 0', r.status === 0, `status=${r.status}`);
  check('KO 줄 없음', !!msg && !msg.includes('\nKO  '), JSON.stringify(msg));
  check('영어는 표시됨', !!msg && msg.includes('No source recorded.'), JSON.stringify(msg));
  check('key/note 를 표현으로 승격', !!msg && msg.includes('1. k') && msg.includes('n'), JSON.stringify(msg));
}

// ── 표현이 하나도 없어도 되는가 ───────────────────────────────
console.log('\n표현 없음');
setPending([{ ko: '한국어 원문입니다 여기', en: 'English only.' }]);
{
  const { r, msg } = display();
  check('exit 0', r.status === 0, `status=${r.status}`);
  check('익힐 표현 섹션 생략', !!msg && !msg.includes('익힐 표현'), JSON.stringify(msg));
  check('원문·번역은 나옴', !!msg && msg.includes('한국어 원문입니다 여기') && msg.includes('English only.'), JSON.stringify(msg));
}

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
