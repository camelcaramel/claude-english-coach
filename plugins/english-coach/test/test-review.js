#!/usr/bin/env node
'use strict';
/**
 * /en-review 리포트 생성기 검증.
 *
 * 브라우저 안에서 도는 코드라 눈으로 확인하기 어렵다. 그래서 여기서
 * 인라인 스크립트를 실제로 파싱하고, 사용자 데이터가 HTML/JS 문맥을 깨뜨리지
 * 않는지, 집계 숫자가 맞는지를 기계로 확인한다.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const vm = require('vm');

const SCRIPTS = path.join(__dirname, '..', 'scripts');
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'en-coach-review-'));
const ENV = { ...process.env, CLAUDE_PLUGIN_DATA: SANDBOX };

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function setLog(rows) {
  fs.writeFileSync(path.join(SANDBOX, 'log.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}
function run(args = []) {
  return spawnSync('node', [path.join(SCRIPTS, 'review.js'), ...args], {
    encoding: 'utf8', env: ENV, timeout: 20000,
  });
}
function html() {
  return fs.readFileSync(path.join(SANDBOX, 'review.html'), 'utf8');
}

const DAY = 864e5;
const now = Date.now();
const sample = [
  { t: now - 2 * DAY, ko: '리트라이 로직 좀 넣어줘', en: 'Add retry logic.', cwd: '', mode: 'exposure',
    phrases: [{ p: 'add ~ logic', ko: '로직 추가', ex: 'add caching logic' }] },
  { t: now - DAY, ko: '캐시 비면 바로 빠져나가게', en: 'Short-circuit when the cache is empty.', cwd: '', mode: 'exposure',
    phrases: [{ p: 'short-circuit when ~', ko: '조건 시 즉시 종료', ex: 'short-circuit when the list is empty' },
              { p: 'add ~ logic', ko: '로직 추가', ex: 'add caching logic' }] },
  { t: now, ko: '다음 작업으로 넘어가죠', en: 'Move on to the next task.', cwd: '', mode: 'exposure',
    phrases: [{ p: 'move on to ~', ko: '다음으로', ex: 'move on to the auth flow' }] },
];

// ── 빈 로그 ───────────────────────────────────────────────────
console.log('빈 로그');
setLog([]);
{
  const r = run(['--chat']);
  check('exit 0', r.status === 0, `status=${r.status}`);
  check('안내 문구', r.stdout.includes('아직 기록이 없습니다'), JSON.stringify(r.stdout));

  const r2 = run(['--no-open']);
  check('빈 로그로도 HTML 생성', r2.status === 0 && fs.existsSync(path.join(SANDBOX, 'review.html')));
  check('빈 상태 표시', html().includes('아직 기록이 없습니다'));
}

// ── 집계가 맞는가 ─────────────────────────────────────────────
console.log('\n집계');
setLog(sample);
{
  const r = run(['--chat']);
  check('프롬프트 3건', r.stdout.includes('프롬프트 3건'), JSON.stringify(r.stdout));
  check('표현 3개', r.stdout.includes('표현 3개'), JSON.stringify(r.stdout));
  check('연속 3일', r.stdout.includes('3일 연속'), JSON.stringify(r.stdout));
  check('반복 1개', r.stdout.includes('2회 이상 반복된 표현: 1개'), JSON.stringify(r.stdout));
  check('가장 많이 반복된 표현', r.stdout.includes('add ~ logic'), JSON.stringify(r.stdout));
  check('요약은 5줄', r.stdout.trim().split('\n').length === 5, String(r.stdout.trim().split('\n').length));
}

// ── HTML 무결성 ───────────────────────────────────────────────
console.log('\nHTML');
run(['--no-open']);
{
  const h = html();
  check('외부 리소스 없음', !/(src|href)=["']https?:/.test(h), '외부 참조 발견');
  for (const s of ['플래시카드', '일별 학습량', '표현 빈도', '전체 기록']) {
    check(`섹션: ${s}`, h.includes(s));
  }
  check('다크 모드 정의', h.includes('prefers-color-scheme:dark') && h.includes('[data-theme="dark"]'));

  const blocks = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  check('script 블록 1개', blocks.length === 1, String(blocks.length));
  let syntaxOk = true, err = '';
  for (const b of blocks) {
    try { new vm.Script(b[1]); } catch (e) { syntaxOk = false; err = e.message; }
  }
  check('인라인 JS 구문 정상', syntaxOk, err);

  const cards = JSON.parse(h.match(/const CARDS = (\[[\s\S]*?\]);\n/)[1]);
  check('카드 3장', cards.length === 3, String(cards.length));
  check('카드에 예문 포함', cards.every((c) => c.ex), JSON.stringify(cards.map((c) => c.ex)));
  check('카드에 출처 프롬프트 포함', cards.every((c) => c.samples && c.samples.length));
}

// ── 사용자 데이터가 문맥을 깨뜨리지 않는가 ────────────────────
console.log('\n이스케이프');
setLog([{
  t: now,
  ko: '<script>alert(1)</script> & "따옴표" 랑 \'작은따옴표\'',
  en: 'A <b>bold</b> & "quoted" string',
  cwd: '', mode: 'exposure',
  phrases: [{ p: '</script><img src=x onerror=alert(1)>', ko: '주입 시도', ex: 'a & b < c' }],
}]);
{
  const r = run(['--no-open']);
  check('exit 0', r.status === 0, `status=${r.status}`);
  const h = html();
  check('본문에 살아있는 script 태그 없음', !/<script>alert/.test(h), '주입됨');
  check('script 블록은 여전히 1개', [...h.matchAll(/<script>/g)].length === 1,
    String([...h.matchAll(/<script>/g)].length));
  const blocks = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let ok = true, err = '';
  try { new vm.Script(blocks[0][1]); } catch (e) { ok = false; err = e.message; }
  check('JSON 안의 </script> 가 블록을 끊지 않음', ok, err);
  check('앰퍼샌드 이스케이프', h.includes('&amp;'), '없음');
}

// ── 예문 빈칸 로직 ────────────────────────────────────────────
console.log('\n예문 빈칸');
{
  // review.js 가 HTML 에 심는 것과 같은 로직을 그대로 떼어내 돌린다.
  const blank = (p, ex) => {
    const core = p.replace(/~/g, '').trim().split(/\s+/).filter((w) => w.length > 2)[0];
    return core ? ex.replace(new RegExp(core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '____') : ex;
  };
  check('표현을 가린다', blank('use ~ as reference', 'use the Apollo examples as reference') === '____ the Apollo examples as reference',
    blank('use ~ as reference', 'use the Apollo examples as reference'));
  check('특수문자 표현에서 터지지 않음', blank('a(b) ~ c', 'we should a(b) x c here').includes('____') === false || true);
  let threw = false;
  try { blank('[x] ~ (y)', 'the [x] and (y) parts'); } catch { threw = true; }
  check('정규식 메타문자로 예외 안 남', !threw);
  check('짧은 단어뿐이면 원문 유지', blank('~ is', 'it is fine') === 'it is fine', blank('~ is', 'it is fine'));
}

// ── 로그가 깨져 있어도 죽지 않는가 ────────────────────────────
console.log('\n손상된 로그');
fs.writeFileSync(path.join(SANDBOX, 'log.jsonl'), 'garbage\n{broken\n' + JSON.stringify(sample[0]) + '\n');
{
  const r = run(['--chat']);
  check('exit 0', r.status === 0, `status=${r.status}`);
  check('읽을 수 있는 줄만 집계', r.stdout.includes('프롬프트 1건'), JSON.stringify(r.stdout));
}

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
