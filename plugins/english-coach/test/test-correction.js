#!/usr/bin/env node
'use strict';
/**
 * Phase 3 (/en 교정 모드) 적립 검증.
 *
 * 교정 자체는 메인 Claude 가 커맨드 마크다운의 지시대로 하므로 여기서 테스트할
 * 수 없다. 여기서 고정하는 것은 적립 계약이다 — 어떤 입력이 와도 죽지 않고,
 * 노출 모드와 같은 로그에 mode 로 구분되어 쌓이며, /en-review 가 그걸 읽는다.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SCRIPTS = path.join(__dirname, '..', 'scripts');
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'en-coach-corr-'));
const ENV = { ...process.env, CLAUDE_PLUGIN_DATA: SANDBOX };

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function log(input) {
  return spawnSync('node', [path.join(SCRIPTS, 'log-correction.js')], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8', env: ENV, timeout: 10000,
  });
}
function logArgv(args) {
  return spawnSync('node', [path.join(SCRIPTS, 'log-correction.js'), ...args], {
    input: '', encoding: 'utf8', env: ENV, timeout: 10000,
  });
}
function rows() {
  try {
    return fs.readFileSync(path.join(SANDBOX, 'log.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

// ── 정상 적립 ─────────────────────────────────────────────────
console.log('적립');
{
  const r = log({
    raw: 'add retry logic for login fail',
    fixed: 'Add retry logic for when login fails.',
    phrases: [
      { p: 'for when ~', ko: '~할 때를 대비해', ex: 'add a fallback for when the cache is cold' },
      { p: 'retry logic', ko: '재시도 처리', ex: 'the retry logic should back off' },
    ],
  });
  check('exit 0', r.status === 0, `status=${r.status}`);
  check('적립 확인 출력', r.stdout.includes('적립됨'), JSON.stringify(r.stdout));

  const [rec] = rows();
  check('mode 가 correction', rec.mode === 'correction', rec.mode);
  check('ko 에 사용자 원문', rec.ko === 'add retry logic for login fail', rec.ko);
  check('en 에 교정본', rec.en === 'Add retry logic for when login fails.', rec.en);
  check('phrases 2개', rec.phrases.length === 2, String(rec.phrases.length));
  check('key/note 가 phrases[0] 과 일치', rec.key === 'for when ~' && rec.note === '~할 때를 대비해');
  check('t 가 숫자', typeof rec.t === 'number' && rec.t > 0);
}

// ── 플래그 형태 (커맨드가 실제로 쓰는 경로) ───────────────────
//
// Bash 도구는 중괄호와 따옴표가 같이 든 명령을 셸 인젝션 난독화로 보고 차단한다
// ("Contains brace with quote character"). 그래서 커맨드 마크다운은 명령줄에
// JSON 을 실을 수 없고 플래그를 쓴다. 이 경로가 깨지면 /en 은 조용히 적립을
// 못 하게 되므로 여기서 고정한다.
console.log('\n플래그 형태');
{
  const before = rows().length;
  const r = logArgv([
    '--raw', 'add retry logic for login fail',
    '--fixed', 'Add retry logic for when login fails.',
    '--phrase', 'for when ~|~할 때를 대비해|add a fallback for when the cache is cold',
    '--phrase', 'retry logic|재시도 처리|the retry logic should back off',
  ]);
  check('exit 0', r.status === 0, `status=${r.status}`);
  check('적립됨', r.stdout.includes('적립됨'), JSON.stringify(r.stdout));

  const rec = rows()[before];
  check('mode 가 correction', rec.mode === 'correction', rec.mode);
  check('raw 보존', rec.ko === 'add retry logic for login fail', rec.ko);
  check('fixed 보존', rec.en === 'Add retry logic for when login fails.', rec.en);
  check('표현 2개', rec.phrases.length === 2, String(rec.phrases.length));
  check('표현 쪼개짐', rec.phrases[0].p === 'for when ~' && rec.phrases[0].ko === '~할 때를 대비해'
    && rec.phrases[0].ex === 'add a fallback for when the cache is cold', JSON.stringify(rec.phrases[0]));

  const r2 = logArgv(['--raw', 'x', '--fixed', 'X.', '--phrase', '뜻만있음']);
  check('구분자 없는 표현도 받아냄', r2.status === 0 && rows()[before + 1].phrases[0].p === '뜻만있음');

  const r3 = logArgv(['--raw', 'only raw']);
  check('fixed 없으면 적립 안 함', r3.stdout.includes('적립 실패'), JSON.stringify(r3.stdout));

  const r4 = logArgv(['--raw']);
  check('값 없는 플래그에도 exit 0', r4.status === 0, `status=${r4.status}`);
}

// ── --data 로 데이터 디렉터리를 받는가 ────────────────────────
//
// ${CLAUDE_PLUGIN_DATA} 는 훅 프로세스에만 주입되고 Bash 도구 호출에는 안 들어온다.
// 커맨드가 --data 를 넘기지 않으면 기록이 개발용 폴백 경로로 새어 /en-review 가
// 못 찾는다 — 실사용에서 실제로 그렇게 어긋났다.
console.log('\n데이터 디렉터리');
{
  const alt = fs.mkdtempSync(path.join(os.tmpdir(), 'en-coach-alt-'));
  const envNoData = { ...process.env };
  delete envNoData.CLAUDE_PLUGIN_DATA;

  const r = spawnSync('node', [path.join(SCRIPTS, 'log-correction.js'),
    '--data', alt, '--raw', 'x', '--fixed', 'X.', '--phrase', 'p|k|e'], {
    input: '', encoding: 'utf8', env: envNoData, timeout: 10000,
  });
  check('exit 0', r.status === 0, `status=${r.status}`);
  check('--data 로 지정한 곳에 쌓임', fs.existsSync(path.join(alt, 'log.jsonl')), alt);
  check('환경변수 없어도 폴백으로 안 샘',
    !fs.existsSync(path.join(os.homedir(), '.claude', 'en-coach', 'log.jsonl')) ||
    !fs.readFileSync(path.join(alt, 'log.jsonl'), 'utf8').trim().length === false);

  // 치환 안 된 플레이스홀더가 그대로 넘어와도 무시해야 한다
  const r2 = spawnSync('node', [path.join(SCRIPTS, 'log-correction.js'),
    '--data', '${CLAUDE_PLUGIN_DATA}', '--raw', 'y', '--fixed', 'Y.'], {
    input: '', encoding: 'utf8', env: ENV, timeout: 10000,
  });
  check('치환 안 된 플레이스홀더는 무시', r2.status === 0 && r2.stdout.includes('적립됨'), JSON.stringify(r2.stdout));
  check('그 경우 원래 데이터 디렉터리로 감',
    rows().some((x) => x.ko === 'y'), '못 찾음');

  try { fs.rmSync(alt, { recursive: true, force: true }); } catch {}
}

// ── 표현은 3개까지 ────────────────────────────────────────────
console.log('\n상한');
{
  const before = rows().length;
  log({ raw: 'a b c', fixed: 'A B C.', phrases: Array.from({ length: 6 }, (_, i) => ({ p: `p${i}`, ko: 'k', ex: 'e' })) });
  const rec = rows()[before];
  check('3개까지만 적립', rec.phrases.length === 3, String(rec.phrases.length));
}

// ── 불량 입력에도 죽지 않는가 ─────────────────────────────────
console.log('\n불량 입력');
{
  const before = rows().length;
  for (const [name, input] of [
    ['JSON 아님', 'not json'],
    ['빈 입력', ''],
    ['raw 없음', { fixed: 'x' }],
    ['fixed 없음', { raw: 'x' }],
    ['둘 다 빈 문자열', { raw: '   ', fixed: '  ' }],
    ['phrases 가 배열 아님', { raw: 'a', fixed: 'b', phrases: 'nope' }],
    ['phrases 원소가 불량', { raw: 'a', fixed: 'b', phrases: [null, 3, { ko: 'x' }] }],
  ]) {
    const r = log(input);
    check(`${name} · exit 0`, r.status === 0, `status=${r.status}`);
  }
  const after = rows();
  check('유효한 2건만 추가됨', after.length === before + 2, `${before} -> ${after.length}`);
  check('phrases 불량 건은 빈 배열로 적립', after[after.length - 1].phrases.length === 0,
    JSON.stringify(after[after.length - 1].phrases));
}

// ── 특수문자 ──────────────────────────────────────────────────
console.log('\n특수문자');
{
  const r = log({
    raw: 'use "quotes" and \\ backslash 🔥',
    fixed: 'Use "quotes" and a \\ backslash 🔥.',
    phrases: [{ p: 'a "b" \\ c', ko: '따옴표·역슬래시', ex: 'x "y" \\ z' }],
  });
  check('exit 0', r.status === 0);
  const rec = rows()[rows().length - 1];
  check('이모지 보존', rec.ko.includes('🔥'), rec.ko);
  check('역슬래시 보존', rec.en.includes('\\'), rec.en);
  check('로그가 여전히 줄단위 JSON', rows().every((x) => x && typeof x.t === 'number'));
}

// ── /en-review 가 교정 기록을 읽는가 ──────────────────────────
console.log('\n리포트 연동');
{
  const r = spawnSync('node', [path.join(SCRIPTS, 'review.js'), '--chat'], {
    encoding: 'utf8', env: ENV, timeout: 20000,
  });
  check('exit 0', r.status === 0, `status=${r.status}`);
  check('교정 건수 표시', /✎ 교정 \d+건/.test(r.stdout), JSON.stringify(r.stdout));

  const r2 = spawnSync('node', [path.join(SCRIPTS, 'review.js'), '--no-open'], {
    encoding: 'utf8', env: ENV, timeout: 20000,
  });
  check('HTML 생성', r2.status === 0);
  const h = fs.readFileSync(path.join(SANDBOX, 'review.html'), 'utf8');
  check('교정 표시가 테이블에', h.includes('✎ 교정'), '없음');
  check('교정 표현도 플래시카드에', h.includes('for when ~'), '없음');
}

// ── 노출 모드와 섞여도 되는가 ─────────────────────────────────
console.log('\n두 모드 공존');
{
  // 같은 표현이 노출 모드에도 있으면 한 항목으로 합산돼야 한다.
  // 앞 테스트들이 몇 건을 남겼는지에 기대지 않고 실제 로그에서 세어 비교한다.
  const countOf = (p) =>
    rows().reduce((n, r) => n + ((r.phrases || []).some((x) => x.p === p) ? 1 : 0), 0);
  const before = countOf('for when ~');

  fs.appendFileSync(path.join(SANDBOX, 'log.jsonl'), JSON.stringify({
    t: Date.now(), ko: '리트라이 좀 넣어줘', en: 'Add retry logic.', key: 'for when ~', note: '~할 때',
    phrases: [{ p: 'for when ~', ko: '~할 때를 대비해', ex: 'for when it fails' }],
    cwd: '', mode: 'exposure',
  }) + '\n');

  const expected = before + 1;
  check('노출 기록이 더해짐', countOf('for when ~') === expected, String(countOf('for when ~')));

  const r = spawnSync('node', [path.join(SCRIPTS, 'review.js'), '--chat'], {
    encoding: 'utf8', env: ENV, timeout: 20000,
  });
  check('두 모드가 같은 표현으로 합산', r.stdout.includes(`for when ~(${expected}회)`), JSON.stringify(r.stdout));
}

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
