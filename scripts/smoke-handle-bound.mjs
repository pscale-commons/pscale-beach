#!/usr/bin/env node
// smoke-handle-bound.mjs — a handle founds under its own key. End to end against the
// REAL handler on a temp folder. Self-contained: no network, no Upstash.
//
//   node scripts/smoke-handle-bound.mjs
//
// A block named <something>:<handle> is that handle's by the role-with-handle convention.
// Once passport:<handle> is locked, a lock can be SET on such a block — founding it locked,
// claiming it open, or latching one of its positions — only with the passport's key, given
// as the secret (then any new lock: a delegation) or as the new lock itself. Founding open,
// writing under a lock that already stands, rotating, the passport itself, sed:, grain:,
// archive: and probe: are untouched, and a handle with no locked passport binds nothing.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

const APEX = 'base.test';
process.env.BEACH_ORIGIN = APEX;
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';

const { FileRedis } = await import('./file-redis.mjs');
const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
const { makeDoor, surface } = await import('./set-aside.mjs');

__setRedis(new FileRedis(await fs.mkdtemp(join(os.tmpdir(), 'smoke-handle-bound-'))));
const door = makeDoor(handler, surface(null, APEX));

let failed = 0;
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`);
  if (!cond) failed++;
}
const bound = (r) => r.status === 403 && r.body && r.body.code === 'handle_bound';
const A = 'alice-key';

console.log('the claim — a passport binds the names that end in its handle');
ok((await door('POST', 'passport:alice', { content: { _: 'alice — here' }, new_lock: A })).status === 200, 'passport:alice is founded under her key (the passport is the claim, bound by nothing)');
ok((await door('POST', 'mirror:alice', { content: { _: 'her mirror' }, new_lock: A })).status === 200, 'she founds mirror:alice under the same key');
const squat = await door('POST', 'squat:alice', { content: { _: 'mine now' }, new_lock: 'mallory' });
ok(bound(squat), 'another key cannot found squat:alice locked — handle_bound');
ok(/passport:alice/.test(squat.body.error || ''), 'the refusal names the passport whose key it needs');
ok((await door('GET', 'squat:alice')).status === 404, 'the refused founding wrote nothing');

console.log('delegation — her key as the secret, any key as the new lock');
ok((await door('POST', 'shared:alice', { content: { _: 'kept with a helper' }, secret: A, new_lock: 'helper-key' })).status === 200, 'her key as the secret lets the new lock be another key');
ok((await door('POST', 'shared:alice', { spindle: '1', content: 'the helper writes', secret: 'helper-key' })).status === 200, 'and the delegated key then writes under it');

console.log('open founding stands; claiming it does not, except by her');
ok((await door('POST', 'open:alice', { content: { _: 'left open' } })).status === 200, 'anyone may still found open:alice with no lock');
ok(bound(await door('POST', 'open:alice', { new_lock: 'mallory' })), 'another key cannot homestead it');
ok(bound(await door('POST', 'open:alice', { spindle: '1', content: 'a bit', new_lock: 'mallory' })), 'nor latch one of its positions');
ok((await door('POST', 'open:alice', { new_lock: A })).status === 200, 'her own key homesteads it');

console.log('a lock that already stands is governed as before');
ok((await door('POST', 'mirror:alice', { spindle: '1', content: 'a reading', secret: A })).status === 200, 'she writes under her lock');
ok((await door('POST', 'mirror:alice', { secret: A, new_lock: 'alice-key-2' })).status === 200, 'she rotates it');
ok((await door('POST', 'mirror:alice', { spindle: '2', content: 'x' })).body.code === 'lock_required', 'a keyless write is still refused by the lock itself, not the new rule');

console.log('what binds nothing');
ok((await door('POST', 'thing:bob', { content: { _: 'bob has no passport' }, new_lock: 'anyone' })).status === 200, 'a handle with no passport here binds nothing');
ok((await door('POST', 'passport:carol', { content: { _: 'carol — open' } })).status === 200, 'passport:carol is founded open');
ok((await door('POST', 'thing:carol', { content: { _: 'x' }, new_lock: 'anyone' })).status === 200, 'an open passport binds nothing');
ok((await door('POST', 'archive:mirror:alice', { content: { _: 'a steward copy' }, new_lock: 'steward' })).status === 200, 'archive: is exempt — the steward keeps copies under its own key');
ok((await door('POST', 'probe:x:alice', { content: { _: 'fixture' }, new_lock: 'rig' })).status === 200, 'probe: is exempt');
ok((await door('POST', 'plain', { content: { _: 'no handle in the name' }, new_lock: 'anyone' })).status === 200, 'a name without a handle binds nothing');
ok((await door('POST', 'pool:alice', { append: true, content: { _: 'a visitor says hello' } })).status === 200, 'a visitor still speaks in her room');
ok(bound(await door('POST', 'pool:alice', { new_lock: 'mallory' })), 'but cannot lock her room');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
