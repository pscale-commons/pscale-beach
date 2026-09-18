#!/usr/bin/env node
// smoke-tables.mjs — ?tables, the worlds played at a beach, end to end against
// a freshly-spawned local-beach. Self-contained: spawns its own beach.
//
//   node scripts/smoke-tables.mjs
//
// Proves: a world is listed once a room (a pool: block) of it is written, and
// not before; the newest room write leads and names its room; staged liquid
// and other blocks move nothing; the apex's own pools are not tables; a block
// whose name ends ':touched' never mints a phantom table; a world asked for
// tables beneath it answers 404; the plain index is unchanged.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = 8815;
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

const write = (world, block, val) => req('POST', `${world ? `/w/${world}` : ''}/.well-known/pscale-beach?block=${encodeURIComponent(block)}`, { spindle: '', content: { _: val } });
const tables = async () => (await req('GET', '/.well-known/pscale-beach?tables')).body?.tables;
const names = (t) => (t || []).map((r) => r.name).join(',');
const tick = () => new Promise((r) => setTimeout(r, 15));

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

async function ready() {
  for (let i = 0; i < 60; i++) {
    try { const r = await req('GET', '/.well-known/pscale-beach'); if (r.status < 500) return true; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const dir = await fs.mkdtemp(join(os.tmpdir(), 'tables-'));
const beach = spawn('node', [beachScript, '--dir', dir, '--port', String(port), '--origin', base], { stdio: ['ignore', 'ignore', 'ignore'] });
try {
  if (!await ready()) { console.error('local-beach did not start'); process.exit(2); }

  const empty = await req('GET', '/.well-known/pscale-beach?tables');
  ok(empty.status === 200 && Array.isArray(empty.body?.tables) && empty.body.tables.length === 0, 'an empty beach lists no tables');
  ok(typeof empty.body?._ === 'string' && empty.body?.origin === base && !!empty.body?.now, 'the answer is an envelope: _, origin, tables, now');

  await write('beta', 'passport:x', 'a character with no room yet');
  await write(null, 'pool:apex', 'the apex parlour');
  ok((await tables()).length === 0, 'a world with no room, and the apex’s own pool, are not tables');

  await write('alpha', 'pool:1', 'the first room'); await tick();
  await write('gamma', 'pool:gate', 'the lobby'); await tick();
  await write('gamma', 'pool:11', 'a room'); await tick();
  let t = await tables();
  ok(names(t) === 'gamma,alpha', `newest room write first (got ${names(t)})`);
  ok(t?.[0]?.room === 'pool:11' && t?.[1]?.room === 'pool:1', 'each row names the room its latest voice landed in');
  ok(t?.every((r) => typeof r.touched === 'string' && isFinite(Date.parse(r.touched))), 'each row carries when (touched)');

  await write('gamma', 'liquid:pool:11', 'staged, not said'); await tick();
  await write('alpha', 'note:touched', 'a block whose name ends like the key'); await tick();
  t = await tables();
  ok(names(t) === 'gamma,alpha' && t[0].room === 'pool:11', 'liquid and other blocks move nothing');
  ok(!t.some((r) => r.name.includes(':')), 'a block named *:touched mints no phantom table');

  await write('alpha', 'pool:2', 'the next room');
  t = await tables();
  ok(names(t) === 'alpha,gamma' && t[0].room === 'pool:2', 'a table rises when a room of it is written again');

  const beneath = await req('GET', '/w/alpha/.well-known/pscale-beach?tables');
  ok(beneath.status === 404, 'a world has no tables beneath it (404)');

  const index = await req('GET', '/.well-known/pscale-beach');
  ok(Array.isArray(index.body?.blocks) && index.body?.tables === undefined, 'the plain index is unchanged');
} finally {
  beach.kill();
  await fs.rm(dir, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
