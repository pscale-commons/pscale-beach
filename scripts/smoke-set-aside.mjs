#!/usr/bin/env node
// smoke-set-aside.mjs — the owner's tidy, end to end against the REAL handler on a temp
// folder. Self-contained: no network, no Upstash.
//
//   node scripts/smoke-set-aside.mjs
//
// Proves: a dry run moves nothing; a set-aside copies the block whole to archive:<name>:<date>,
// removes the original, takes it out of its family's sweep, seals the copy under the owner's
// latch, keeps the old latch beside it, and says so at beach-log; a second set-aside of the same
// name on the same day gets its own archive name; a put-back returns the block under the latch
// it HAD — the holder's passphrase opens it and no other does; a world's surface is its own;
// and every refusal (sed:, grain:, an archive, no reason, no owner latch, a name that stands
// again) leaves everything where it was.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

const APEX = 'base.test';
process.env.BEACH_ORIGIN = APEX;
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';

const { FileRedis } = await import('./file-redis.mjs');
const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
const { setAside, putBack, makeDoor, surface } = await import('./set-aside.mjs');

const dir = await fs.mkdtemp(join(os.tmpdir(), 'smoke-set-aside-'));
const redis = new FileRedis(dir);
__setRedis(redis);

let failed = 0;
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`);
  if (!cond) failed++;
}
async function refuses(fn, label) {
  try { await fn(); ok(false, `${label} — was not refused`); }
  catch { ok(true, label); }
}

const OWNER = 'owner-latch';
const HOLDER = 'holder-passphrase';
const apex = surface(null, APEX);
const door = makeDoor(handler, apex);
const base = { redis, door, origin: apex.origin, by: 'keeper', passphrase: OWNER };
const names = async (d = door) => (await d('GET', '')).body.blocks;

// A stray, latched by the hand that minted it, beside the name it was meant to be.
const STRAY = { _: { _: "MIRROR — strayname's readings on the now field." }, 2: { _: { 3: 'the one line it holds' } } };
await door('POST', 'now:strayname', { content: STRAY, new_lock: HOLDER });
await door('POST', 'now:realname', { content: { _: "MIRROR — realname's readings on the now field." }, new_lock: HOLDER });

console.log('dry run');
const dry = await setAside({ ...base, name: 'now:strayname', why: 'a mistyped handle', confirm: false });
ok(dry.dry && dry.latched && dry.archive.startsWith('archive:now:strayname:'), 'says what would move, and that it is latched');
ok((await names()).includes('now:strayname') && !(await names()).some((n) => n.startsWith('archive:')), 'moves nothing');

console.log('set aside');
const done = await setAside({ ...base, name: 'now:strayname', why: 'a mistyped handle', confirm: true });
const copy = await door('GET', done.archive);
ok(copy.status === 200 && JSON.stringify(copy.body) === JSON.stringify(STRAY), 'the archive copy reads back whole');
ok((await door('GET', 'now:strayname')).status === 404, 'the original is gone from its name');
const swept = (await names()).filter((n) => n.startsWith('now:'));
ok(swept.length === 1 && swept[0] === 'now:realname', "the family's sweep no longer sees it");
ok((await door('POST', done.archive, { spindle: '1', content: 'tamper' })).status === 403, 'the copy is sealed — a keyless write is refused');
ok((await door('POST', done.archive, { spindle: '1', content: 'tamper', secret: HOLDER })).status === 403, "the copy is sealed — the old holder's passphrase does not open it");
const rec = await redis.get(`pscale-beach-v2:${APEX}:aside:${done.archive}`);
ok(rec && rec.from === 'now:strayname' && rec.locks && typeof rec.locks._ === 'string', 'the old latch is kept beside the copy, in storage');
ok(!(await names()).some((n) => n.includes(':aside:')), 'and never in the public index');
const log = (await door('GET', 'beach-log')).body;
ok(log && typeof log._ === 'string' && log['1'] && /SET ASIDE: now:strayname/.test(log['1']._) && log['1']['1'] === 'keeper', 'beach-log is born and says what moved, and who moved it');
ok(typeof log['1']['3'] === 'string', 'the door stamped the entry');

console.log('the same name, the same day');
await door('POST', 'now:strayname', { content: { _: { _: 'minted again' } } });
const again = await setAside({ ...base, name: 'now:strayname', why: 'minted again', confirm: true });
ok(again.archive !== done.archive && /T\d{6}Z$/.test(again.archive), 'gets an archive name of its own');
ok(!again.latched && (await redis.get(`pscale-beach-v2:${APEX}:aside:${again.archive}`)).locks === null, 'an open block leaves no latch to keep');

console.log('put back');
const pdry = await putBack({ ...base, archive: done.archive, confirm: false });
ok(pdry.dry && pdry.name === 'now:strayname' && pdry.relatch, 'dry run names where it goes, and that the latch returns');
const back = await putBack({ ...base, archive: done.archive, confirm: true });
ok(JSON.stringify((await door('GET', 'now:strayname')).body) === JSON.stringify(STRAY), 'the block stands again, whole');
ok((await door('POST', 'now:strayname', { spindle: '3', content: 'x' })).status === 403, 'latched again — a keyless write is refused');
ok((await door('POST', 'now:strayname', { spindle: '3', content: 'x', secret: OWNER })).status === 403, "the owner's latch does not open it");
ok((await door('POST', 'now:strayname', { spindle: '3', content: 'mine again', secret: HOLDER })).status === 200, "the holder's own passphrase opens it as before");
ok((await door('GET', back.archive)).status === 404 && (await redis.get(`pscale-beach-v2:${APEX}:aside:${back.archive}`)) == null, 'the copy and its record are gone');
ok(/PUT BACK/.test(JSON.stringify((await door('GET', 'beach-log')).body)), 'beach-log says so');

console.log("a world's surface is its own");
const world = surface(`${APEX}/w/alpha`, APEX);
const wdoor = makeDoor(handler, world);
await wdoor('POST', 'probe:left-behind', { content: { _: 'a probe nobody cleaned up' } });
const wdone = await setAside({ ...base, door: wdoor, origin: world.origin, name: 'probe:left-behind', why: 'a probe', confirm: true });
ok((await names(wdoor)).includes(wdone.archive) && !(await names(wdoor)).includes('probe:left-behind'), 'set aside inside the world');
ok(!(await names()).includes(wdone.archive), 'the apex never hears of it');

console.log('refusals leave everything where it was');
await door('POST', 'sed:crowd', { content: { _: 'a collective' } });
await refuses(() => setAside({ ...base, name: 'sed:crowd', why: 'x', confirm: true }), 'sed: is refused');
await refuses(() => setAside({ ...base, name: 'grain:abc', why: 'x', confirm: true }), 'grain: is refused');
await refuses(() => setAside({ ...base, name: again.archive, why: 'x', confirm: true }), 'an archive is refused');
await refuses(() => setAside({ ...base, name: 'now:realname', confirm: true }), 'no reason is refused');
await refuses(() => setAside({ ...base, name: 'now:realname', why: 'x', passphrase: undefined, confirm: true }), "no owner's latch is refused");
await refuses(() => setAside({ ...base, name: 'now:nobody', why: 'x', confirm: true }), 'a block that is not there is refused');
ok((await door('GET', 'now:realname')).status === 200 && (await door('GET', 'sed:crowd')).status === 200, 'and nothing moved');
await door('POST', 'now:strayname-two', { content: { _: { _: 'once more' } } });
const third = await setAside({ ...base, name: 'now:strayname-two', why: 'once more', confirm: true });
await door('POST', 'now:strayname-two', { content: { _: { _: 'the name was taken again meanwhile' } } });
await refuses(() => putBack({ ...base, archive: third.archive, confirm: true }), 'a put-back over a name that stands again is refused');
ok((await door('GET', third.archive)).status === 200, 'and the copy is untouched');

await fs.rm(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
