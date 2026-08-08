#!/usr/bin/env node
'use strict';
/**
 * SRD §6.1 — 훅 스크립트 단독 테스트. Claude Code 없이 도는 가장 빠른 피드백 루프.
 *
 *   node test/run-tests.js
 *
 * 검사 항목:
 *   - stdout 이 "오직 JSON 객체 하나" 이거나 완전히 비어있는가
 *   - 어떤 입력에도 exit 0 인가 (exit 2 는 프롬프트를 지워버리므로 절대 금지)
 *   - 스킵 조건이 SRD §3.5 대로 동작하는가
 *
 * LLM 을 호출하는 translate.js 는 스킵 경로만 테스트한다. 실제 번역은 느리고
 * 비결정적이라 단위 테스트 대상이 아니다.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SCRIPTS = path.join(__dirname, '..', 'scripts');

// 테스트가 실제 학습 로그를 건드리지 않도록 데이터 디렉터리를 격리한다
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'en-coach-test-'));
const ENV = { ...process.env, CLAUDE_PLUGIN_DATA: SANDBOX };

let pass = 0, fail = 0;

function run(script, input, env = {}) {
  return spawnSync('node', [path.join(SCRIPTS, script)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...ENV, ...env },
    timeout: 15000,
  });
}

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function expectSilent(name, script, input, env) {
  const r = run(script, input, env);
  check(`${name} · exit 0`, r.status === 0, `status=${r.status}`);
  check(`${name} · 빈 stdout`, (r.stdout || '').trim() === '', JSON.stringify(r.stdout));
}

console.log(`sandbox: ${SANDBOX}\n`);

// ── display.js ────────────────────────────────────────────────
console.log('display.js');
expectSilent('pending 없음', 'display.js', { prompt: '리트라이 로직 좀 넣어줘' });
expectSilent('깨진 stdin', 'display.js', 'not json at all');
expectSilent('빈 stdin', 'display.js', '');
expectSilent('자식 가드', 'display.js', { prompt: '리트라이 좀' }, { EN_COACH_CHILD: '1' });

// pending 이 있으면 JSON 하나만 뱉어야 한다
fs.writeFileSync(
  path.join(SANDBOX, 'pending.jsonl'),
  JSON.stringify({ en: 'Add retry logic for when login fails.', key: 'retry logic for when ~', note: '실패 조건 붙일 때' }) + '\n'
);
{
  const r = run('display.js', { prompt: '아무거나 한국어 프롬프트입니다' });
  check('pending 소비 · exit 0', r.status === 0, `status=${r.status}`);
  let obj = null;
  try { obj = JSON.parse(r.stdout); } catch {}
  check('pending 소비 · stdout 이 JSON 객체 하나', !!obj && typeof obj === 'object', JSON.stringify(r.stdout));
  check('pending 소비 · systemMessage 만 있음', !!obj && Object.keys(obj).join() === 'systemMessage');
  check('pending 소비 · 정확히 2줄', !!obj && obj.systemMessage.split('\n').length === 2, obj && JSON.stringify(obj.systemMessage));
  const after = fs.readFileSync(path.join(SANDBOX, 'pending.jsonl'), 'utf8');
  check('pending 소비 후 비워짐', after.trim() === '', JSON.stringify(after));
}

// 특수문자가 JSON 이스케이프를 깨지 않는가
fs.writeFileSync(
  path.join(SANDBOX, 'pending.jsonl'),
  JSON.stringify({ en: 'Use "quotes" and a backslash \\ and 🔥', key: 'a"b\\c', note: '따옴표 역슬래시 이모지' }) + '\n'
);
{
  const r = run('display.js', { prompt: '따옴표 역슬래시 이모지 섞인 한국어' });
  let obj = null;
  try { obj = JSON.parse(r.stdout); } catch {}
  check('특수문자 · JSON 이스케이프 정상', !!obj && obj.systemMessage.includes('🔥'), JSON.stringify(r.stdout));
}

// ── translate.js 스킵 경로 ────────────────────────────────────
console.log('\ntranslate.js (스킵 경로만 — LLM 미호출)');
expectSilent('자식 가드', 'translate.js', { prompt: '리트라이 로직 좀 넣어줘' }, { EN_COACH_CHILD: '1' });
expectSilent('한글 없음', 'translate.js', { prompt: 'refactor this to use a map instead' }, { EN_COACH_CHILD: '1' });
expectSilent('슬래시 커맨드', 'translate.js', { prompt: '/help 좀 보여줘' }, { EN_COACH_CHILD: '1' });
expectSilent('코드블록 포함', 'translate.js', { prompt: '이거 고쳐줘 ```js\nconst a=1\n```' }, { EN_COACH_CHILD: '1' });
expectSilent('500자 초과', 'translate.js', { prompt: '가'.repeat(501) }, { EN_COACH_CHILD: '1' });
expectSilent('20자 미만', 'translate.js', { prompt: '계속해' }, { EN_COACH_CHILD: '1' });
expectSilent('prompt 필드 없음', 'translate.js', { session_id: 'x' }, { EN_COACH_CHILD: '1' });
expectSilent('깨진 stdin', 'translate.js', 'garbage', { EN_COACH_CHILD: '1' });

// ── skipReason 단위 ───────────────────────────────────────────
console.log('\nlib.skipReason');
{
  const L = require(path.join(SCRIPTS, 'lib.js'));
  const cases = [
    ['로그인 실패할 때 리트라이 로직 좀 넣어줘', null],
    ['refactor this to use a map', 'no-hangul'],
    ['/en-review 보여줘', 'slash-command'],
    ['이거 고쳐줘 ```code```', 'code-block'],
    ['가'.repeat(501), 'too-long'],
    ['계속해', 'too-short'],
    ['', 'empty'],
  ];
  for (const [input, want] of cases) {
    const got = L.skipReason(input);
    check(`skipReason(${JSON.stringify(input.slice(0, 24))}) = ${want}`, got === want, `got=${got}`);
  }
}

// ── statusline.js ─────────────────────────────────────────────
console.log('\nstatusline.js');
{
  fs.writeFileSync(path.join(SANDBOX, 'log.jsonl'), '');
  const r = run('statusline.js', { cwd: '/x', model: { display_name: 'Opus' }, workspace: { current_dir: '/x' } });
  check('로그 비었을 때 · exit 0', r.status === 0, `status=${r.status}`);
  check('로그 비었을 때 · 1줄 출력', (r.stdout || '').trim().split('\n').length === 1, JSON.stringify(r.stdout));

  const now = Date.now();
  const rows = [
    { t: now, ko: 'a', en: 'A', key: 'short-circuit', note: '', cwd: '', mode: 'exposure' },
    { t: now, ko: 'b', en: 'B', key: 'short-circuit', note: '', cwd: '', mode: 'exposure' },
    { t: now - 864e5, ko: 'c', en: 'C', key: 'wire it up to', note: '', cwd: '', mode: 'exposure' },
  ];
  fs.writeFileSync(path.join(SANDBOX, 'log.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const r2 = run('statusline.js', { cwd: '/x', model: { display_name: 'Opus' } });
  check('통계 · 오늘 2개', (r2.stdout || '').includes('오늘 2개'), JSON.stringify(r2.stdout));
  check('통계 · 연속 2일', (r2.stdout || '').includes('2일 연속'), JSON.stringify(r2.stdout));
  check('통계 · 최빈 표현', (r2.stdout || '').includes('short-circuit'), JSON.stringify(r2.stdout));

  fs.writeFileSync(path.join(SANDBOX, 'log.jsonl'), 'garbage\n{broken\n');
  const r3 = run('statusline.js', { cwd: '/x' });
  check('깨진 로그 · exit 0', r3.status === 0, `status=${r3.status}`);
}

// ── 쓰기 권한 없음 ────────────────────────────────────────────
console.log('\n권한/경로 이상');
expectSilent(
  '데이터 디렉터리 생성 불가',
  'display.js',
  { prompt: '리트라이 로직 좀 넣어줘' },
  { CLAUDE_PLUGIN_DATA: path.join(SANDBOX, 'nope.txt', 'sub') }
);

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
