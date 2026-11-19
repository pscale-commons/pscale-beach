#!/usr/bin/env node
// smoke-passport-whole.mjs — a passport is one whole. End to end against the REAL handler
// on a temp folder. Self-contained: no network, no Upstash.
//
//   node scripts/smoke-passport-whole.mjs
//
// A latch lands where the write lands, so a passport founded by a write at one position was
// latched at that line and open at its top, and any hand could latch the root and take the
// name. Now: while a passport's root is open, whoever holds a latch on any part of it holds
// all of it (every write, latch and wipe needs that key), and the top latches itself under
// the key that holds a part, that first latches a part, or that rides the founding. A
// passport founded with no key stays open; one latched at its root is governed as before;
// no other block changes.

import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { join } from 'node:path';

const APEX = 'base.test';
process.env.BEACH_ORIGIN = APEX;
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';

const { FileRedis } = await import('./file-redis.mjs');
const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
const { makeDoor, surface } = await import('./set-aside.mjs');

const redis = new FileRedis(await fs.mkdtemp(join(os.tmpdir(), 'smoke-passport-whole-')));
__setRedis(redis);
const door = makeDoor(handler, surface(null, APEX));

let failed = 0;
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`);
  if (!cond) failed++;
}
const held = (r) => r.status === 403 && r.body && r.body.code === 'lock_required';
const hash = (key, block, position) => createHash('sha256').update(`${key}block:https://${APEX}:${block}:${position}`).digest('hex');
const latches = async (block) => Object.keys((await redis.get(`pscale-beach-v2:${APEX}:locks:${block}`)) || {}).sort().join(',');
// A passport as one stood before this rule: latched at the lines its founding wrote, open at its top.
async function standsHalfLatched(block, key, positions) {
  await redis.set(`pscale-beach-v2:${APEX}:block:${block}`, { _: `${block} at ${APEX}.`, 1: 'what I offer', 3: 'Location: near somewhere' });
  await redis.set(`pscale-beach-v2:${APEX}:locks:${block}`, Object.fromEntries(positions.map((p) => [p, hash(key, block, p)])));
}
const D = 'dee-key', E = 'eve-key';

console.log('founded at one line, as the welcome had assistants do — the whole is latched');
ok((await door('POST', 'passport:dee', { spindle: '3', content: 'Location: near somewhere', new_lock: D })).status === 200, 'passport:dee is born of a write at position 3, her key riding it');
ok(await latches('passport:dee') === '3,_', 'the key latched the line and the root');
ok(held(await door('POST', 'passport:dee', { new_lock: 'mallory' })), 'another key cannot latch its root');
ok(held(await door('POST', 'passport:dee', { spindle: '1', content: 'not dee' })), 'nor write another line of it');
ok((await door('POST', 'passport:dee', { spindle: '1', content: 'what I offer', secret: D })).status === 200, 'she writes her next line with her key');

console.log('one that stands half-latched from before — held whole at once, healed at her next keyed write');
await standsHalfLatched('passport:old', D, ['1', '3']);
ok(held(await door('POST', 'passport:old', { new_lock: 'mallory' })), 'another key cannot latch its root: the name cannot be taken');
ok(held(await door('POST', 'passport:old', { spindle: '0', content: 'not old' })), 'nor rewrite its opening line');
ok(held(await door('POST', 'passport:old', { spindle: '4', content: 'not old' })), 'nor write a line that carries no latch of its own');
ok(held(await door('POST', 'passport:old', { content: { _: 'replaced' }, confirm: true })), 'nor replace it whole');
ok(held(await door('DELETE', 'passport:old', { confirm: true })), 'nor wipe it');
ok(held(await door('POST', 'passport:old', { append: true, content: 'x' })), 'nor append to it');
ok(await latches('passport:old') === '1,3', 'no refusal changed anything');
const squat = await door('POST', 'now:old', { content: { _: 'mine now' }, new_lock: 'mallory' });
ok(squat.status === 403 && squat.body.code === 'handle_bound', 'and the name binds already: another key cannot latch now:old');
ok((await door('POST', 'passport:old', { spindle: '4', content: 'my room: pool:old', secret: D })).status === 200, 'her next keyed write lands, at a line that had no latch');
ok(await latches('passport:old') === '1,3,_', 'and the root has taken her key');
ok((await door('POST', 'passport:old', { spindle: '5', content: 'how to meet me', secret: D })).status === 200, 'she writes on as the holder of an ordinary latched passport');
ok(held(await door('POST', 'passport:old', { spindle: '5', content: 'x', secret: 'mallory' })), 'and a wrong key is refused by the root latch');

console.log('healed by the assistant’s own habit too — the key sent as new_lock on a fresh line');
await standsHalfLatched('passport:hab', D, ['3']);
ok((await door('POST', 'passport:hab', { spindle: '1', content: 'what I offer', new_lock: D })).status === 200, 'a line written with her key as new_lock is admitted');
ok(await latches('passport:hab') === '1,3,_', 'and the root is latched with it');

console.log('founded by a write that carries the key only as proof');
ok((await door('POST', 'passport:sec', { spindle: '3', content: 'Location: somewhere', secret: E })).body.born === true, 'passport:sec is born of a keyed write with no new_lock');
ok(await latches('passport:sec') === '_', 'its root is latched under that key');
ok(held(await door('POST', 'passport:sec', { spindle: '1', content: 'x' })), 'a keyless hand is refused');
ok((await door('POST', 'passport:sec', { spindle: '1', content: 'offers', secret: E })).status === 200, 'its founder writes on');

console.log('what is unchanged');
ok((await door('POST', 'passport:page', { content: { _: 'founded whole', 3: 'Location: Earth' }, new_lock: D })).status === 200 && await latches('passport:page') === '_', 'a passport founded whole with new_lock is latched at its root, as ever');
ok((await door('POST', 'passport:page', { secret: D, new_lock: 'dee-key-2' })).status === 200, 'its holder rotates it');
ok((await door('POST', 'passport:open', { content: { _: 'founded with no key' } })).status === 200 && await latches('passport:open') === '', 'a passport founded with no key stays open');
ok((await door('POST', 'passport:open', { spindle: '1', content: 'anyone' })).status === 200, 'and takes a keyless line, as before');
ok((await door('POST', 'thing:open', { content: { _: 'x' }, new_lock: 'anyone' })).status === 200, 'an open passport still binds nothing');
ok((await door('POST', 'passport:free', { content: { _: 'open by her own word' }, secret: E, new_lock: '' })).status === 200 && await latches('passport:free') === '', 'a founder who says new_lock "" leaves it open');
await standsHalfLatched('passport:rel', D, ['3']);
ok((await door('POST', 'passport:rel', { secret: D, new_lock: null })).status === 200 && await latches('passport:rel') === '3', 'a holder’s relinquish at the root is not answered with a latch');
ok((await door('POST', 'roster', { spindle: '2', content: 'ann', new_lock: 'ann-key' })).status === 200 && await latches('roster') === '2', 'any other block: a latch at a position stays at that position');
ok((await door('POST', 'roster', { spindle: '4', content: 'bob', new_lock: 'bob-key' })).status === 200, 'and another hand still homesteads another position of it');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
