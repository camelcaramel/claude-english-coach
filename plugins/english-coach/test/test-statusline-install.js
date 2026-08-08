#!/usr/bin/env node
'use strict';
/**
 * 설치된 statusline 사본이 올바른 데이터 디렉터리를 읽는지 검증한다.
 *
 * 회귀 방지 대상:
 *   statusLine 은 플러그인 컴포넌트가 아니라 사용자 설정 항목이라
 *   CLAUDE_PLUGIN_DATA 가 주입되지 않는다. 그대로 두면 개발용 폴백 경로를 읽어
 *   로그가 멀쩡히 쌓여 있어도 statusline 에 "아직 기록 없음"만 뜬다.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const SCRIPTS = path.join(__dirname, '..', 'scripts');
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'en-coach-sl-'));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// 1. SessionStart 훅이 bin/ 으로 복사하는가
spawnSync('node', [path.join(SCRIPTS, 'install-statusline.js')], {
  input: '{}',
  encoding: 'utf8',
  env: { ...process.env, CLAUDE_PLUGIN_DATA: SANDBOX },
});
const bin = path.join(SANDBOX, 'bin');
check('bin/statusline.js 복사됨', fs.existsSync(path.join(bin, 'statusline.js')));
check('bin/lib.js 복사됨', fs.existsSync(path.join(bin, 'lib.js')));

// 2. 로그를 심어두고, CLAUDE_PLUGIN_DATA 없이 실행해도 그 로그를 읽는가
const now = Date.now();
fs.writeFileSync(
  path.join(SANDBOX, 'log.jsonl'),
  [
    { t: now, ko: 'a', en: 'A', key: 'short-circuit', note: '', cwd: '', mode: 'exposure' },
    { t: now, ko: 'b', en: 'B', key: 'short-circuit', note: '', cwd: '', mode: 'exposure' },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n'
);

const env = { ...process.env };
delete env.CLAUDE_PLUGIN_DATA; // 사용자 설정에서 실행되는 상황을 그대로 재현

const r = spawnSync('node', [path.join(bin, 'statusline.js')], {
  input: JSON.stringify({ cwd: '/x', model: { display_name: 'Opus' } }),
  encoding: 'utf8',
  env,
  timeout: 10000,
});

check('exit 0', r.status === 0, `status=${r.status}`);
check('데이터 디렉터리를 스스로 찾아냄 (오늘 2개)', (r.stdout || '').includes('오늘 2개'), JSON.stringify(r.stdout));
check('최빈 표현 표시', (r.stdout || '').includes('short-circuit'), JSON.stringify(r.stdout));
check('"기록 없음" 이 아님', !(r.stdout || '').includes('기록 없음'), JSON.stringify(r.stdout));

// 3. bin/ 밖(개발 중 저장소)에서 돌 때는 기존 폴백을 유지하는가
const r2 = spawnSync('node', [path.join(SCRIPTS, 'statusline.js')], {
  input: JSON.stringify({ cwd: '/x' }),
  encoding: 'utf8',
  env: { ...process.env, CLAUDE_PLUGIN_DATA: SANDBOX },
  timeout: 10000,
});
check('저장소에서 직접 실행 시 CLAUDE_PLUGIN_DATA 존중', (r2.stdout || '').includes('오늘 2개'), JSON.stringify(r2.stdout));

console.log(`\n${pass} passed, ${fail} failed`);
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
