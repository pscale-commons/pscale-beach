#!/usr/bin/env node
// smoke-born.mjs — the door remembers a birth, and keeps the last copy. End to end against
// the REAL handler on a temp folder. Self-contained: no network, no Upstash.
//
//   node scripts/smoke-born.mjs
//
// BORN. Every creation path stamps `born` beside `touched` and says born:true in its ack —
// a position write, a whole-block create, a root append, a sed: register, a grain: reach —
// and no later write does either. The index carries `born`; a block that predates the stamp
// carries none; a wipe takes the stamp with the block.
//
// THE LAST COPY. Before an UNLATCHED block is wiped or replaced whole the door keeps the
// prior — content and lock set — once per block per day: a second wipe the same day cannot
// launder it. A latch-holder's own wipe or replace keeps nothing, and neither does a position
// write. The owner's script brings a kept copy back — and when the name was re-minted
// meanwhile under a stranger's latch, what stands is set aside first and the copy returns
// open, with the per-position latches it had.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

const APEX = 'base.test';
process.env.BEACH_ORIGIN = APEX;
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';

const { FileRedis } = await import('./file-redis.mjs');
const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
const { restoreLast, setAside, putBack, makeDoor, surface } = await import('./set-aside.mjs');

const dir = await fs.mkdtemp(join(os.tmpdir(), 'smoke-born-'));
const redis = new FileRedis(dir);
__setRedis(redis);

let failed = 0;
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`);
  if (!cond) failed++;
}

const door = makeDoor(handler, surface(null, APEX));
const K = (kind, rest = '') => `pscale-beach-v2:${APEX}:${kind}${rest}`;
const index = async () => (await door('GET', '')).body;
const day = new Date().toISOString().slice(0, 10);
const base = { redis, door, origin: APEX, by: 'keeper', passphrase: 'owner-latch' };

console.log('born — every creation path, and only a creation');
const w1 = await door('POST', 'now:newcomer', { spindle: '2', content: 'a first say' });
ok(w1.status === 200 && w1.body.born === true, 'a position write that mints a block says born');
const w2 = await door('POST', 'now:newcomer', { spindle: '3', content: 'a second say' });
ok(w2.status === 200 && !('born' in w2.body), 'the next write to it does not');
ok((await door('POST', 'shell:whole', { content: { _: 'made whole' } })).body.born === true, 'a whole-block create says born');
ok(!('born' in (await door('POST', 'shell:whole', { content: { _: 'replaced whole' }, confirm: true })).body), 'a whole-block replace does not');
const a1 = await door('POST', 'pool:fresh', { append: true, content: { _: 'first voice' } });
ok(a1.body.born === true && a1.body.slot === '1', 'an append that mints its accumulator says born');
ok(!('born' in (await door('POST', 'pool:fresh', { append: true, content: { _: 'second voice' } })).body), 'the next append does not');
const s1 = await door('POST', 'sed:crowd', { action: 'register', declaration: 'here', passphrase: 'p1' });
ok(s1.status === 200 && s1.body.born === true, 'the register that founds a sed: says born');
const s2 = await door('POST', 'sed:crowd', { action: 'register', declaration: 'here too', passphrase: 'p2' });
ok(s2.status === 200 && !('born' in s2.body), 'the next register does not');
const g1 = await door('POST', 'grain:abc123', { action: 'reach', side: '1', agent_id: 'a', partner_agent_id: 'b', my_side_content: 'hello', my_passphrase: 'ga' });
ok(g1.status === 200 && g1.body.born === true, 'the reach that establishes a grain: says born');
const g2 = await door('POST', 'grain:abc123', { action: 'reach', side: '2', agent_id: 'b', partner_agent_id: 'a', my_side_content: 'hello back', my_passphrase: 'gb' });
ok(g2.status === 200 && !('born' in g2.body), 'the accept does not');
ok(!('born' in (await door('POST', 'now:newcomer', { new_lock: 'latch-only' })).body), 'a latch set with no content is not a birth');

await redis.set(K('block:', 'old:before-the-stamp'), { _: 'here before the stamp existed' });
const ix = await index();
ok(ix.born && ['now:newcomer', 'shell:whole', 'pool:fresh', 'sed:crowd', 'grain:abc123'].every((n) => typeof ix.born[n] === 'string'), 'the index carries born for all five');
ok(ix.blocks.includes('old:before-the-stamp') && !('old:before-the-stamp' in ix.born), 'a block from before the stamp carries none');
ok(ix.born['now:newcomer'] < ix.touched['now:newcomer'] || ix.born['now:newcomer'] === ix.touched['now:newcomer'], 'born stays at the birth while touched moves on');
ok(/born maps each block/.test(ix._), 'the index says what born is');
await door('DELETE', 'shell:whole', { confirm: true });
ok(!('shell:whole' in ((await index()).born || {})), 'a wipe takes the stamp with the block');

console.log('the last copy — kept where no latch stands behind the act');
const BOARD = { _: 'an open board', 1: { _: 'a voice worth keeping' }, 2: { _: 'a homesteaded seat' } };
await door('POST', 'board', { content: BOARD });
await door('POST', 'board', { spindle: '2', new_lock: 'seat-holder' });   // a latched position under an open root
ok((await door('DELETE', 'board', { confirm: true })).status === 200, 'an open board is wiped by a keyless hand');
const kept = await redis.get(K('last:', `board:${day}`));
ok(kept && JSON.stringify(kept.block) === JSON.stringify(BOARD), 'the door kept the prior content');
ok(kept && typeof kept.locks['2'] === 'string' && !('_' in kept.locks), 'and the lock set it had — the seat, no root');
ok(!(await index()).blocks.some((n) => n.includes('last:')), 'never in the public index');
// The laundering attempt: mint junk at the same name, OPEN, and wipe it keyless — an unlatched
// wipe, so the door reaches for the copy again, and must not let the junk replace it.
await door('POST', 'board', { content: { _: 'junk minted in its place' } });
await door('DELETE', 'board', { confirm: true });
ok(JSON.stringify((await redis.get(K('last:', `board:${day}`))).block) === JSON.stringify(BOARD), 'a second wipe the same day cannot launder the copy');

await door('POST', 'mine', { content: { _: 'my own page' }, new_lock: 'author' });
await door('DELETE', 'mine', { confirm: true, secret: 'author' });
ok((await redis.get(K('last:', `mine:${day}`))) == null, "a latch-holder's own wipe keeps nothing — that is an author's act");

await door('POST', 'open:page', { content: { _: 'before', 1: 'kept?' } });
await door('POST', 'open:page', { content: { _: 'after' }, confirm: true });
ok((await redis.get(K('last:', `open:page:${day}`)))?.block?._ === 'before', 'an unlatched whole-block replace keeps the prior');
await door('POST', 'held:page', { content: { _: 'before' }, new_lock: 'author' });
await door('POST', 'held:page', { content: { _: 'after' }, confirm: true, secret: 'author' });
ok((await redis.get(K('last:', `held:page:${day}`))) == null, "a latch-holder's whole-block replace keeps nothing");
await door('POST', 'open:other', { content: { _: 'root', 1: 'one' } });
await door('POST', 'open:other', { spindle: '1', content: 'one, rewritten' });
ok((await redis.get(K('last:', `open:other:${day}`))) == null, 'a position write keeps nothing');

console.log("the way back — the owner's script");
const dry = await restoreLast({ ...base, name: 'board', confirm: false });
ok(dry.dry && !dry.standing && dry.hadLatches, 'dry run: the name stands empty, and latches will return');
await door('POST', 'board', { content: { _: 'the vandal took the name' }, new_lock: 'vandal-again' });   // the hijack
const back = await restoreLast({ ...base, name: 'board', confirm: true });
ok(back.standing && typeof back.archive === 'string', 'what stood in its place was set aside first');
ok((await door('GET', back.archive)).body._ === 'the vandal took the name', 'and reads whole at its archive name');
ok(JSON.stringify((await door('GET', 'board')).body) === JSON.stringify(BOARD), 'the board stands again, whole');
ok((await door('POST', 'board', { spindle: '3', content: 'a stranger writes' })).status === 200, 'open at its root, as it was');
ok((await door('POST', 'board', { spindle: '2', content: 'a stranger takes the seat' })).status === 403, 'the seat is latched again');
ok((await door('POST', 'board', { spindle: '2', content: { _: 'mine still' }, secret: 'seat-holder' })).status === 200, "and its holder's passphrase opens it");
ok(!('board' in ((await index()).born || {})), 'a return is not a birth');
const log = JSON.stringify((await door('GET', 'beach-log')).body);
ok(/SET ASIDE: board/.test(log) && /RESTORED: board/.test(log), 'beach-log carries both acts');
let refused = false;
try { await restoreLast({ ...base, name: 'never-kept', confirm: true }); } catch { refused = true; }
ok(refused, 'a name the door kept no copy of is refused, plainly');

console.log('a set-aside and a put-back carry the birth stamp with the block');
const bornBefore = (await index()).born['now:newcomer'];
const gone = await setAside({ ...base, name: 'now:newcomer', why: 'a test', confirm: true });
ok(!('now:newcomer' in (await index()).born) && typeof (await index()).born[gone.archive] === 'string', 'set aside: the stamp leaves with the name, and the archive is itself a birth');
await putBack({ ...base, archive: gone.archive, confirm: true });
ok((await index()).born['now:newcomer'] === bornBefore, 'put back: the block has the birth it always had');

await fs.rm(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
