'use strict';
/**
 * 설치된 플러그인의 데이터 디렉터리를 찾아 CLAUDE_PLUGIN_DATA 에 심는다.
 *
 * 이 도구는 훅이 아니라 독립 프로세스라 ${CLAUDE_PLUGIN_DATA} 가 주입되지 않는다.
 * 그대로 두면 lib 이 개발용 폴백(~/.claude/en-coach)을 쓰고, 여기서 쌓은 기록이
 * /en-review 에 안 잡힌다. 같은 함정에 세 번 걸렸으므로 여기서는 먼저 해결한다.
 *
 * lib 을 require 하기 전에 호출해야 한다.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = function resolveDataDir() {
  if (process.env.CLAUDE_PLUGIN_DATA) return process.env.CLAUDE_PLUGIN_DATA;

  const root = path.join(os.homedir(), '.claude', 'plugins', 'data');
  try {
    // english-coach-<marketplace> 형태. 마켓플레이스 이름은 설치에 따라 다르다.
    const hit = fs.readdirSync(root).find((d) => d.startsWith('english-coach-'));
    if (hit) {
      process.env.CLAUDE_PLUGIN_DATA = path.join(root, hit);
      return process.env.CLAUDE_PLUGIN_DATA;
    }
  } catch {}

  // 플러그인이 설치돼 있지 않으면 lib 의 폴백을 그대로 쓴다.
  return null;
};
