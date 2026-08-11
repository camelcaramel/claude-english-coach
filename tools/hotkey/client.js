#!/usr/bin/env node
'use strict';
/**
 * 핫키가 띄우는 짧은 프로세스. 데몬에 "가라"만 보내고 끝난다.
 *
 * 실제 일(클립보드·질의·토스트·적립)은 전부 데몬이 한다. 그래야 이 프로세스가
 * 20줄로 끝나서 핫키를 눌렀을 때 체감 시작 비용이 거의 0이 된다.
 *
 * 데몬이 죽어 있으면 띄운 뒤 다시 시도한다 — 사용자가 데몬 존재를 몰라도 되게.
 */

const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const PIPE = '\\\\.\\pipe\\en-coach';
const DAEMON = path.join(__dirname, 'daemon.js');

function send(cmd) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PIPE);
    let out = '';
    sock.on('connect', () => sock.write(cmd));
    sock.on('data', (d) => (out += d));
    sock.on('end', () => resolve(out));
    sock.on('error', reject);
  });
}

function startDaemon() {
  const logFile = path.join(__dirname, 'daemon.log');
  const fs = require('fs');
  const fd = fs.openSync(logFile, 'a');
  spawn(process.execPath, [DAEMON], {
    detached: true, stdio: ['ignore', fd, fd], windowsHide: true,
  }).unref();
}

(async () => {
  try {
    process.stdout.write(await send('go'));
  } catch (e) {
    // 데몬이 없다. 띄우고 준비될 때까지 짧게 기다린다.
    startDaemon();
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        await send('ping');
        process.stdout.write(await send('go'));
        return;
      } catch {}
    }
    const { toast } = require('./win');
    toast('en-coach', '데몬을 시작하지 못했습니다. daemon.log 를 확인하세요.');
    process.exitCode = 1;
  }
})();
