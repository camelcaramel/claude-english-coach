'use strict';
/**
 * Windows 연동 — 클립보드와 토스트 알림.
 *
 * 네이티브 모듈을 쓰지 않는다. PowerShell 을 거치면 추가 의존성 없이 되고,
 * 어차피 한 번 호출에 3초를 기다리므로 300ms 왕복은 묻힌다.
 *
 * 문자열은 반드시 base64 로 감싸서 넘긴다. 그냥 넘기면 콘솔 코드페이지 때문에
 * 한글과 이모지가 깨진다 — 실측으로 확인했다.
 */

const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');

const PS = ['powershell', '-NoProfile', '-NonInteractive'];
const TOAST_PS1 = path.join(__dirname, 'toast.ps1');

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');

function readClipboard() {
  return new Promise((resolve) => {
    execFile(
      PS[0],
      [...PS.slice(1), '-Command',
        "[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Clipboard -Raw)))"],
      { encoding: 'utf8', timeout: 10000 },
      (err, stdout) => {
        if (err) return resolve('');
        try { resolve(Buffer.from(String(stdout).trim(), 'base64').toString('utf8')); }
        catch { resolve(''); }
      }
    );
  });
}

function writeClipboard(text) {
  return new Promise((resolve) => {
    execFile(
      PS[0],
      [...PS.slice(1), '-Command',
        `Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(text)}')))`],
      { timeout: 10000 },
      () => resolve()
    );
  });
}

/** 알림은 결과 통보일 뿐이라 기다리지 않는다. 실패해도 무시한다. */
function toast(title, body) {
  try {
    spawn(PS[0], [...PS.slice(1), '-ExecutionPolicy', 'Bypass', '-File', TOAST_PS1,
      '-TitleB64', b64(title), '-BodyB64', b64(body)],
      { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {}
}

module.exports = { readClipboard, writeClipboard, toast, b64 };
