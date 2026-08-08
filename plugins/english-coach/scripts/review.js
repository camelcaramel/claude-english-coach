#!/usr/bin/env node
'use strict';
/**
 * /en-review — log.jsonl 을 읽어 복습 리포트를 만든다.
 *
 *   node review.js            HTML 생성 후 브라우저로 연다
 *   node review.js --chat     채팅용 요약 5줄만 출력
 *   node review.js --no-open  HTML 만 만들고 열지 않는다
 *
 * LLM 을 부르지 않는다. 순수 집계라 즉시 끝나고 비용이 0이며 결과가 매번 같다.
 * 브라우저 안에서는 터미널 제약이 없으므로 히트맵·빈도·플래시카드를 전부 넣는다.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const L = require('./lib');

const ARGS = process.argv.slice(2);
const CHAT = ARGS.includes('--chat');
const NO_OPEN = ARGS.includes('--no-open');

const DAY = 864e5;

// ── 집계 ──────────────────────────────────────────────────────

function dayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** 로그 한 건에서 표현 목록을 꺼낸다. 예전 스키마(key/note)도 받아준다. */
function phrasesOf(r) {
  if (Array.isArray(r.phrases) && r.phrases.length) return r.phrases;
  if (r.key) return [{ p: r.key, ko: r.note || '', ex: '' }];
  return [];
}

function analyze(rows) {
  const byDay = new Map();
  const phraseMap = new Map(); // 정규화된 표현 -> {p, ko, ex, n, last, samples}

  for (const r of rows) {
    const k = dayKey(r.t);
    byDay.set(k, (byDay.get(k) || 0) + 1);

    for (const ph of phrasesOf(r)) {
      if (!ph.p) continue;
      const norm = ph.p.trim().toLowerCase();
      let e = phraseMap.get(norm);
      if (!e) {
        e = { p: ph.p.trim(), ko: ph.ko || '', ex: ph.ex || '', n: 0, last: 0, samples: [] };
        phraseMap.set(norm, e);
      }
      e.n++;
      e.last = Math.max(e.last, r.t);
      if (!e.ko && ph.ko) e.ko = ph.ko;
      if (!e.ex && ph.ex) e.ex = ph.ex;
      if (e.samples.length < 3) e.samples.push({ ko: r.ko, en: r.en });
    }
  }

  const phrases = [...phraseMap.values()].sort((a, b) => b.n - a.n || b.last - a.last);

  // 연속일: 오늘(없으면 어제)부터 거꾸로 끊기지 않는 날 수
  let streak = 0;
  const cur = new Date();
  if (!byDay.has(dayKey(cur.getTime()))) cur.setDate(cur.getDate() - 1);
  while (byDay.has(dayKey(cur.getTime()))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }

  const repeated = phrases.filter((p) => p.n > 1);

  return {
    rows,
    byDay,
    phrases,
    streak,
    today: byDay.get(dayKey(Date.now())) || 0,
    total: rows.length,
    uniquePhrases: phrases.length,
    repeated,
    // 좁은 도메인 가설: 표현이 얼마나 재사용되는가.
    // 1.0 이면 한 번도 안 겹친 것이고, 높을수록 유한한 목록에 수렴한다는 뜻이다.
    reuse: phrases.length ? phrases.reduce((a, p) => a + p.n, 0) / phrases.length : 0,
    first: rows.length ? rows[0].t : 0,
    last: rows.length ? rows[rows.length - 1].t : 0,
  };
}

// ── 채팅 요약 ─────────────────────────────────────────────────

function chatSummary(a) {
  if (!a.total) return '아직 기록이 없습니다. 한국어로 프롬프트를 몇 개 보내면 쌓이기 시작합니다.';
  const span = Math.max(1, Math.round((a.last - a.first) / DAY) + 1);
  const top = a.phrases.slice(0, 3).map((p) => `${p.p}${p.n > 1 ? `(${p.n}회)` : ''}`).join(', ');
  return [
    `기간 ${span}일 · 프롬프트 ${a.total}건 · 표현 ${a.uniquePhrases}개 · 🔥 ${a.streak}일 연속`,
    `자주 나온 표현: ${top || '없음'}`,
    `2회 이상 반복된 표현: ${a.repeated.length}개 (재사용률 ${a.reuse.toFixed(2)})`,
    a.repeated.length
      ? `가장 많이 반복: ${a.repeated[0].p} — ${a.repeated[0].ko} (${a.repeated[0].n}회)`
      : '아직 반복이 없습니다. 표본이 더 쌓여야 "좁은 도메인" 가설을 확인할 수 있습니다.',
    `전체 리포트: /en-review (브라우저)`,
  ].join('\n');
}

// ── HTML ──────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/** 마지막 N주치 달력 격자. 열 = 주, 행 = 요일(일~토). */
function calendarCells(byDay, weeks = 16) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay())); // 이번 주 토요일까지 채운다
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));

  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const k = dayKey(d.getTime());
    cells.push({
      key: k,
      n: byDay.get(k) || 0,
      future: d.getTime() > today.getTime(),
      col: Math.floor(i / 7),
      row: i % 7,
      month: d.getMonth(),
      dateNum: d.getDate(),
    });
  }
  return { cells, weeks };
}

function buildHtml(a) {
  const { cells, weeks } = calendarCells(a.byDay);
  const maxDay = Math.max(1, ...cells.map((c) => c.n));

  // 연속 크기 → 시퀀셜 파랑 한 색 램프. 가장 옅은 단계가 "거의 0" 이다.
  const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#104281'];
  const stepOf = (n) => (n <= 0 ? -1 : Math.min(RAMP.length - 1, Math.floor(((n - 1) / maxDay) * RAMP.length)));

  const calHtml = cells
    .map((c) => {
      const s = stepOf(c.n);
      const style = c.future
        ? 'visibility:hidden'
        : s < 0
          ? 'background:var(--cell-empty)'
          : `background:${RAMP[s]}`;
      return `<div class="cell" style="grid-column:${c.col + 1};grid-row:${c.row + 1};${style}" data-d="${c.key}" data-n="${c.n}" tabindex="${c.future ? -1 : 0}"></div>`;
    })
    .join('');

  const maxN = a.phrases.length ? a.phrases[0].n : 1;
  const barsHtml = a.phrases
    .slice(0, 15)
    .map((p) => {
      const pct = Math.max(2, (p.n / maxN) * 100);
      return `<div class="bar-row" data-ko="${esc(p.ko)}">
        <div class="bar-label" title="${esc(p.p)}">${esc(p.p)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-val">${p.n}</div>
      </div>`;
    })
    .join('');

  const cards = a.phrases.map((p) => ({ p: p.p, ko: p.ko, ex: p.ex, n: p.n, samples: p.samples }));

  const tableHtml = a.rows
    .slice()
    .reverse()
    .map((r) => {
      const chips = phrasesOf(r)
        .map((ph) => `<span class="chip">${esc(ph.p)}</span>`)
        .join('');
      const d = new Date(r.t);
      const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return `<tr><td class="when">${when}</td><td class="ko">${esc(r.ko)}</td><td class="en">${esc(r.en)}</td><td class="ph">${chips}</td></tr>`;
    })
    .join('');

  const span = a.total ? Math.max(1, Math.round((a.last - a.first) / DAY) + 1) : 0;
  const range = a.total
    ? `${new Date(a.first).toLocaleDateString('ko-KR')} – ${new Date(a.last).toLocaleDateString('ko-KR')}`
    : '기록 없음';

  const cardsJson = JSON.stringify(cards).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>내 개발 영어 — 복습 리포트</title>
<style>
:root{
  color-scheme:light;
  --plane:#f9f9f7; --surface:#fcfcfb;
  --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781; --grid:#e1e0d9;
  --accent:#2a78d6; --cell-empty:#eceae2;
  --radius:10px;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  color-scheme:dark;
  --plane:#0d0d0d; --surface:#1a1a19;
  --ink:#fff; --ink-2:#c3c2b7; --muted:#898781; --grid:#2c2c2a;
  --accent:#3987e5; --cell-empty:#242422;
}}
:root[data-theme="dark"]{
  color-scheme:dark;
  --plane:#0d0d0d; --surface:#1a1a19;
  --ink:#fff; --ink-2:#c3c2b7; --muted:#898781; --grid:#2c2c2a;
  --accent:#3987e5; --cell-empty:#242422;
}
*{box-sizing:border-box}
body{margin:0;background:var(--plane);color:var(--ink);
  font:15px/1.6 ui-sans-serif,-apple-system,"Segoe UI","Malgun Gothic",sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:32px 20px 80px}
header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:6px}
h1{font-size:22px;margin:0;letter-spacing:-.01em}
.sub{color:var(--muted);font-size:13px}
.theme{margin-left:auto;background:none;border:1px solid var(--grid);color:var(--ink-2);
  border-radius:8px;padding:5px 10px;cursor:pointer;font-size:12px}
section{background:var(--surface);border:1px solid var(--grid);border-radius:var(--radius);
  padding:20px;margin-top:18px}
h2{font-size:13px;margin:0 0 4px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2)}
.note{color:var(--muted);font-size:12.5px;margin:0 0 16px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-top:18px}
.tile{background:var(--surface);border:1px solid var(--grid);border-radius:var(--radius);padding:14px 16px}
.tile .v{font-size:26px;font-weight:600;letter-spacing:-.02em;line-height:1.15}
.tile .l{font-size:12px;color:var(--muted);margin-top:2px}
.cal-scroll{overflow-x:auto}
.cal{display:grid;grid-template-rows:repeat(7,12px);grid-auto-flow:column;gap:3px;
  grid-template-columns:repeat(${weeks},12px);min-width:max-content}
.cell{width:12px;height:12px;border-radius:3px;background:var(--cell-empty)}
.cell:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.legend{display:flex;align-items:center;gap:6px;margin-top:12px;font-size:12px;color:var(--muted)}
.legend .cell{width:11px;height:11px}
.bar-row{display:grid;grid-template-columns:minmax(0,220px) 1fr 34px;gap:12px;align-items:center;
  padding:3px 0;cursor:default}
.bar-label{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}
.bar-track{background:var(--cell-empty);border-radius:4px;height:9px;overflow:hidden}
.bar-fill{height:100%;background:var(--accent);border-radius:0 4px 4px 0}
.bar-val{font-size:12px;color:var(--ink-2);text-align:right;font-variant-numeric:tabular-nums}
.bar-row:hover .bar-label{color:var(--accent)}
.card{border:1px solid var(--grid);border-radius:var(--radius);padding:26px 22px;text-align:center;
  min-height:210px;display:flex;flex-direction:column;justify-content:center;gap:12px}
.card .q{font-size:20px;font-weight:600;letter-spacing:-.01em}
.card .hint{color:var(--muted);font-size:13.5px}
.card .a{font-size:23px;font-weight:600;color:var(--accent);letter-spacing:-.01em}
.card .ex{color:var(--ink-2);font-size:14px;font-style:italic}
.card .src{color:var(--muted);font-size:12.5px;border-top:1px solid var(--grid);padding-top:10px;margin-top:2px;text-align:left}
.controls{display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap}
button.act{border:1px solid var(--grid);background:var(--surface);color:var(--ink);
  border-radius:8px;padding:9px 16px;cursor:pointer;font-size:13.5px}
button.act:hover{border-color:var(--accent);color:var(--accent)}
button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
button.primary:hover{color:#fff;opacity:.9}
.progress{font-size:12px;color:var(--muted);text-align:center;margin-top:10px}
#search{width:100%;padding:9px 12px;border:1px solid var(--grid);border-radius:8px;
  background:var(--plane);color:var(--ink);font-size:13.5px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--muted);font-weight:500;font-size:11.5px;text-transform:uppercase;
  letter-spacing:.04em;padding:6px 8px;border-bottom:1px solid var(--grid)}
td{padding:9px 8px;border-bottom:1px solid var(--grid);vertical-align:top}
td.when{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
td.ko{color:var(--ink-2);max-width:250px}
td.en{max-width:280px}
.chip{display:inline-block;background:var(--cell-empty);color:var(--ink-2);border-radius:5px;
  padding:2px 7px;font-size:11.5px;margin:0 4px 4px 0;white-space:nowrap}
.empty{color:var(--muted);text-align:center;padding:40px 0}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--plane);
  padding:5px 9px;border-radius:6px;font-size:12px;opacity:0;transition:opacity .1s;z-index:9}
@media (max-width:640px){.bar-row{grid-template-columns:minmax(0,140px) 1fr 30px}td.ko{display:none}}
</style></head><body>
<div class="wrap">
<header>
  <h1>내 개발 영어</h1>
  <span class="sub">${esc(range)}${span ? ` · ${span}일` : ''}</span>
  <button class="theme" onclick="var r=document.documentElement;r.dataset.theme=r.dataset.theme==='dark'?'light':'dark'">테마</button>
</header>

<div class="tiles">
  <div class="tile"><div class="v">${a.total}</div><div class="l">프롬프트</div></div>
  <div class="tile"><div class="v">${a.uniquePhrases}</div><div class="l">표현</div></div>
  <div class="tile"><div class="v">${a.streak}</div><div class="l">일 연속</div></div>
  <div class="tile"><div class="v">${a.repeated.length}</div><div class="l">반복된 표현</div></div>
  <div class="tile"><div class="v">${a.reuse.toFixed(2)}</div><div class="l">재사용률</div></div>
</div>

<section>
  <h2>플래시카드</h2>
  <p class="note">한국어 뜻을 보고 영어 표현을 떠올린다. 틀린 카드는 더 자주, 맞힌 카드는 점점 뜸하게 나온다. 진도는 이 브라우저에 저장된다.</p>
  <div id="cardArea"></div>
</section>

<section>
  <h2>일별 학습량</h2>
  <p class="note">최근 ${weeks}주. 진한 칸일수록 그날 남긴 프롬프트가 많다.</p>
  <div class="cal-scroll"><div class="cal">${calHtml}</div></div>
  <div class="legend"><span>적음</span>
    <span class="cell" style="background:var(--cell-empty)"></span>
    ${RAMP.map((c) => `<span class="cell" style="background:${c}"></span>`).join('')}
    <span>많음</span></div>
</section>

<section>
  <h2>표현 빈도</h2>
  <p class="note">반복해서 나온 표현일수록 실무에서 실제로 자주 쓰는 패턴이다. 상위 15개.</p>
  ${barsHtml || '<div class="empty">아직 표현이 없습니다</div>'}
</section>

<section>
  <h2>전체 기록</h2>
  <input id="search" placeholder="한국어·영어·표현으로 검색">
  <table><thead><tr><th>시각</th><th>원문</th><th>영어</th><th>표현</th></tr></thead>
  <tbody id="tbody">${tableHtml || '<tr><td colspan="4" class="empty">아직 기록이 없습니다</td></tr>'}</tbody></table>
</section>
</div>
<div id="tip"></div>

<script>
const CARDS = ${cardsJson};

// ── 플래시카드: Leitner 상자 ────────────────────────────────
// 맞히면 다음 상자로(간격이 길어짐), 틀리면 1번 상자로 돌아간다.
const KEY = 'en-coach-review-v1';
const INTERVAL_DAYS = [0, 1, 3, 7, 21];
let store = {};
try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

function due(c) {
  const s = store[c.p];
  if (!s) return true;
  const days = INTERVAL_DAYS[Math.min(s.box || 0, INTERVAL_DAYS.length - 1)];
  return Date.now() - (s.at || 0) >= days * 864e5;
}

let queue = [], cur = null, revealed = false;
function refill() { queue = CARDS.filter(due); }

function esc(s){const d=document.createElement('div');d.textContent=s==null?'':s;return d.innerHTML}

function render() {
  const el = document.getElementById('cardArea');
  if (!CARDS.length) { el.innerHTML = '<div class="empty">아직 카드가 없습니다</div>'; return; }
  if (!cur) {
    const total = CARDS.length, learned = CARDS.filter(c => (store[c.p]?.box || 0) >= 3).length;
    el.innerHTML = '<div class="card"><div class="q">복습할 카드가 없습니다</div>'
      + '<div class="hint">' + learned + ' / ' + total + ' 개가 익은 상태입니다. 시간이 지나면 다시 나옵니다.</div></div>'
      + '<div class="controls"><button class="act" onclick="resetAll()">진도 초기화</button>'
      + '<button class="act" onclick="cramAll()">전부 다시 보기</button></div>';
    return;
  }
  const c = cur;
  // 예문에서 표현을 가려 빈칸으로 만든다 — 문맥은 주되 답은 숨긴다
  let blanked = '';
  if (c.ex) {
    const core = c.p.replace(/~/g, '').trim().split(/\\s+/).filter(w => w.length > 2)[0];
    blanked = core ? c.ex.replace(new RegExp(core.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'ig'), '____') : c.ex;
  }
  const front = '<div class="card"><div class="q">' + esc(c.ko || '(뜻 없음)') + '</div>'
    + (blanked ? '<div class="hint">"' + esc(blanked) + '"</div>' : '')
    + '</div><div class="controls"><button class="act primary" onclick="reveal()">답 보기</button></div>';
  const back = '<div class="card"><div class="q">' + esc(c.ko || '') + '</div>'
    + '<div class="a">' + esc(c.p) + '</div>'
    + (c.ex ? '<div class="ex">"' + esc(c.ex) + '"</div>' : '')
    + (c.samples && c.samples[0]
        ? '<div class="src">내 프롬프트: ' + esc(c.samples[0].ko) + '<br>→ ' + esc(c.samples[0].en) + '</div>'
        : '')
    + '</div><div class="controls">'
    + '<button class="act" onclick="grade(0)">다시</button>'
    + '<button class="act primary" onclick="grade(1)">알았다</button></div>';
  el.innerHTML = (revealed ? back : front)
    + '<div class="progress">남은 카드 ' + (queue.length + 1) + ' · 총 ' + CARDS.length + '</div>';
}

function next() { cur = queue.shift() || null; revealed = false; render(); }
function reveal() { revealed = true; render(); }
function grade(ok) {
  const s = store[cur.p] || { box: 0 };
  s.box = ok ? Math.min((s.box || 0) + 1, INTERVAL_DAYS.length - 1) : 0;
  s.at = Date.now();
  store[cur.p] = s;
  save();
  if (!ok) queue.push(cur); // 틀린 건 이번 세션 안에서 다시 만난다
  next();
}
function resetAll() { store = {}; save(); refill(); next(); }
function cramAll() { queue = CARDS.slice(); next(); }

document.addEventListener('keydown', e => {
  if (e.key === ' ' && cur && !revealed) { e.preventDefault(); reveal(); }
  else if (revealed && (e.key === '1' || e.key === '2')) grade(e.key === '2' ? 1 : 0);
});

refill(); next();

// ── 히트맵 / 막대 툴팁 ──────────────────────────────────────
const tip = document.getElementById('tip');
function showTip(e, html) {
  tip.innerHTML = html; tip.style.opacity = '1';
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, e.clientX - r.width / 2)) + 'px';
  tip.style.top = Math.max(8, e.clientY - r.height - 10) + 'px';
}
document.querySelectorAll('.cell[data-d]').forEach(el => {
  const f = e => showTip(e, el.dataset.d + ' · ' + el.dataset.n + '건');
  el.addEventListener('mouseenter', f);
  el.addEventListener('mousemove', f);
  el.addEventListener('mouseleave', () => tip.style.opacity = '0');
});
document.querySelectorAll('.bar-row').forEach(el => {
  const f = e => showTip(e, esc(el.dataset.ko || el.querySelector('.bar-label').textContent));
  el.addEventListener('mouseenter', f);
  el.addEventListener('mousemove', f);
  el.addEventListener('mouseleave', () => tip.style.opacity = '0');
});

// ── 검색 ────────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#tbody tr').forEach(tr => {
    tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
});
</script>
</body></html>`;
}

// ── 실행 ──────────────────────────────────────────────────────

function openInBrowser(file) {
  const p = process.platform;
  try {
    if (p === 'win32') spawn('cmd.exe', ['/c', 'start', '', file], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    else if (p === 'darwin') spawn('open', [file], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [file], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch (e) {
    L.debug(`open failed: ${e.message}`);
    return false;
  }
}

function main() {
  const rows = L.readJsonl(L.P.log(), 8 * 1024 * 1024).filter((r) => r && r.t && r.en);
  rows.sort((a, b) => a.t - b.t);
  const a = analyze(rows);

  if (CHAT) {
    process.stdout.write(chatSummary(a) + '\n');
    return;
  }

  const out = path.join(L.dataDir(), 'review.html');
  fs.writeFileSync(out, buildHtml(a), 'utf8');

  process.stdout.write(chatSummary(a) + '\n\n');
  process.stdout.write(`리포트: ${out}\n`);
  if (!NO_OPEN && openInBrowser(out)) process.stdout.write('브라우저에서 열었습니다.\n');
}

try {
  main();
} catch (e) {
  process.stdout.write(`리포트를 만들지 못했습니다: ${e && e.message}\n`);
  process.exit(0);
}
