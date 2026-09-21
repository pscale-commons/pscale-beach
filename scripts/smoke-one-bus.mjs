#!/usr/bin/env node
// smoke-one-bus.mjs — one bus per deploy, declared by its owner. End to end against the REAL
// handler on a temp folder; local http listeners stand in for the far ends. No Upstash.
//
//   node scripts/smoke-one-bus.mjs
//
// The shared secret (POOL_WEBHOOK_SECRET) rides to whatever URL the webhook declaration names,
// so WHOSE declaration is heard is the whole question. Proves: a world's own settings is never
// heard, however it is latched — a /w/<world> is free for any hand to mint; an apex settings
// block with an open root is not heard either; with the apex root latched the owner's bus rings
// for an apex pool AND for a pool in any world, the event naming the pool's true origin; and the
// secret reaches the owner's bus and nobody else.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

const APEX = 'base.test';
process.env.BEACH_ORIGIN = APEX;
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';
process.env.POOL_WEBHOOK_SECRET = 'the-shared-secret';

const { FileRedis } = await import('./file-redis.mjs');
const { makeDoor, surface } = await import('./set-aside.mjs');

let failed = 0;
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`);
  if (!cond) failed++;
}

const heard = { owner: [], stranger: [] };
function listener(who) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        let body = null; try { body = JSON.parse(raw); } catch { /* not json */ }
        heard[who].push({ secret: req.headers['x-pool-webhook-secret'] ?? null, origin: body?.origin ?? null, pool: body?.pool ?? null });
        res.end('ok');
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
const ownerSrv = await listener('owner');
const strangerSrv = await listener('stranger');
const OWNER_URL = `http://127.0.0.1:${ownerSrv.address().port}/event`;
const STRANGER_URL = `http://127.0.0.1:${strangerSrv.address().port}/event`;

// The handler caches its declaration for a minute, so each scenario gets a fresh module
// instance (a cache-busting query on the import) over its own folder.
let n = 0;
async function beach() {
  const dir = await fs.mkdtemp(join(os.tmpdir(), 'smoke-one-bus-'));
  const mod = await import(`../api/pscale-beach.js?fresh=${++n}`);
  mod.__setRedis(new FileRedis(dir));
  const at = (where) => makeDoor(mod.default, surface(where, APEX));
  return { dir, apex: at(null), world: at(`${APEX}/w/anyone`), table: at(`${APEX}/w/a-table`) };
}
const voice = (door, block = 'pool:room') => door('POST', block, { append: true, content: { _: 'a voice', 1: 'someone' } });
const reset = () => { heard.owner.length = 0; heard.stranger.length = 0; };

console.log("a stranger mints a world and declares a bus of their own");
{
  const b = await beach();
  await b.apex('POST', 'settings', { content: { _: 'apex settings', 6: `pool_append_webhook=${OWNER_URL}` }, new_lock: 'owner-key' });
  const minted = await b.world('POST', 'settings', { content: { _: 'mine', 1: `pool_append_webhook=${STRANGER_URL}` }, new_lock: 'strangers-own-key' });
  ok(minted.status === 200, "the world and its settings are theirs to mint, latched under their own key");
  reset();
  await voice(b.world);
  ok(heard.stranger.length === 0, "their declaration is never heard — the secret goes nowhere of theirs");
  ok(heard.owner.length === 1 && heard.owner[0].secret === 'the-shared-secret', "the voice in their world rings the OWNER's bus instead");
  ok(heard.owner[0]?.origin === `${APEX}/w/anyone` && heard.owner[0]?.pool === 'pool:room', "and the event names the pool's true origin");
  await fs.rm(b.dir, { recursive: true, force: true });
}

console.log("the owner's bus, the apex root latched");
{
  const b = await beach();
  await b.apex('POST', 'settings', { content: { _: 'apex settings', 6: `pool_append_webhook=${OWNER_URL}` }, new_lock: 'owner-key' });
  reset();
  await voice(b.apex);
  ok(heard.owner.length === 1 && heard.owner[0].origin === APEX, 'rings for a pool at the apex');
  await voice(b.table, 'pool:the-common-room');
  ok(heard.owner.length === 2 && heard.owner[1].origin === `${APEX}/w/a-table` && heard.owner[1].pool === 'pool:the-common-room',
    'rings for a pool in a world that carries no settings of its own');
  await b.apex('POST', 'liquid:pool:room', { append: true, content: { _: 'a stage' } });
  ok(heard.owner.length === 2, 'a liquid stage is not a landed voice, as before');
  ok(heard.stranger.length === 0, 'and nothing reaches anyone else');
  await fs.rm(b.dir, { recursive: true, force: true });
}

console.log('an apex settings block with an open root');
{
  const b = await beach();
  await b.apex('POST', 'settings', { content: { _: 'apex settings', 6: `pool_append_webhook=${OWNER_URL}` } });
  await b.apex('POST', 'settings', { spindle: '6', new_lock: 'owner-key' });   // the line's own position latched, the root open
  await b.apex('POST', 'settings', { spindle: '1', content: `pool_append_webhook=${STRANGER_URL}` });
  reset();
  await voice(b.apex);
  ok(heard.stranger.length === 0, "a stranger's line at a lower open position is not heard");
  ok(heard.owner.length === 0, "nor is the owner's, until the root is latched — quiet, rather than ringing for someone else");
  await fs.rm(b.dir, { recursive: true, force: true });
}

ownerSrv.close(); strangerSrv.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
