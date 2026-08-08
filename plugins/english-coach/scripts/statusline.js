#!/usr/bin/env node
'use strict';
/**
 * statusline — 하단 상시 배지. LLM 호출 없음, 비용 0.
 *
 * Orca 공존:
 *   ~/.claude/settings.json 의 statusLine 슬롯은 하나뿐이고 Orca 가 이미 쓰고 있다.
 *   그런데 Orca 의 claude-statusline.cmd 는 stdin 페이로드를 로컬 데몬으로 POST 만 하고
 *   stdout 에는 아무것도 쓰지 않는다 (순수 텔레메트리 파이프).
 *   따라서 덮어쓰기가 아니라 "통과시키고 뒤에 붙이기"가 가능하다.
 *
 *     stdin ──┬─> Orca cmd (POST, 출력 없음)  ← Orca UI 계속 살아있음
 *             └─> 우리 렌더링                  ← 터미널에 보이는 건 이것뿐
 *
 *   Orca 쪽이 실패하거나 사라져도 우리 줄은 반드시 찍힌다.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

/**
 * statusLine 은 플러그인 컴포넌트가 아니라 사용자 설정 항목이다.
 * 훅과 달리 ${CLAUDE_PLUGIN_DATA} 가 환경변수로 주입되지 않으므로,
 * 그대로 두면 lib 이 개발용 폴백 경로를 읽어 항상 "기록 없음"이 뜬다.
 *
 * install-statusline.js 가 이 파일을 ${CLAUDE_PLUGIN_DATA}/bin/ 으로 복사하므로,
 * bin/ 안에서 돌고 있다면 부모 디렉터리가 곧 데이터 디렉터리다.
 * lib 을 require 하기 전에 채워 넣어야 한다.
 */
if (!process.env.CLAUDE_PLUGIN_DATA && path.basename(__dirname) === 'bin') {
  process.env.CLAUDE_PLUGIN_DATA = path.dirname(__dirname);
}

const L = require('./lib');

const ORCA = path.join(os.homedir(), '.orca', 'agent-hooks', 'claude-statusline.cmd');

function forwardToOrca(raw) {
  try {
    if (!fs.existsSync(ORCA)) return;
    // .cmd 는 실행 파일이 아니라 배치 스크립트다. node 가 직접 spawn 할 수 없으므로
    // cmd.exe /c 로 감싼다. shell:true 보다 인용 문제가 없다.
    spawnSync('cmd.exe', ['/c', ORCA], {
      input: raw,
      encoding: 'utf8',
      timeout: 2500,
      windowsHide: true,
    });
  } catch {}
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function stats(rows) {
  const today = dayKey(Date.now());
  const todayCount = rows.filter((r) => dayKey(r.t) === today).length;

  // 연속일: 오늘(또는 어제)부터 거꾸로 끊기지 않는 날 수
  const days = new Set(rows.map((r) => dayKey(r.t)));
  let streak = 0;
  const cur = new Date();
  if (!days.has(dayKey(cur.getTime()))) cur.setDate(cur.getDate() - 1); // 오늘 아직 안 했어도 어제까지 인정
  while (days.has(dayKey(cur.getTime()))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }

  // 최근 7일 최빈 표현 — "좁은 도메인" 가설이 맞는지 눈으로 확인하는 지표
  const weekAgo = Date.now() - 7 * 864e5;
  const freq = new Map();
  for (const r of rows) {
    if (r.t < weekAgo || !r.key) continue;
    const k = r.key.trim().toLowerCase();
    freq.set(k, (freq.get(k) || 0) + 1);
  }
  let top = '', topN = 0;
  for (const [k, n] of freq) if (n > topN) { top = k; topN = n; }

  return { todayCount, streak, top, topN, total: rows.length };
}

function main() {
  const raw = L.readStdin();
  forwardToOrca(raw);

  const s = stats(L.readJsonl(L.P.log()));

  const D = '\x1b[2m', Y = '\x1b[33m', C = '\x1b[36m', R = '\x1b[0m';
  const parts = [];

  if (s.streak > 0) parts.push(`${Y}🔥 ${s.streak}일 연속${R}`);
  parts.push(`오늘 ${s.todayCount}개`);
  if (s.topN > 1) parts.push(`${C}이번주 반복: ${s.top}${R} ${D}×${s.topN}${R}`);
  else if (s.total === 0) parts.push(`${D}아직 기록 없음${R}`);

  console.log(`${D}EN${R} ` + parts.join(` ${D}·${R} `));
}

try {
  main();
} catch (e) {
  // statusline 이 죽어도 세션은 계속되어야 한다
  process.exit(0);
}
