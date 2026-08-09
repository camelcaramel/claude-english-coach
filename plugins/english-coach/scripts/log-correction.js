#!/usr/bin/env node
'use strict';
/**
 * /en 교정 기록을 학습 로그에 적립한다.
 *
 *   node log-correction.js --raw "내가 쓴 영어" --fixed "교정본" \
 *                          --phrase "표현|한국어 뜻|예문" --phrase "..."
 *
 * 플래그 형태인 이유: Bash 도구가 중괄호와 따옴표가 같이 든 명령을 셸 인젝션
 * 난독화로 보고 차단한다("Contains brace with quote character"). 그래서 명령줄에
 * JSON 을 실을 수 없다. stdin JSON 도 계속 받지만(테스트·프로그램 호출용),
 * 커맨드 마크다운은 플래그 형태를 쓴다.
 *
 * 노출 모드(translate.js)와 같은 log.jsonl 에 쌓되 mode 로 구분한다.
 * 그래야 /en-review 가 두 모드를 한 화면에서 다룬다.
 *
 * `ko` 필드에는 사용자가 실제로 친 원문이 들어간다 — 노출 모드에서는 한국어,
 * 교정 모드에서는 어설픈 영어다. 필드 이름은 노출 모드에서 굳은 것이고,
 * 리포트가 "내가 쓴 것 / 고친 것" 짝으로 다루는 구조는 양쪽이 같다.
 */

const L = require('./lib');

/**
 * --raw "x" --fixed "y" --phrase "p|ko|ex" ... 를 stdin JSON 과 같은 모양으로 만든다.
 *
 * --data 는 데이터 디렉터리다. ${CLAUDE_PLUGIN_DATA} 는 훅 프로세스에만 환경변수로
 * 주입되고 Bash 도구 호출에는 들어오지 않는다. 그대로 두면 개발용 폴백 경로에
 * 쌓여서 /en-review 가 못 찾는다 — 실제로 그렇게 어긋났다. 커맨드 마크다운은
 * 플레이스홀더가 치환되는 자리이므로 거기서 넘겨받는다.
 */
function parseArgv(argv) {
  const out = { phrases: [] };
  for (let i = 0; i < argv.length; i++) {
    const next = () => argv[++i] ?? '';
    if (argv[i] === '--raw') out.raw = next();
    else if (argv[i] === '--fixed') out.fixed = next();
    else if (argv[i] === '--data') {
      const d = next();
      if (d && !d.includes('${')) process.env.CLAUDE_PLUGIN_DATA = d;
    } else if (argv[i] === '--phrase') {
      const [p, ko, ex] = next().split('|');
      out.phrases.push({ p: p || '', ko: ko || '', ex: ex || '' });
    }
  }
  return out.raw !== undefined || out.fixed !== undefined ? out : null;
}

function main() {
  let input = parseArgv(process.argv.slice(2));

  if (!input) {
    try {
      input = JSON.parse(L.readStdin());
    } catch (e) {
      process.stdout.write('적립 실패: --raw/--fixed 플래그나 stdin JSON 이 필요합니다\n');
      process.exit(0);
    }
  }

  const raw = typeof input.raw === 'string' ? input.raw.trim() : '';
  const fixed = typeof input.fixed === 'string' ? input.fixed.trim() : '';
  if (!raw || !fixed) {
    process.stdout.write('적립 실패: raw 와 fixed 가 모두 필요합니다\n');
    process.exit(0);
  }

  const phrases = [];
  for (const p of Array.isArray(input.phrases) ? input.phrases : []) {
    if (!p || typeof p.p !== 'string' || !p.p.trim()) continue;
    phrases.push({
      p: p.p.trim(),
      ko: typeof p.ko === 'string' ? p.ko.trim() : '',
      ex: typeof p.ex === 'string' ? p.ex.trim() : '',
    });
    if (phrases.length === 3) break;
  }

  const record = {
    t: Date.now(),
    ko: raw,
    en: fixed,
    key: phrases[0] ? phrases[0].p : '',
    note: phrases[0] ? phrases[0].ko : '',
    phrases,
    cwd: process.cwd(),
    mode: 'correction',
  };

  const ok = L.appendJsonl(L.P.log(), record);
  process.stdout.write(ok ? '교정 1건 적립됨\n' : '적립 실패: 로그를 쓸 수 없습니다\n');
  process.exit(0);
}

try {
  main();
} catch (e) {
  L.debug(`log-correction FATAL ${e && e.stack}`);
  process.stdout.write('적립 실패\n');
  process.exit(0);
}
