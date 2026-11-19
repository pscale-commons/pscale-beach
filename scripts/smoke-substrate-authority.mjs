#!/usr/bin/env node
//
// smoke-substrate-authority.mjs — on sed: and grain:, the lock follows the walk.
//
// THE HOLES THIS PINS SHUT (named 2026-10-26 in the coloured-stigmergy proposal,
// found in the code and reproduced offline; the rest of the same class found
// beside them 2026-10-27). A sed's places and a grain's sides are nodes of a
// walk: place 11 is the node 1→1, place 111 the node 1→1→1 beneath it, and the
// fifth line of grain side 1 the node 1→5. But the lock was read off the spindle
// as typed, its first dotted segment, so one node answered to as many locks as
// there are ways to spell it: '1.1' and '11' were place 11 under two locks, '9.1'
// and '91' the payway's issuer line, '1.5' and '15' a line of side 1. A write at
// a node nobody had latched (a sed's 1, a grain's 9) replaced everything beneath
// it; every position a founder had not latched one by one stood open, the
// payway's purchase address among them; a sed born by its first settle had no
// root latch, so it could be replaced whole; and a root append wrapped a sed or
// a grain, moving every place, or the record of who holds which side, beneath
// the underscore.
//
// Runs the REAL handler in-process against a temp-dir FileRedis. No server, no
// network, zero residue.
//
// Run: npm run smoke:substrate

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (c, m, detail = '') => { if (c) pass++; else { fail++; console.error('  ✗', m, detail); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const dir = await fs.mkdtemp(join(tmpdir(), 'pscale-substrate-authority-'));
const ORIGIN = 'smoke.invalid';
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';
process.env.BEACH_ORIGIN = ORIGIN;

const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
const { FileRedis } = await import('./file-redis.mjs');
__setRedis(new FileRedis(dir));

async function call(method, body, query = {}) {
  let status = 200, out = null;
  const req = { method, query, body: body ?? {}, headers: { host: ORIGIN }, url: '/.well-known/pscale-beach' };
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(o) { out = o; }, end() {} };
  await handler(req, res);
  return { status, body: out };
}
const post = (b) => call('POST', b);
const read = async (block) => (await call('GET', undefined, { block })).body;
const settle = async (sed, who, key) => (await post({ block: sed, action: 'register', declaration: who, passphrase: key })).body;
const show = (r) => JSON.stringify(r.body);

async function main() {
  // ── A sed born by its first settle: no root latch ──
  const OPEN = 'sed:open';
  ok((await settle(OPEN, 'alice', 'key-a')).position === '11', 'setup: the first settle takes 11');
  ok((await settle(OPEN, 'bob', 'key-b')).position === '12', 'setup: the second takes 12');
  let before = await read(OPEN);

  console.log('— a write at a node nobody latched');
  let r = await post({ block: OPEN, spindle: '1', content: { _: 'owned' } });
  ok(r.status >= 400, "a keyless object at a sed's 1 is refused — it would replace the places 11 to 19", show(r));
  r = await post({ block: OPEN, spindle: '1.1', content: 'owned' });
  ok(r.status === 403, "'1.1' is place 11 and answers to 11's key", show(r));
  r = await post({ block: OPEN, spindle: '1.1', content: 'mine now', secret: 'key-b' });
  ok(r.status === 403, "12's key does not write place 11 by another spelling", show(r));
  ok(eq(await read(OPEN), before), '…and the sed is byte-unchanged');

  console.log('— a sed born by settling, replaced whole');
  r = await post({ block: OPEN, content: { _: 'owned' }, confirm: true });
  ok(r.status === 405, 'a keyless whole-block replace of a sed holding places is refused', show(r));
  r = await post({ block: OPEN, content: { _: 'owned' }, confirm: true, secret: 'key-a' });
  ok(r.status === 405, "a place's key does not buy the whole sed either", show(r));
  r = await post({ block: OPEN, append: true, content: { _: 'a root entry' } });
  ok(r.status === 405, 'a root append to a sed is refused — at ten it would wrap the block and move every place', show(r));
  r = await post({ block: OPEN, spindle: '0.5', content: 'x' });
  ok(r.status >= 400, "a write into the root's underscore chain is refused while places stand — it would raise the floor beneath them", show(r));
  r = await post({ block: OPEN, spindle: '25', content: 'squatting' });
  ok(r.status >= 400, 'a place nobody has settled is not written by hand', show(r));
  r = await post({ block: OPEN, spindle: '25', new_lock: 'key-x' });
  ok(r.status >= 400, '…nor latched out of turn', show(r));
  ok(eq(await read(OPEN), before), '…and the sed is byte-unchanged');

  console.log('— a place does not hold the places beneath it');
  let last = null, crossedNine = false;
  for (let i = 0; i < 100; i++) {
    last = (await settle(OPEN, `member ${i}`, `key-${i}`)).position;
    if (last.startsWith('9')) crossedNine = true;
    if (last === '111') break;
  }
  ok(last === '111', 'settling reaches 111, beneath 11', last);
  ok(!crossedNine, 'and never lands beneath 9, which block-conventions 7.3 keeps for the collective\'s metadata');
  before = await read(OPEN);
  r = await post({ block: OPEN, spindle: '11', content: { _: 'alice, rewritten' }, secret: 'key-a' });
  ok(r.status === 409, "11's holder cannot replace 11 whole while 111 stands beneath it", show(r));
  r = await post({ block: OPEN, spindle: '1.11', content: 'owned', secret: 'key-a' });
  ok(r.status === 403, "'1.11' is place 111, and 11's key does not write it", show(r));
  ok(eq(await read(OPEN), before), '…and the sed is byte-unchanged');
  r = await post({ block: OPEN, spindle: '11', content: 'alice, re-voiced', secret: 'key-a' });
  const after = await read(OPEN);
  ok(r.status === 200 && after['1']['1']._ === 'alice, re-voiced' && after['1']['1']['1'] === before['1']['1']['1'],
    "11's holder still re-voices their place with a string, and 111 stays", show(r));

  // ── A founded sed: a root latch, a payway at 9 ──
  const HATCH = 'sed:hatch';
  r = await post({ block: HATCH, content: { _: 'a hatch collective: registration takes a ticket' }, new_lock: 'admin' });
  ok(r.status === 200, 'setup: founded with a root latch', show(r));
  r = await post({ block: HATCH, spindle: '9', content: { _: 'Payway config', '1': 'hatch-tickets', '2': 'https://tickets.example/buy', '3': 'designer' }, secret: 'admin' });
  ok(r.status === 200, "setup: the founder writes the payway config at 9 under the root's key", show(r));
  ok((await settle(HATCH, 'carol', 'key-c')).position === '11', 'setup: carol settles at 11');
  before = await read(HATCH);

  console.log('— a founded sed: every position nobody holds is the founder\'s');
  r = await post({ block: HATCH, spindle: '92', content: 'https://elsewhere.example/buy' });
  ok(r.status === 403, "'92' is the payway's purchase address, and it answers to the founder's key", show(r));
  r = await post({ block: HATCH, spindle: '9.1', content: 'someone-else' });
  ok(r.status === 403, "'9.1', the issuer, likewise", show(r));
  r = await post({ block: HATCH, spindle: '9', content: { _: 'owned' }, secret: 'key-c' });
  ok(r.status === 403, "a member's key does not write the collective's metadata", show(r));
  r = await post({ block: HATCH, spindle: '2', content: 'a heading nobody wrote' });
  ok(r.status === 403, 'a container nobody holds answers to the founder', show(r));
  r = await post({ block: HATCH, spindle: '0', content: 'owned' });
  ok(r.status === 403, "the root's underscore answers to the founder, as before", show(r));
  ok(eq(await read(HATCH), before), '…and the founded sed is byte-unchanged');

  console.log('— and what its holders do still lands');
  r = await post({ block: HATCH, spindle: '11', content: { _: 'carol', '1': 'grain:cafe:2' }, secret: 'key-c' });
  ok(r.status === 200, "carol re-writes her place as {_, 1: her ticket's grain}, as the payway's step A asks", show(r));
  r = await post({ block: HATCH, spindle: '112', content: 'FULFILLED', secret: 'key-c' });
  ok(r.status === 200, 'and adds a line beneath her place, at an address nobody has settled', show(r));
  r = await post({ block: HATCH, spindle: '112', content: 'not hers' });
  ok(r.status === 403, "…which answers to carol's key, not to anyone's", show(r));
  r = await post({ block: HATCH, spindle: '9.2', content: 'https://tickets.example/buy/v2', secret: 'admin' });
  ok(r.status === 200, 'the founder re-writes a payway line', show(r));
  r = await post({ block: HATCH, spindle: '1', content: 'the first nine', secret: 'admin' });
  ok(r.status === 200 && (await read(HATCH))['1']['1']._ === 'carol', "the founder voices a container's underscore and the place beneath it stays", show(r));
  r = await post({ block: HATCH, spindle: '11', content: 'carol', secret: 'key-c', new_lock: 'key-c2' });
  ok(r.status === 200, 'a holder rotates their own place', show(r));
  let firstOfThree = null, underNine = null;
  for (let i = 0; i < 90 && !firstOfThree; i++) {
    const p = (await settle(HATCH, `member ${i}`, `key-h${i}`)).position;
    if (p.startsWith('9') && !underNine) underNine = p;
    if (p.length === 3) firstOfThree = p;
  }
  ok(!underNine, 'no settle lands beneath the payway at 9', underNine);
  ok(firstOfThree === '113', "the first place past 89 steps over carol's ticket at 111 and her line at 112, and lands at 113", firstOfThree);
  const hatch = await read(HATCH);
  ok(hatch['9']['1'] === 'hatch-tickets' && hatch['9']['2'] === 'https://tickets.example/buy/v2'
    && hatch['1']['1']['1'] === 'grain:cafe:2' && hatch['1']['1']['2'] === 'FULFILLED',
    "the payway's lines and carol's two lines beneath her place all stand after eighty-one more settles");

  // ── Grains ──
  const GRAIN = 'grain:beef';
  await post({ block: GRAIN, action: 'reach', side: '1', agent_id: 'julie', partner_agent_id: 'david', description: 'a grain', my_side_content: 'reach from side one', my_passphrase: 'key-one' });
  await post({ block: GRAIN, action: 'reach', side: '2', agent_id: 'david', my_side_content: 'reach from side two', my_passphrase: 'key-two' });
  r = await post({ block: GRAIN, append: true, spindle: '1', content: 'a line of julie\'s', secret: 'key-one' });
  ok(r.status === 200 && r.body.address === '1.1', 'setup: julie appends beneath her side', show(r));
  before = await read(GRAIN);

  console.log('— a grain: a side is its holder\'s, however it is spelled');
  r = await post({ block: GRAIN, spindle: '11', content: 'rewritten' });
  ok(r.status === 403, "'11' is julie's line 1.1, and answers to her side's key", show(r));
  r = await post({ block: GRAIN, spindle: '15', content: 'planted' });
  ok(r.status === 403, "'15' lands inside side 1, and answers to its key", show(r));
  r = await post({ block: GRAIN, spindle: '9', content: { '1': 'julie', '2': 'mallory' } });
  ok(r.status === 405, "the record of who holds which side, at 9, is the reach's alone — a keyless write there is refused", show(r));
  r = await post({ block: GRAIN, spindle: '9', content: { '1': 'julie', '2': 'mallory' }, secret: 'key-one' });
  ok(r.status === 405, '…and a side key does not write it either', show(r));
  r = await post({ block: GRAIN, spindle: '0', content: 'a new description' });
  ok(r.status === 405, "the grain's underscore is the reach's too", show(r));
  r = await post({ block: GRAIN, append: true, content: { _: 'a root entry' } });
  ok(r.status === 405, 'a root append to a grain is refused — at ten it would wrap the record at 9', show(r));
  ok(eq(await read(GRAIN), before), '…and the grain is byte-unchanged');
  r = await post({ block: GRAIN, spindle: '1.1', content: 'julie, re-said', secret: 'key-one' });
  ok(r.status === 200, 'julie still re-writes her own line', show(r));
  r = await post({ block: GRAIN, spindle: '2', content: { _: 'reach from side two', '1': 'a message' }, secret: 'key-two' });
  ok(r.status === 200, 'david still writes his side whole', show(r));

  console.log('— a grain nobody has accepted yet');
  const PENDING = 'grain:dead';
  await post({ block: PENDING, action: 'reach', side: '2', agent_id: 'david', partner_agent_id: 'julie', description: 'a pending grain', my_side_content: 'reach from side two', my_passphrase: 'key-two' });
  before = await read(PENDING);
  r = await post({ block: PENDING, spindle: '1', content: { _: 'squatted' } });
  ok(r.status === 405, 'the side not yet accepted is taken only by accepting the reach', show(r));
  r = await post({ block: PENDING, spindle: '1', new_lock: 'key-x' });
  ok(r.status === 405, '…and cannot be latched by hand', show(r));
  ok(eq(await read(PENDING), before), '…and the pending grain is byte-unchanged');
  r = await post({ block: PENDING, action: 'reach', side: '1', agent_id: 'julie', my_side_content: 'reach from side one', my_passphrase: 'key-one' });
  ok(r.status === 200 && r.body.state === 'completed', 'julie still accepts', show(r));
  r = await post({ block: 'grain:f00d', content: { _: 'a grain made by hand', '9': { '1': 'julie', '2': 'mallory' } } });
  ok(r.status === 405, 'a grain is born by a reach, never by a write', show(r));
  ok((await call('GET', undefined, { block: 'grain:f00d' })).status === 404, '…so none was made');

  // ── Ordinary blocks keep the root-inheritance rule ──
  r = await post({ block: 'notes:smoke', content: { _: 'a page' }, new_lock: 'mine' });
  r = await post({ block: 'notes:smoke', spindle: '1.1', content: 'x' });
  ok(r.status === 403, 'an ordinary block still answers to its root latch beneath it', show(r));
  r = await post({ block: 'notes:smoke', spindle: '1.1', content: 'x', secret: 'mine' });
  ok(r.status === 200, 'and lands under that key', show(r));

  console.log(`\n${pass} passed, ${fail} failed`);
  await fs.rm(dir, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await fs.rm(dir, { recursive: true, force: true });
  process.exit(1);
});
