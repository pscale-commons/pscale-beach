#!/usr/bin/env node
// smoke-world-routes.mjs — path-based world routes: isolation + origin-salted
// locks, both the ?world= query form and the /w/<world>/ path form, end to end
// against a freshly-spawned local-beach. Self-contained: spawns its own beach.
//
//   node scripts/smoke-world-routes.mjs
//
// Proves: <base>/w/alpha, <base>/w/beta and the apex <base> stay fully isolated;
// the query form (?world=alpha) and the path form (/w/alpha/.well-known/...)
// reach the SAME namespace; locks are per-world salted (each world verifies its
// own secret); a world name with an illegal char folds to the apex, never
// injects a namespace; the apex is byte-for-byte unchanged by world writes.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = 8814;
const base = 'base.test';
const beachScript = fileURLToPath(new URL('./local-beach.mjs', import.meta.url));

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: '127.0.0.1', port, method, path,
      headers: { Host: base, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
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

// Query form: ?world=<w>. Path form: /w/<w>/.well-known/pscale-beach.
const qWrite = (w, val, lock) => req('POST', `/.well-known/pscale-beach?world=${w}&block=demo`, { spindle: '', content: { _: val }, ...(lock ? { new_lock: lock } : {}) });
const qRead = (w) => req('GET', `/.well-known/pscale-beach?world=${w}&block=demo`);
const pWrite = (w, val) => req('POST', `/w/${w}/.well-known/pscale-beach?block=demo`, { spindle: '', content: { _: val } });
const pRead = (w) => req('GET', `/w/${w}/.well-known/pscale-beach?block=demo`);
const apexWrite = (val) => req('POST', `/.well-known/pscale-beach?block=demo`, { spindle: '', content: { _: val } });
const apexRead = () => req('GET', `/.well-known/pscale-beach?block=demo`);

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

async function ready() {
  for (let i = 0; i < 60; i++) {
    try { const r = await req('GET', '/.well-known/pscale-beach'); if (r.status < 500) return true; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const dir = await fs.mkdtemp(join(os.tmpdir(), 'wroutes-'));
const beach = spawn('node', [beachScript, '--dir', dir, '--port', String(port), '--origin', base], { stdio: ['ignore', 'ignore', 'ignore'] });
try {
  if (!await ready()) { console.error('local-beach did not start'); process.exit(2); }

  await apexWrite('APEX');
  await qWrite('alpha', 'ALPHA', 'SA');
  await qWrite('beta', 'BETA', 'SB');

  ok((await qRead('alpha')).body?._ === 'ALPHA', 'world alpha isolated (query form)');
  ok((await qRead('beta')).body?._ === 'BETA', 'world beta isolated (query form)');
  ok((await apexRead()).body?._ === 'APEX', 'apex isolated from worlds');
  ok((await qRead('alpha')).body?._ !== (await qRead('beta')).body?._, 'alpha and beta do not share blocks');

  // Path form reaches the SAME namespace as the query form.
  ok((await pRead('alpha')).body?._ === 'ALPHA', 'path form reads the query-form namespace');
  // Write an UNLOCKED block via the path form; read it via the query form.
  await req('POST', `/w/alpha/.well-known/pscale-beach?block=viapath`, { spindle: '', content: { _: 'PATHWROTE' } });
  ok((await req('GET', `/.well-known/pscale-beach?world=alpha&block=viapath`)).body?._ === 'PATHWROTE', 'path-form write is seen by the query form (same world)');
  ok((await req('GET', `/.well-known/pscale-beach?world=beta&block=viapath`)).status === 404, 'that write did NOT leak into beta');

  // Per-world lock salt.
  ok((await req('POST', `/.well-known/pscale-beach?world=alpha&block=demo`, { spindle: '', content: { _: 'x' }, confirm: true, secret: 'WRONG' })).status === 403, 'alpha lock rejects wrong secret (per-world salt)');
  ok((await req('POST', `/.well-known/pscale-beach?world=alpha&block=demo`, { spindle: '', content: { _: 'ALPHA3' }, confirm: true, secret: 'SA' })).status === 200, 'alpha lock accepts its own secret');
  ok((await req('POST', `/.well-known/pscale-beach?world=beta&block=demo`, { spindle: '', content: { _: 'y' }, confirm: true, secret: 'SA' })).status === 403, "alpha's secret does NOT unlock beta (separate salt)");

  // Illegal world name folds to the apex — never injects a namespace separator.
  const bad = await req('GET', `/.well-known/pscale-beach?world=alpha:evil&block=demo`);
  ok(bad.body?._ === 'APEX', 'illegal world name (colon) folds to apex, no injection');
  const badPath = await req('GET', `/.well-known/pscale-beach?world=../beta&block=demo`);
  ok(badPath.body?._ === 'APEX', 'illegal world name (slash/dots) folds to apex');

  // Apex still intact after all world traffic.
  ok((await apexRead()).body?._ === 'APEX', 'apex survives all world writes byte-for-byte');

  console.log(fails ? `\n${fails} FAILED` : '\nworld-route isolation: all pass ✓');
} finally {
  beach.kill();
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}
process.exit(fails ? 1 : 0);
