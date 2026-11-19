#!/usr/bin/env node
// smoke-caps.mjs — settings steer the door only from behind a root latch, and the four
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
//
// THE FOURTH. A wrong-keys-per-hour cap counts the wrong keys one block hears, at every door
// that tries a key — a write, a rotation, a wipe, an append at the root, a grain side, a
// passport held whole, a block named for a handle (counted against its passport) — and past
// it tries no key there until the hour turns, the right one included. A keyless act is never
// counted. An append beneath a node takes the same caps as one at the root; a latch set on a
// name that holds no block is a birth; and the lines may sit one rung beneath a branch.

import http from 'node:http';
import { createHash } from 'node:crypto';
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
const SETTINGS = { _: 'Per-beach settings.', 1: 'cap_births_per_hour=3', 2: 'cap_appends_per_minute=2', 3: 'cap_write_bytes=200', 4: 'cap_wrong_keys_per_hour=3' };

if (!capsOn) {
  console.log('the caps, env off — nothing is refused and nothing is counted');
  const { door, dir, redis } = await beach();
  await door('POST', 'settings', { content: SETTINGS, new_lock: 'owner-key' });
  let all = true;
  for (let i = 0; i < 6; i++) all = all && (await door('POST', `blk:${i}`, { content: { _: 'x'.repeat(500) } })).status === 200;
  for (let i = 0; i < 5; i++) all = all && (await voice(door, 'marks')).status === 200;
  ok(all, 'six births, five appends and 500-byte writes all land');
  await door('POST', 'held:page', { content: { _: 'my page', 1: { _: 'an entry' } }, new_lock: 'author' });
  for (let i = 0; i < 5; i++) await door('POST', 'held:page', { spindle: '2', content: 'x', secret: `wrong-${i}` });
  ok((await door('POST', 'held:page', { spindle: '2', content: 'mine', secret: 'author' })).status === 200, 'five wrong keys later, the right one opens as ever');
  await door('POST', 'pool:replies', { content: { _: 'a room', 1: { _: 'an entry' } } });
  ok((await door('POST', 'pool:replies', { append: true, spindle: '1', content: { _: 'x'.repeat(500) } })).status === 200, 'and a large reply beneath a node lands');
  const counters = [...await redis.keys('*:births:*'), ...await redis.keys('*:appends:*'), ...await redis.keys('*:wrongkeys:*')];
  ok(counters.length === 0, 'no counter exists');
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
  ok((await door('POST', 'never:made', { new_lock: 'squat' })).status === 429, 'and a latch set on a name that holds no block');
  ok((await door('POST', 'blk:a', { new_lock: 'homestead' })).status === 200, 'while latching a block that stands is no birth');

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

  console.log('the lines one rung beneath a branch, and an append beneath a node');
  const b4 = await beach();
  await b4.door('POST', 'settings', { content: { _: 'Per-beach settings.', 8: { _: "The door's caps.", 1: 'cap_births_per_hour=50', 2: 'cap_appends_per_minute=2', 3: 'cap_write_bytes=200', 4: 'cap_wrong_keys_per_hour=3' } }, new_lock: 'owner-key' });
  await b4.door('POST', 'marks', { content: { _: 'an open board', 1: { _: 'an entry' } } });
  const fill = [];
  for (let i = 0; i < 3; i++) fill.push((await voice(b4.door, 'marks')).status);
  ok(fill.join() === '200,200,429', 'lines nested under a branch are heard like lines at the top');
  ok((await b4.door('POST', 'marks', { append: true, spindle: '1', content: { _: 'a reply' } })).status === 429, "a reply beneath a node is the same board's fill for the minute");
  await b4.door('POST', 'pool:replies', { content: { _: 'a room', 1: { _: 'an entry' } } });
  const bigReply = await b4.door('POST', 'pool:replies', { append: true, spindle: '1', content: { _: 'x'.repeat(400) } });
  ok(bigReply.status === 413 && bigReply.body.code === 'cap_write_bytes', 'a large reply beneath a node is refused');
  ok((await b4.door('POST', 'pool:replies', { append: true, spindle: '1', content: { _: 'a short reply' } })).status === 200, 'and a short one lands');

  console.log('the fourth cap — wrong keys, per block, asked before a key is tried');
  await b4.door('POST', 'held:page', { content: { _: 'my page' }, new_lock: 'author' });
  await b4.door('POST', 'other:page', { content: { _: 'another page' }, new_lock: 'author' });
  const guesses = [];
  for (const g of ['guess-1', 'guess-2', 'guess-3']) guesses.push((await b4.door('POST', 'held:page', { spindle: '1', content: 'x', secret: g })).status);
  ok(guesses.every((s) => s === 403), 'three wrong keys are refused as wrong');
  const right = await b4.door('POST', 'held:page', { spindle: '1', content: 'mine', secret: 'author' });
  ok(right.status === 429 && right.body.code === 'cap_wrong_keys', 'past the cap even the right key is not tried — the guesser learns nothing more');
  ok(/until the hour turns/.test(right.body.error) && /nothing written there has changed/.test(right.body.error), 'in plain words: when it clears, and that nothing changed');
  ok((await b4.door('GET', 'held:page')).body._ === 'my page', 'the page reads as ever, unchanged');
  ok((await b4.door('DELETE', 'held:page', { confirm: true, secret: 'author' })).status === 429, 'a wipe tries a key, so it waits too');
  ok((await b4.door('POST', 'held:page', { new_lock: 'rotated', secret: 'author' })).status === 429, 'and so does a rotation');
  ok((await b4.door('POST', 'held:page', { spindle: '1', content: 'x' })).status === 403, 'a keyless write is refused as ever');
  for (let i = 0; i < 5; i++) await b4.door('POST', 'other:page', { spindle: '2', content: 'x' });
  ok((await b4.door('POST', 'other:page', { spindle: '2', content: 'mine', secret: 'author' })).status === 200, 'keyless tries are never counted, and the count is per block — the same key opens another');

  await b4.door('POST', 'pool:closed', { content: { _: 'a latched room' }, new_lock: 'room-key' });
  for (const g of ['a', 'b', 'c']) await b4.door('POST', 'pool:closed', { append: true, content: { _: 'v' }, secret: g });
  ok((await b4.door('POST', 'pool:closed', { append: true, content: { _: 'v' }, secret: 'room-key' })).body.code === 'cap_wrong_keys', 'wrong keys at a latched board count the same way');

  const reach = (pass, words) => b4.door('POST', 'grain:pair1', { action: 'reach', side: '1', agent_id: 'a', partner_agent_id: 'b', my_side_content: words, my_passphrase: pass });
  await reach('side-a', 'hello');
  for (const g of ['x', 'y', 'z']) await reach(g, 'forged');
  ok((await reach('side-a', 'mine')).body.code === 'cap_wrong_keys', "a grain side's passphrase is a key like any other");

  await b4.door('POST', 'passport:alice', { content: { _: 'Alice' }, new_lock: 'alice-key' });
  const bound = [];
  for (const g of ['p', 'q', 'r']) bound.push((await b4.door('POST', 'notes:alice', { content: { _: 'n' }, new_lock: g })).body.code);
  ok(bound.every((c) => c === 'handle_bound'), "three latches tried on a block named for alice, each refused as not her key");
  ok((await b4.door('POST', 'passport:alice', { spindle: '1', content: 'me', secret: 'alice-key' })).body.code === 'cap_wrong_keys', 'those keys were tried for her passport, so they count against it');

  // A passport held whole — its root open, one part latched (the irregular state the
  // holder's next keyed write ends) — set straight into storage for the test.
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  await b4.redis.set(`pscale-beach-v2:${APEX}:block:passport:carol`, { _: 'Carol', 3: 'Carol, Hull' });
  await b4.redis.set(`pscale-beach-v2:${APEX}:locks:passport:carol`, { 3: sha(`carol-keyblock:https://${APEX}:passport:carol:3`) });
  for (const g of ['m', 'n', 'o']) await b4.door('POST', 'passport:carol', { spindle: '1', content: 'x', secret: g });
  ok((await b4.door('POST', 'passport:carol', { spindle: '1', content: 'me', secret: 'carol-key' })).body.code === 'cap_wrong_keys', 'a passport held whole counts its wrong keys the same way');
  ok((await b4.door('DELETE', 'passport:carol', { confirm: true, secret: 'carol-key' })).status === 429, 'and its wipe waits too');
  await fs.rm(b4.dir, { recursive: true, force: true });

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
