'use strict';
/**
 * english-coach 공용 유틸.
 *
 * 불변 규칙: 이 파일의 어떤 함수도 예외를 밖으로 던지지 않는다.
 * 훅이 죽으면 개발이 멈추고, 그러면 이 플러그인은 이틀 만에 삭제된다.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 영속 데이터 디렉터리.
 * 설치된 플러그인에서는 ${CLAUDE_PLUGIN_DATA} = ~/.claude/plugins/data/{id}/ 로
 * 플러그인 업데이트를 넘어 살아남는다. ${CLAUDE_PLUGIN_ROOT} 는 업데이트마다
 * 경로가 바뀌므로 데이터를 절대 거기 두지 않는다.
 * 개발 중(플러그인 미설치)에는 환경변수가 없으므로 홈 밑으로 떨어뜨린다.
 */
function dataDir() {
  const d = process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.claude', 'en-coach');
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch {}
  return d;
}

const P = {
  log: () => path.join(dataDir(), 'log.jsonl'),
  pending: () => path.join(dataDir(), 'pending.jsonl'),
  state: () => path.join(dataDir(), 'state.json'),
  debug: () => path.join(dataDir(), 'debug.log'),
};

function debug(msg) {
  if (!process.env.EN_COACH_DEBUG) return;
  try {
    fs.appendFileSync(P.debug(), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function readInput() {
  try {
    return JSON.parse(readStdin());
  } catch {
    return {};
  }
}

function appendJsonl(file, obj) {
  try {
    fs.appendFileSync(file, JSON.stringify(obj) + '\n');
    return true;
  } catch (e) {
    debug(`appendJsonl failed ${file}: ${e.message}`);
    return false;
  }
}

/**
 * jsonl 을 읽어 파싱 가능한 줄만 돌려준다.
 * 파일이 커지면 뒤쪽 maxBytes 만 읽는다 — statusline 은 매 이벤트마다 돌기 때문에
 * 로그가 몇 MB 로 자라도 일정한 비용을 유지해야 한다.
 */
function readJsonl(file, maxBytes = 512 * 1024) {
  try {
    const size = fs.statSync(file).size;
    let text;
    if (size > maxBytes) {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(maxBytes);
      fs.readSync(fd, buf, 0, maxBytes, size - maxBytes);
      fs.closeSync(fd);
      // 앞쪽은 잘린 줄일 수 있으므로 버린다
      text = buf.toString('utf8').slice(buf.toString('utf8').indexOf('\n') + 1);
    } else {
      text = fs.readFileSync(file, 'utf8');
    }
    return text
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(P.state(), 'utf8'));
  } catch {
    return { mode: 'exposure' };
  }
}

/**
 * SRD §3.5 스킵 조건.
 * 해당하면 훅은 아무것도 하지 않고 즉시 통과시킨다.
 * 반환값은 스킵 사유(문자열) 또는 null.
 */
function skipReason(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) return 'empty';
  const p = prompt.trim();
  if (p.startsWith('/')) return 'slash-command';
  if (!/[가-힣]/.test(p)) return 'no-hangul';
  if (p.includes('```')) return 'code-block';
  if (p.length > 500) return 'too-long';
  if (p.length < 20) return 'too-short';
  return null;
}

/** 자식 `claude -p` 세션이 같은 훅을 다시 실행하는 무한 루프를 끊는다. */
function isChild() {
  return !!process.env.EN_COACH_CHILD;
}

/** 어떤 경로로도 작업을 막지 않는다. */
function passthrough() {
  process.exit(0);
}

module.exports = {
  dataDir, P, debug, readStdin, readInput,
  appendJsonl, readJsonl, readState, skipReason, isChild, passthrough,
};
