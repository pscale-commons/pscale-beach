#!/usr/bin/env node
// smoke-subbeach.mjs — assert Host-derived sub-beach isolation against a running
// local-beach. Uses raw http so the Host header can be overridden (global fetch
// pins Host). Start a FRESH (empty) beach first:
//   node scripts/local-beach.mjs --dir /tmp/sb --port 8799 --origin base.test &
//   node scripts/smoke-subbeach.mjs --port 8799 --base base.test
//
// Proves: same block name in <base>, sub1.<base>, sub2.<base> stays isolated;
// locks are origin-salted (each sub verifies its own secret); wiping one sub
// leaves the others intact; the apex base behaves as an ordinary beach.

import http from 'node:http';

const A = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const port = parseInt(A('port', '8799'), 10);
const base = A('base', 'base.test');

function req(method, host, query, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: '127.0.0.1', port, method,
      path: `/.well-known/pscale-beach${query}`,
      headers: { Host: host, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
    }, (resp) => {
      let b = '';
      resp.on('data', (c) => (b += c));
      resp.on('end', () => resolve({ status: resp.statusCode, body: b ? JSON.parse(b) : null }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const W = (host, val, lock) => req('POST', host, '?block=demo', { spindle: '', content: { _: val }, ...(lock ? { new_lock: lock } : {}) });
const R = (host) => req('GET', host, '?block=demo');

await W(base, 'BASE');
await W('sub1.' + base, 'SUB1', 'S');
await W('sub2.' + base, 'SUB2', 'S');

ok((await R(base)).body?._ === 'BASE', 'base namespace isolated');
ok((await R('sub1.' + base)).body?._ === 'SUB1', 'sub1 namespace isolated');
ok((await R('sub2.' + base)).body?._ === 'SUB2', 'sub2 namespace isolated');
ok((await req('POST', 'sub1.' + base, '?block=demo', { spindle: '', content: { _: 'x' }, confirm: true, secret: 'WRONG' })).status === 403, 'sub1 lock rejects wrong secret (origin-salted)');
ok((await req('POST', 'sub1.' + base, '?block=demo', { spindle: '', content: { _: 'SUB1v2' }, confirm: true, secret: 'S' })).status === 200, 'sub1 lock accepts right secret');
await req('DELETE', 'sub1.' + base, '?block=demo', { confirm: true, secret: 'S' });
ok((await R('sub1.' + base)).status === 404, 'wipe sub1 → gone');
ok((await R('sub2.' + base)).body?._ === 'SUB2', 'sub2 survives sub1 wipe');
ok((await R(base)).body?._ === 'BASE', 'base survives sub1 wipe');

console.log(fails ? `\n${fails} FAILED` : '\nsub-beach isolation: all pass ✓');
process.exit(fails ? 1 : 0);
