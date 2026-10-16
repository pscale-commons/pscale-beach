#!/usr/bin/env node
// smoke-index-sizes.mjs — the index weighs only what moved. End to end against the REAL
// handler on a temp folder. Self-contained: no network, no Upstash.
//
//   node scripts/smoke-index-sizes.mjs
//
// The index lists each block's stored size (`bytes`), so a reader can choose an aperture before
// a read. Weighing every block on every look billed the store one command per block per look,
// so a page that polls the index paid for the whole surface each time. A size is now kept
// beside the touched stamp it was weighed under:
// - a look at a quiet surface weighs nothing, and costs the same however many blocks it holds;
// - a write through the door is weighed again on the next look;
// - every block is weighed again when the day turns, which catches a write that went round the
//   door (a restore, a migration);
// - a block that leaves takes its weight with it;
// - kept sizes that cannot be read (a restore can leave the key a string) are dropped and
//   weighed afresh.
// The sizes listed are exactly what weighing every block would list.

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

const dir = await fs.mkdtemp(join(os.tmpdir(), 'smoke-index-sizes-'));
const store = new FileRedis(dir);

// Every command the handler sends the store, counted as the store bills them: one per
// command, a pipeline's commands one by one.
let sent = [];
let wedged = false;   // the kept sizes as a restore can leave them: a string, unreadable as a hash
const redis = new Proxy(store, {
  get(t, k) {
    const v = t[k];
    if (typeof v !== 'function') return v;
    if (k === 'hgetall') return async (key) => {
      sent.push(k);
      if (wedged && key.endsWith(':sizes')) throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
      return v.call(t, key);
    };
    if (k === 'del') return async (...a) => { sent.push(k); if (a.flat().some((x) => x.endsWith(':sizes'))) wedged = false; return v.apply(t, a); };
    if (k === 'pipeline') return () => {
      const p = v.call(t);
      return {
        strlen(key) { sent.push('strlen'); p.strlen(key); return this; },
        hgetall(key) { sent.push('hgetall'); p.hgetall(key); return this; },
        exec: () => p.exec(),
      };
    };
    return (...a) => { sent.push(k); return v.apply(t, a); };
  },
});
__setRedis(redis);

let failed = 0;
function ok(cond, label, detail) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}` + (cond || detail === undefined ? '' : `  ${JSON.stringify(detail)}`));
  if (!cond) failed++;
}

const door = makeDoor(handler, surface(null, APEX));
const K = (kind, rest = '') => `pscale-beach-v2:${APEX}:${kind}${rest}`;
const look = async () => { sent = []; return (await door('GET', '')).body; };
const weighed = () => sent.filter((c) => c === 'strlen').length;
// what weighing every listed block, as the index did before, lists
async function everyBlockWeighed(blocks) {
  const out = {};
  for (const n of blocks) { const v = await store.strlen(K('block:', n)); if (v > 0) out[n] = v; }
  return out;
}
const same = async (ix) => JSON.stringify(ix.bytes) === JSON.stringify(await everyBlockWeighed(ix.blocks));

const shelf = (i) => ({ _: `shelf ${i} — ` + 'sand '.repeat(i * 3) + 'é'.repeat(i % 5) });
for (let i = 1; i <= 40; i++) await door('POST', `shelf:${i}`, { content: shelf(i) });

console.log('the first look weighs every block, once');
let ix = await look();
ok(ix.blocks.length === 40 && await same(ix), 'it lists every size exactly as weighing every block lists it, multi-byte text included');
ok(weighed() === 40, 'each block is weighed once', weighed());

console.log('\na quiet surface');
ix = await look();
ok(weighed() === 0 && await same(ix), 'a second look weighs nothing, and lists the same sizes', weighed());
const quiet = sent.length;
for (let i = 41; i <= 80; i++) await door('POST', `shelf:${i}`, { content: shelf(i) });
ix = await look();
ok(weighed() === 40 && ix.blocks.length === 80 && await same(ix), 'forty new blocks are weighed once, on the next look', weighed());
ix = await look();
ok(weighed() === 0 && sent.length === quiet, 'a quiet look costs the same at eighty blocks as at forty', { quiet, now: sent.length, sent });

console.log('\na write through the door');
await door('POST', 'shelf:3', { spindle: '1', content: 'a line grown long ' + 'and longer '.repeat(40) });
ix = await look();
ok(weighed() === 1, 'the next look weighs that block again, and only it', weighed());
ok(ix.bytes['shelf:3'] === await store.strlen(K('block:', 'shelf:3')) && await same(ix), '…at its new size');

console.log('\na write that went round the door (a restore, a migration)');
await store.set(K('block:', 'shelf:5'), { _: 'put back from a copy, much longer: ' + 'z'.repeat(400) });
ix = await look();
ok(weighed() === 0, 'the same day, its kept weight stands (no stamp moved)', weighed());
const kept = await store.get(K('sizes'));
const today = new Date().toISOString().slice(0, 10);
for (const n of Object.keys(kept)) kept[n] = String(kept[n]).replace(`|${today}`, '|2000-01-01');
await store.set(K('sizes'), kept);
ix = await look();
ok(weighed() === 80, 'when the day turns, every block is weighed again', weighed());
ok(ix.bytes['shelf:5'] === await store.strlen(K('block:', 'shelf:5')) && await same(ix), '…so the write round the door is listed truly by then');

console.log('\na block that leaves');
ok((await door('DELETE', 'shelf:7', { confirm: true })).status === 200, 'shelf:7 is wiped through the door');
ix = await look();
ok(!ix.blocks.includes('shelf:7') && !('shelf:7' in ix.bytes) && await same(ix), 'the index lists it no more');
ok(!('shelf:7' in (await store.get(K('sizes')))), '…and its weight leaves the kept sizes with it');

console.log('\nkept sizes a restore has wedged');
wedged = true;
ix = await look();
ok(!wedged && weighed() === 79 && await same(ix), 'unreadable, they are dropped and every block weighed afresh', { wedged, weighed: weighed() });
ix = await look();
ok(weighed() === 0 && await same(ix), '…and the next look weighs nothing again', weighed());

console.log('\nthe rest of the index stands as it was');
ok(ix.touched && ix.born && Object.keys(ix.touched).length === 79 && ix.blocks.every((n) => n in ix.touched), 'touched and born still ride beside the sizes');
ok(/bytes maps each block to its stored size/.test(ix._), 'the index still says what bytes is');

await fs.rm(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall held');
process.exit(failed ? 1 : 0);
