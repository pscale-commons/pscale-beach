#!/usr/bin/env node
// smoke-caps.mjs — settings steer the door only from behind a root latch, and the three
// caps. End to end against the REAL handler on a temp folder; a local http listener stands
// in for the webhook's far end. Self-contained: no Upstash.
//
//   node scripts/smoke-caps.mjs
//
// SETTINGS BEHIND A LATCH. The shape this closes: a settings block latched at ONE digit, the
// webhook line at that digit, the reader taking the first match in key order — so a keyless
// write at a lower open position redirects every pool append, the shared secret riding the
// header, to a stranger. Proved here as the attack itself: with the
// root open NOTHING is heard (not the stranger's line, not the owner's); with the root
// latched the owner's line is heard and the stranger's write is refused at the door.
//
// THE CAPS. Off by env: nothing is refused and no counter is touched. On: a births-per-hour
// cap refuses the next new block and leaves every standing block writing as ever; an
// appends-per-minute cap refuses one unlatched board and no other; a write-bytes cap refuses
// a large unlatched write; and a latch-holder is never throttled by any of them.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

const APEX = 'base.test';
process.env.BEACH_ORIGIN = APEX;
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';
process.env.POOL_WEBHOOK_SECRET = 'the-shared-secret';
process.env.BEACH_CAPS = process.argv.includes('--caps-off') ? '' : 'on';

const { FileRedis } = await import('./file-redis.mjs');
const { makeDoor, surface } = await import('./set-aside.mjs');

let failed = 0;
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`);
  if (!cond) failed++;
}

// Two far ends: the owner's bus, and a stranger's listener.
const heard = { owner: [], stranger: [] };
function listener(who) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      heard[who].push(req.headers['x-pool-webhook-secret'] ?? null);
      res.end('ok');
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
const ownerSrv = await listener('owner');
const strangerSrv = await listener('stranger');
const OWNER_URL = `http://127.0.0.1:${ownerSrv.address().port}/event`;
const STRANGER_URL = `http://127.0.0.1:${strangerSrv.address().port}/event`;

// The handler caches its settings read for a minute per origin, so each scenario gets a
// fresh module instance (a cache-busting query on the import) over its own folder.
let n = 0;
async function beach() {
  const dir = await fs.mkdtemp(join(os.tmpdir(), 'smoke-caps-'));
  const mod = await import(`../api/pscale-beach.js?fresh=${++n}`);
  const redis = new FileRedis(dir);
  mod.__setRedis(redis);
  return { dir, redis, door: makeDoor(mod.default, surface(null, APEX)) };
}
const voice = (door, block = 'pool:room') => door('POST', block, { append: true, content: { _: 'a voice', 1: 'someone' } });

console.log('settings latched at ONE digit, its root open');
{
  const { door, dir } = await beach();
  await door('POST', 'settings', { content: { _: 'Per-beach settings.', 1: { _: 'Vapour subsystem.' }, 6: `pool_append_webhook=${OWNER_URL} — the bus` } });
  await door('POST', 'settings', { spindle: '6', new_lock: 'owner-key' });
  const attack = await door('POST', 'settings', { spindle: '1', content: { _: `pool_append_webhook=${STRANGER_URL}` } });
  ok(attack.status === 200, 'a stranger CAN write a webhook line at the open position below it');
  await voice(door);
  ok(heard.stranger.length === 0, 'and is not heard — the secret goes nowhere');
  ok(heard.owner.length === 0, 'nor is the owner, until the root is latched: the bus goes quiet rather than ringing for someone else');
  await fs.rm(dir, { recursive: true, force: true });
}

console.log('the same block, its root latched');
{
  const { door, dir } = await beach();
  await door('POST', 'settings', { content: { _: 'Per-beach settings.', 1: { _: 'Vapour subsystem.' }, 6: `pool_append_webhook=${OWNER_URL} — the bus` }, new_lock: 'owner-key' });
  const attack = await door('POST', 'settings', { spindle: '1', content: { _: `pool_append_webhook=${STRANGER_URL}` } });
  ok(attack.status === 403, "the stranger's write is refused at the door — the root's latch binds every position");
  ok((await door('POST', 'settings', { content: { _: 'replaced' }, confirm: true })).status === 403, 'and so is a whole-block replace');
  await voice(door);
  ok(heard.owner.length === 1 && heard.owner[0] === 'the-shared-secret', "the owner's line is heard, and the secret rides to the owner's bus");
  ok(heard.stranger.length === 0, 'and to nobody else');
  await fs.rm(dir, { recursive: true, force: true });
}

const capsOn = process.env.BEACH_CAPS === 'on';
const SETTINGS = { _: 'Per-beach settings.', 1: 'cap_births_per_hour=3', 2: 'cap_appends_per_minute=2', 3: 'cap_write_bytes=200' };

if (!capsOn) {
  console.log('the caps, env off — nothing is refused and nothing is counted');
  const { door, dir, redis } = await beach();
  await door('POST', 'settings', { content: SETTINGS, new_lock: 'owner-key' });
  let all = true;
  for (let i = 0; i < 6; i++) all = all && (await door('POST', `blk:${i}`, { content: { _: 'x'.repeat(500) } })).status === 200;
  for (let i = 0; i < 5; i++) all = all && (await voice(door, 'marks')).status === 200;
  ok(all, 'six births, five appends and 500-byte writes all land');
  ok((await redis.keys('*:births:*')).length === 0 && (await redis.keys('*:appends:*')).length === 0, 'no counter exists');
  await fs.rm(dir, { recursive: true, force: true });
} else {
  console.log('the caps, env on, numbers in latched settings');
  const { door, dir } = await beach();
  await door('POST', 'settings', { content: SETTINGS, new_lock: 'owner-key' });   // born before the cap is heard? it counts itself: 1
  ok((await door('POST', 'blk:a', { content: { _: 'a' } })).status === 200, 'a birth inside the cap lands');
  ok((await door('POST', 'blk:b', { spindle: '1', content: 'b' })).status === 200, 'and another');
  const third = await door('POST', 'blk:c', { content: { _: 'c' } });
  const fourth = await door('POST', 'blk:d', { content: { _: 'd' } });
  ok([third.status, fourth.status].includes(429), 'past the cap, a new block is refused');
  const refused = [third, fourth].find((r) => r.status === 429);
  ok(refused?.body?.code === 'cap_births' && /every block already here/.test(refused.body.error), 'in plain words, saying what still works');
  ok((await door('GET', 'blk:d')).status === 404, 'and the refused block was not made');
  ok((await door('POST', 'blk:a', { spindle: '1', content: 'still writing' })).status === 200, 'a block already here writes as ever');
  ok((await door('POST', 'sed:crowd', { action: 'register', declaration: 'x', passphrase: 'p' })).status === 429, 'a sed: founding is a birth too');
  ok((await door('POST', 'pool:new-room', { append: true, content: { _: 'v' } })).status === 429, 'and so is an append that would mint its board');

  await door('POST', 'settings', { spindle: '1', content: 'cap_births_per_hour=0', secret: 'owner-key' });
  const b2 = await beach();   // a fresh instance hears the owner's new number
  await b2.door('POST', 'settings', { content: { ...SETTINGS, 1: 'cap_births_per_hour=0' }, new_lock: 'owner-key' });
  await b2.door('POST', 'marks', { content: { _: 'an open board' } });
  await b2.door('POST', 'pool:held', { content: { _: 'a latched board' }, new_lock: 'author' });
  const a = [];
  for (let i = 0; i < 4; i++) a.push((await voice(b2.door, 'marks')).status);
  ok(a.slice(0, 2).every((x) => x === 200) && a.slice(2).every((x) => x === 429), 'an open board takes its fill for the minute, then refuses');
  ok((await voice(b2.door, 'pool:other')).status === 200, 'and no other board is touched');
  const held = [];
  for (let i = 0; i < 4; i++) held.push((await b2.door('POST', 'pool:held', { append: true, content: { _: 'v' }, secret: 'author' })).status);
  ok(held.every((x) => x === 200), 'a latch-holder is never throttled');
  const big = await b2.door('POST', 'open:page', { content: { _: 'x'.repeat(400) } });
  ok(big.status === 413 && big.body.code === 'cap_write_bytes', 'a large write with no latch behind it is refused');
  ok((await b2.door('POST', 'pool:held', { append: true, content: { _: 'x'.repeat(400) }, secret: 'author' })).status === 200, "a latch-holder's large write is not");
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(b2.dir, { recursive: true, force: true });

  console.log('cap lines in an UNLATCHED settings block steer nothing');
  const b3 = await beach();
  await b3.door('POST', 'settings', { content: { _: 'open settings', 1: 'cap_births_per_hour=1' } });
  let all = true;
  for (let i = 0; i < 4; i++) all = all && (await b3.door('POST', `blk:${i}`, { content: { _: 'x' } })).status === 200;
  ok(all, 'a stranger cannot lock a beach by writing a cap of 1 into open settings');
  await fs.rm(b3.dir, { recursive: true, force: true });
}

ownerSrv.close(); strangerSrv.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
