#!/usr/bin/env node
'use strict';
/**
 * SessionStart 훅 — statusline 스크립트를 안정 경로로 복사한다.
 *
 * 왜 필요한가:
 *   플러그인은 statusLine 을 직접 등록할 수 없다. 플러그인 settings.json 은
 *   `agent` 와 `subagentStatusLine` 키만 지원한다. 그래서 사용자가
 *   ~/.claude/settings.json 에 직접 경로를 박아야 하는데,
 *   ${CLAUDE_PLUGIN_ROOT} 는 플러그인 업데이트마다 경로가 바뀐다.
 *
 * 해결:
 *   업데이트를 넘어 살아남는 ${CLAUDE_PLUGIN_DATA}/bin/ 으로 매 세션 복사한다.
 *   사용자 설정은 그 안정 경로만 가리키면 되고, 플러그인이 업데이트돼도
 *   다음 세션 시작 때 자동으로 최신 스크립트가 그 자리에 놓인다.
 */

const fs = require('fs');
const path = require('path');
const L = require('./lib');

try {
  const binDir = path.join(L.dataDir(), 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  for (const f of ['statusline.js', 'lib.js']) {
    const src = path.join(__dirname, f);
    const dst = path.join(binDir, f);
    const next = fs.readFileSync(src);
    let same = false;
    try {
      same = fs.readFileSync(dst).equals(next);
    } catch {}
    if (!same) fs.writeFileSync(dst, next);
  }
  L.debug('statusline installed to ' + binDir);
} catch (e) {
  L.debug(`install-statusline failed: ${e && e.message}`);
}

process.exit(0);
