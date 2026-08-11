#!/usr/bin/env node
'use strict';
/** 데몬이 살아있는지 확인한다. `node ping.js` */
const net = require('net');
const s = net.connect('\\\\.\\pipe\\en-coach');
let out = '';
s.on('connect', () => s.write('ping'));
s.on('data', (d) => (out += d));
s.on('end', () => { console.log(out || '(빈 응답)'); process.exit(out === 'pong' ? 0 : 1); });
s.on('error', (e) => { console.log('연결 실패:', e.code); process.exit(1); });
