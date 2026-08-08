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
/** 접힌 줄을 다시 이어붙인다 — 내용이 온전한지 볼 때 쓴다. */
function unwrap(msg) {
  return String(msg).replace(/\n\s+/g, ' ');
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
  // 내용을 줄바꿈으로 시작해 `UserPromptSubmit says: ` 를 자기 줄에 떼어놓는다.
  check('첫 줄은 비어 있음 (접두사 분리)', lines[0] === '', JSON.stringify(lines[0]));
  check('제목이 무슨 기능인지 밝힘', lines[1] === '내 프롬프트로 배우는 개발 영어', JSON.stringify(lines[1]));
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
  check('대기 개수는 제목 줄에', !!msg && msg.split('\n')[1].includes('+2 대기'), JSON.stringify(msg));
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
  const flat = unwrap(msg).replace(/ /g, '');
  check('원문 300자 그대로', flat.includes('가'.repeat(300)), '잘림');
  check('번역 400자 그대로', flat.includes('x'.repeat(400)), '잘림');
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
  check('KO 라벨은 한 번만', koLines.length === 1, JSON.stringify(koLines));
  check('EN 라벨은 한 번만', enLines.length === 1, JSON.stringify(enLines));
  check('모델 줄바꿈이 아니라 우리 폭으로 접힘',
    unwrap(msg).includes('https://b.com') && unwrap(msg).includes('Start with the design system.'),
    JSON.stringify(msg));
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
  check('key/note 를 표현으로 승격', !!msg && msg.includes('▸ k — n'), JSON.stringify(msg));
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

// ── 폭 인식 줄바꿈 ────────────────────────────────────────────
console.log('\n레이아웃');
{
  const L = require(path.join(SCRIPTS, 'lib.js'));

  check('한글은 2칸', L.displayWidth('가나다') === 6, String(L.displayWidth('가나다')));
  check('ASCII 는 1칸', L.displayWidth('abc') === 3, String(L.displayWidth('abc')));
  check('섞인 경우', L.displayWidth('a가b') === 4, String(L.displayWidth('a가b')));

  const wrapped = L.wrapLabeled('KO  ', '가'.repeat(60), 40);
  check('폭 안에서 접힘', wrapped.every((l) => L.displayWidth(l) <= 40), JSON.stringify(wrapped.map((l) => L.displayWidth(l))));
  check('첫 줄만 라벨', wrapped[0].startsWith('KO  ') && wrapped.slice(1).every((l) => l.startsWith('    ')), JSON.stringify(wrapped));

  const url = 'https://example.com/' + 'a'.repeat(90);
  const w2 = L.wrapLabeled('EN  ', `see ${url} please`, 40);
  check('긴 URL 은 쪼개지 않음', w2.some((l) => l.includes(url)), JSON.stringify(w2));
}

// 실제 블록의 모든 줄이 폭 안에 있는가 (긴 토큰 한 개짜리 줄은 예외)
setPending([{
  ko: '네 일단 디자인 레퍼런스 몇 개 드릴게요 참고해서 디자인 시스템 만드는 작업 부터 시작해주세요',
  en: "I've got some design references for you. Use these as reference and kick off the design system work first.",
  phrases: [
    { p: 'use ~ as reference', ko: '참고용으로', ex: 'use the Apollo examples as reference' },
    { p: 'kick off ~ first', ko: '먼저 시작', ex: 'kick off the database migration first' },
  ],
}]);
{
  const L = require(path.join(SCRIPTS, 'lib.js'));
  const { msg } = display();
  const over = msg.split('\n').filter((l) => L.displayWidth(l) > 76 && l.trim().split(' ').length > 1);
  check('모든 줄이 76칸 이내', over.length === 0, JSON.stringify(over));
  check('▸ 로 표현을 구분', msg.includes('  ▸ use ~ as reference'), JSON.stringify(msg));
}

// 좁은 터미널 대응
{
  const L = require(path.join(SCRIPTS, 'lib.js'));
  const r = spawnSync('node', [path.join(SCRIPTS, 'display.js')], {
    input: JSON.stringify({ prompt: '좁은 폭으로 다시 보냅니다 한국어' }),
    encoding: 'utf8', env: { ...ENV, EN_COACH_WIDTH: '48' }, timeout: 10000,
  });
  check('EN_COACH_WIDTH 없이 소비돼 빈 출력', (r.stdout || '').trim() === '', '이전 테스트가 이미 소비함');

  setPending([{ ko: '한국어 원문이 제법 길어서 접혀야 하는 경우입니다 그렇습니다', en: 'A fairly long English sentence that has to wrap at a narrow width.', phrases: [] }]);
  const r2 = spawnSync('node', [path.join(SCRIPTS, 'display.js')], {
    input: JSON.stringify({ prompt: '좁은 폭으로 다시 보냅니다 한국어' }),
    encoding: 'utf8', env: { ...ENV, EN_COACH_WIDTH: '48' }, timeout: 10000,
  });
  const msg2 = JSON.parse(r2.stdout).systemMessage;
  const over2 = msg2.split('\n').filter((l) => L.displayWidth(l) > 48 && l.trim().split(' ').length > 1);
  check('폭 48 에서도 지켜짐', over2.length === 0, JSON.stringify(over2));
}

// 제목은 바꿔 끼울 수 있어야 한다
setPending([{ ko: '제목 테스트용 한국어 문장입니다', en: 'Title test.', phrases: [] }]);
{
  const r = spawnSync('node', [path.join(SCRIPTS, 'display.js')], {
    input: JSON.stringify({ prompt: '제목을 바꿔서 보냅니다 한국어로' }),
    encoding: 'utf8', env: { ...ENV, EN_COACH_TITLE: '↩ 개발 영어 · 직전 프롬프트' }, timeout: 10000,
  });
  const msg = JSON.parse(r.stdout).systemMessage;
  check('EN_COACH_TITLE 반영', msg.split('\n')[1] === '↩ 개발 영어 · 직전 프롬프트', JSON.stringify(msg.split('\n')[1]));
}

// 색은 기본으로 꺼져 있어야 한다
setPending([{ ko: '색 테스트용 한국어 문장입니다', en: 'Color test.', phrases: [{ p: 'p', ko: 'k', ex: 'e' }] }]);
{
  const { msg } = display();
  check('기본은 ANSI 없음', !/\x1b\[/.test(msg), JSON.stringify(msg));

  setPending([{ ko: '색 테스트용 한국어 문장입니다', en: 'Color test.', phrases: [{ p: 'p', ko: 'k', ex: 'e' }] }]);
  const r = spawnSync('node', [path.join(SCRIPTS, 'display.js')], {
    input: JSON.stringify({ prompt: '색을 켜고 다시 보냅니다 한국어로' }),
    encoding: 'utf8', env: { ...ENV, EN_COACH_COLOR: '1' }, timeout: 10000,
  });
  check('EN_COACH_COLOR=1 이면 ANSI 삽입', /\x1b\[/.test(JSON.parse(r.stdout).systemMessage));
}

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
