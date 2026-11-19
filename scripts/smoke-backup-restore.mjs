#!/usr/bin/env node
// smoke-backup-restore.mjs — a backup and a restore put the beach back as it was, hashes included.
// End to end on this computer: a stand-in for Upstash's REST API (the commands the handler, the
// backup and the restore send), the REAL handler writing the beach, the REAL scripts/beach-backup.sh
// (bash + curl + jq) reading it, and the REAL scripts/beach-restore.mjs (the Upstash client) putting
// it back. Self-contained: no network, no Upstash.
//
//   node scripts/smoke-backup-restore.mjs        (needs bash, curl and jq, as the backup does)
//
// Beside its blocks and locks the beach keeps three hashes per surface: touched, born and sizes.
// MGET reads strings only, so a backup that read every key with it kept nil for each hash, and a
// restore that wrote nil back turned the hash into the string "null" — after which the beach could
// stamp nothing (an HSET on a string fails, and the stamp fails silently by design). This proves:
// - the backup reads every hash whole, and keeps no nil;
// - a restore into an empty store puts back every key as it was: strings byte for byte, hashes as
//   hashes, field for field — and the beach stamps again afterwards;
// - a snapshot from an older backup (nil where each hash was) restores without writing "null";
// - --only restores only what it names, and a dry run writes nothing.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APEX = 'base.test';
const TOKEN = 'smoke-token';
process.env.BEACH_ORIGIN = APEX;

// ── the stand-in: Upstash's REST API over an in-memory store ──
// key → { type: 'string', value } | { type: 'hash', value: { field: value } }; every value a string,
// as Redis keeps it. Replies are base64 when the client asks (Upstash-Encoding), as Upstash's are.
let store = new Map();
const err = (m) => { throw Object.assign(new Error(m), { redis: true }); };
const WRONG = 'WRONGTYPE Operation against a key holding the wrong kind of value';
const glob = (p) => new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
const str = (k) => { const e = store.get(k); if (e && e.type !== 'string') err(WRONG); return e ? e.value : null; };
const hash = (k, make) => {
  const e = store.get(k);
  if (e && e.type !== 'hash') err(WRONG);
  if (!e && make) { const n = { type: 'hash', value: {} }; store.set(k, n); return n.value; }
  return e ? e.value : null;
};
function run([cmd, ...a]) {
  a = a.map(String);
  switch (String(cmd).toUpperCase()) {
    case 'PING': return 'PONG';
    case 'GET': return str(a[0]);
    case 'MGET': return a.map((k) => { const e = store.get(k); return e && e.type === 'string' ? e.value : null; });
    case 'SET': {
      const [k, v, ...opt] = a, up = opt.map((o) => o.toUpperCase());
      if (up.includes('NX') && store.has(k)) return null;
      if (up.includes('XX') && !store.has(k)) return null;
      store.set(k, { type: 'string', value: v });
      return 'OK';
    }
    case 'DEL': return a.reduce((n, k) => n + (store.delete(k) ? 1 : 0), 0);
    case 'EXISTS': return a.filter((k) => store.has(k)).length;
    case 'TYPE': return store.has(a[0]) ? store.get(a[0]).type : 'none';
    case 'KEYS': return [...store.keys()].filter((k) => glob(a[0]).test(k));
    case 'SCAN': {
      const i = a.findIndex((x) => x.toUpperCase() === 'MATCH');
      const re = glob(i >= 0 ? a[i + 1] : '*');
      return ['0', [...store.keys()].filter((k) => re.test(k))];
    }
    case 'STRLEN': { const v = str(a[0]); return v == null ? 0 : Buffer.byteLength(v); }
    case 'INCR': { const n = (Number(str(a[0])) || 0) + 1; store.set(a[0], { type: 'string', value: String(n) }); return n; }
    case 'EXPIRE': case 'PEXPIRE': return store.has(a[0]) ? 1 : 0;
    case 'TTL': case 'PTTL': return store.has(a[0]) ? -1 : -2;
    case 'HSET': {
      const h = hash(a[0], true);
      let added = 0;
      for (let i = 1; i < a.length; i += 2) { if (!(a[i] in h)) added++; h[a[i]] = a[i + 1]; }
      return added;
    }
    case 'HGETALL': { const h = hash(a[0], false) || {}; return Object.entries(h).flat(); }
    case 'HDEL': {
      const h = hash(a[0], false);
      if (!h) return 0;
      let n = 0;
      for (const f of a.slice(1)) if (f in h) { delete h[f]; n++; }
      if (!Object.keys(h).length) store.delete(a[0]);
      return n;
    }
    default: return err(`ERR the stand-in does not know ${cmd}`);
  }
}
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const encode = (v) => (typeof v === 'string' ? (v === 'OK' ? v : b64(v))
  : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? b64(x) : Array.isArray(x) ? encode(x) : x)) : v);
const answer = (c, base64) => {
  try { const r = run(c); return { result: base64 ? encode(r) : r }; }
  catch (e) { if (e.redis) return { error: e.message }; throw e; }
};
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); return res.end('{"error":"Unauthorized"}'); }
    const base64 = String(req.headers['upstash-encoding'] || '').toLowerCase() === 'base64';
    const cmds = JSON.parse(body || '[]');
    const many = /\/(pipeline|multi-exec)\/?$/.test(req.url);
    const out = many ? cmds.map((c) => answer(c, base64)) : answer(cmds, base64);
    res.writeHead(!many && out.error ? 400 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}`;
process.env.KV_REST_API_URL = URL_;
process.env.KV_REST_API_TOKEN = TOKEN;

let failed = 0;
function ok(cond, label, detail) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}` + (cond || detail === undefined ? '' : `  ${JSON.stringify(detail).slice(0, 400)}`));
  if (!cond) failed++;
}
const copy = () => new Map([...store].map(([k, e]) => [k, { type: e.type, value: e.type === 'hash' ? { ...e.value } : e.value }]));
const same = (a, b) => JSON.stringify([...a].sort(([x], [y]) => (x < y ? -1 : 1))) === JSON.stringify([...b].sort(([x], [y]) => (x < y ? -1 : 1)));
const hashKeys = (m) => [...m].filter(([, e]) => e.type === 'hash').map(([k]) => k).sort();
const tmp = await fs.mkdtemp(join(os.tmpdir(), 'smoke-backup-restore-'));
// spawned, never spawnSync: the stand-in answers on this process's own loop
const sh = (args, env = {}) => new Promise((done) => {
  const c = spawn(args[0], args.slice(1), { cwd: join(HERE, '..'), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  c.stdout.on('data', (d) => { stdout += d; });
  c.stderr.on('data', (d) => { stderr += d; });
  c.on('close', (status) => done({ status, stdout, stderr }));
});
const restore = (...args) => sh(['node', join(HERE, 'beach-restore.mjs'), ...args]);

// ── the beach, written by the real handler through the real client ──
const { Redis } = await import('@upstash/redis');
const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
const { makeDoor, surface } = await import('./set-aside.mjs');
__setRedis(new Redis({ url: URL_, token: TOKEN }));
const door = makeDoor(handler, surface(null, APEX));
const world = makeDoor(handler, surface(`${APEX}/w/thornwood`, APEX));
const said = [];
const write = async (d, ...a) => { const r = await d(...a); said.push(r.status); return r; };
await write(door, 'POST', 'shell:whole', { content: { _: 'a shell — with a line in Ελληνικά and an emoji 🌊', 1: 'one' } });
await write(door, 'POST', 'passport:sam', { content: { _: 'sam, latched' }, new_lock: 'sams-own-words' });
await write(door, 'POST', 'pool:welcome', { append: true, content: { _: 'first voice', 1: 'sam', 3: '2026-10-17T09:00:00.000Z' } });
await write(door, 'POST', 'pool:welcome', { append: true, content: { _: 'second voice', 1: 'ren', 3: '2026-10-17T09:01:00.000Z' } });
await write(world, 'POST', 'pool:room', { append: true, content: { _: 'a voice at the table', 1: 'kit' } });
await door('GET', ''); await world('GET', '');   // the index weighs, so the sizes hashes stand too
const before = copy();
console.log('the beach as the handler wrote it');
ok(said.every((s) => s === 200), 'every write landed', said);
ok(['touched', 'born', 'sizes'].every((h) => hashKeys(before).includes(`pscale-beach-v2:${APEX}:${h}`)) &&
  hashKeys(before).includes(`pscale-beach-v2:${APEX}/w/thornwood:touched`), 'touched, born and sizes stand as hashes, for the apex and for the world', hashKeys(before));

console.log('\nthe backup');
const out = join(tmp, 'out');
const split = join(tmp, 'split');
const b = await sh(['bash', join(HERE, 'beach-backup.sh')], { OUT: out, SPLIT: split });
ok(b.status === 0, 'beach-backup.sh runs clean', b.stderr || b.stdout);
const snap = JSON.parse(await fs.readFile(join(out, 'beach-latest.json'), 'utf8'));
const nils = Object.entries(snap.data || {}).filter(([, v]) => v == null).map(([k]) => k);
ok(nils.length === 0, 'it keeps no nil for any key', nils);
ok(hashKeys(before).every((k) => JSON.stringify(snap.hashes?.[k]) === JSON.stringify(before.get(k).value)),
  'it keeps every hash whole, field for field', { want: hashKeys(before), got: Object.keys(snap.hashes || {}) });
ok(snap.meta?.key_count === before.size, 'its count is every key on the beach', { meta: snap.meta, keys: before.size });
const blocks = [...before.keys()].filter((k) => k.includes(':block:'));
const mirrored = [];
for (const k of blocks) {
  const origin = k.slice('pscale-beach-v2:'.length, k.indexOf(':block:')), name = k.slice(k.indexOf(':block:') + ':block:'.length);
  try { mirrored.push(JSON.stringify(JSON.parse(await fs.readFile(join(split, origin, encodeURIComponent(name) + '.json'), 'utf8'))) === before.get(k).value); }
  catch { mirrored.push(false); }
}
ok(blocks.length > 0 && mirrored.every(Boolean), 'its per-block mirror (SPLIT) still holds every block, no hash among them', mirrored);

console.log('\na restore into an empty store');
store = new Map();
const dry = await restore('--in', join(out, 'beach-latest.json'));
ok(dry.status === 0 && store.size === 0, 'a dry run writes nothing', dry.stderr);
const r = await restore('--in', join(out, 'beach-latest.json'), '--confirm');
ok(r.status === 0, 'beach-restore.mjs --confirm runs clean', r.stderr);
ok(same(store, before), 'every key comes back as it was: strings byte for byte, hashes as hashes, field for field',
  [...store].filter(([k, e]) => JSON.stringify(e) !== JSON.stringify(before.get(k))).map(([k, e]) => [k, e.type]));
await write(door, 'POST', 'shell:whole', { spindle: '2', content: 'written after the restore' });
ok(said.at(-1) === 200 && store.get(`pscale-beach-v2:${APEX}:touched`)?.type === 'hash' &&
  store.get(`pscale-beach-v2:${APEX}:touched`).value['shell:whole'] !== before.get(`pscale-beach-v2:${APEX}:touched`).value['shell:whole'],
  'and the beach stamps again: a write after the restore moves its touched stamp');

console.log('\na snapshot from an older backup (nil where each hash was)');
const old = { meta: snap.meta, data: { ...snap.data } };
for (const k of hashKeys(before)) old.data[k] = null;
await fs.writeFile(join(tmp, 'old.json'), JSON.stringify(old));
const standing = copy();
const r2 = await restore('--in', join(tmp, 'old.json'), '--confirm');
ok(r2.status === 0 && hashKeys(before).every((k) => store.get(k)?.type === 'hash'), 'restored over a live beach, its hashes stay hashes', r2.stderr);
ok([...store.values()].every((e) => e.value !== 'null'), 'no key is ever written as the string "null"');
ok(hashKeys(before).every((k) => JSON.stringify(store.get(k).value) === JSON.stringify(standing.get(k).value)), '…and the stamps standing are left as they are');
store = new Map();
const r3 = await restore('--in', join(tmp, 'old.json'), '--confirm');
ok(r3.status === 0 && hashKeys(before).every((k) => !store.has(k)) && store.size === before.size - hashKeys(before).length,
  'into an empty store it puts back every string, and leaves the hashes for the beach to stamp anew');
ok(/no value/.test(r3.stderr), 'and it says which keys it held no value for', r3.stderr);

console.log('\n--only');
store = new Map();
const r4 = await restore('--in', join(out, 'beach-latest.json'), '--only', '/w/thornwood', '--confirm');
const want = [...before.keys()].filter((k) => k.includes('/w/thornwood'));
ok(r4.status === 0 && store.size === want.length && want.every((k) => JSON.stringify(store.get(k)) === JSON.stringify(before.get(k))),
  'it restores only the keys it names, hashes among them', { want, got: [...store.keys()] });

server.close();
await fs.rm(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall held');
process.exit(failed ? 1 : 0);
