#!/usr/bin/env node
// smoke-copy-world.mjs — a place copied from an open beach into a world behind a members' gate,
// end to end against two freshly-spawned local beaches.
//
//   node scripts/smoke-copy-world.mjs
//
// Proves: a dry run writes nothing and says what would copy and what stays behind; the copy
// carries the law and the pages and every holder's open mirror, never a passport, an archive, a
// probe or an index; the keeper's pass is proved once at the destination's apex; the keeper's
// index is founded in the destination world with the beyond names, so a stranger's index there
// is exactly those, served, while the rest is members-only; a second run replaces what is still
// open and leaves what a holder has re-latched; the sign is re-pointed at the copy, and a block
// still naming the original is said by name; and locks never copy (a copied mirror is open for
// its holder to re-latch).

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const beachScript = fileURLToPath(new URL('./local-beach.mjs', import.meta.url));
const { copy } = await import('./copy-world.mjs');
const W = '/.well-known/pscale-beach';
let fails = 0;
const ok = (c, m, detail) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (!c && detail !== undefined ? '  ← ' + JSON.stringify(detail).slice(0, 220) : '')); if (!c) fails++; };
async function api(surface, method, block, body, pass) {
  const url = block === null ? `${surface}${W}` : `${surface}${W}?block=${encodeURIComponent(block).replace(/%3A/gi, ':')}`;
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json', ...(pass ? { authorization: `Bearer ${pass}` } : {}) }, body: body ? JSON.stringify({ ...body, block }) : undefined });
  let j = null; try { j = await r.json(); } catch { j = null; }
  return { status: r.status, body: j };
}
async function ready(surface) {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`${surface}${W}`); if (r.status < 500) return true; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
const dirS = await fs.mkdtemp(join(os.tmpdir(), 'copy-src-')), dirD = await fs.mkdtemp(join(os.tmpdir(), 'copy-dst-'));
const SRC = 'http://127.0.0.1:8851', DST = 'http://127.0.0.1:8852';
const procs = [
  spawn('node', [beachScript, '--dir', dirS, '--port', '8851', '--origin', '127.0.0.1:8851'], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, BEACH_GATE: '', BEACH_GATE_SECRET: '', BEACH_KEEPERS: '' } }),
  spawn('node', [beachScript, '--dir', dirD, '--port', '8852', '--origin', '127.0.0.1:8852'], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, BEACH_GATE: 'members', BEACH_GATE_SECRET: 'test-gate-secret', BEACH_KEEPERS: 'keeper' } }),
];
try {
  if (!await ready(SRC) || !await ready(DST)) { console.error('a local beach did not start'); process.exit(2); }
  // the source: a place in a world, with its law, its pages, a person and the strays a beach collects
  const from = `${SRC}/w/place`, to = `${DST}/w/place`;
  for (const [name, content, lock] of [
    ['lighthouse', { _: 'LIGHTHOUSE — the place.',
      1: `JOINING — everyone calls pscale_play(world='${from}', handle=<your name>); the door carries the rest.`,
      2: `${from}-annex — a neighbouring place of its own`,
      3: `the place's own index: ${from.replace(/^https?:\/\//, '')}/.well-known/pscale-beach.` }],
    ['policies', { _: 'POLICIES', 2: { _: 'PRIVACY NOTICE' }, 3: `the original stands at ${from}` }],
    ['spine:constitution', { _: 'THE CONSTITUTION' }],
    ['passport:ada', { _: 'ADA' }, 'A1'],
    ['now:ada', { _: 'MIRROR — ada on the now field.' }, 'A1'],
    ['archive:old:2026-01-01', { _: 'set aside' }],
    ['probe:x', { _: 'a probe' }],
  ]) await api(from, 'POST', name, lock ? { content, new_lock: lock } : { content });
  // the destination: the keeper, then the gate up
  await api(DST, 'POST', 'passport:keeper', { content: { _: 'KEEPER' }, new_lock: 'K1' });
  await api(DST, 'POST', 'settings', { content: { _: 'settings' }, new_lock: 'OP' });
  ok((await api(to, 'GET', 'lighthouse')).status === 401, 'the destination world is members-only before the copy');

  console.log('dry run');
  const dry = await copy({ from, to, as: 'keeper', key: 'K1', beyond: ['lighthouse', 'policies'], confirm: false });
  ok(dry.dry && dry.copies.join(',') === 'lighthouse,now:ada,policies,spine:constitution', 'says what copies', dry.copies);
  ok(dry.left.length === 3 && dry.left.every(([n]) => /^(passport|archive|probe):/.test(n)), 'and what stays behind', dry.left);
  ok(JSON.stringify(dry.repointed) === JSON.stringify([['lighthouse', 2]]), 'says the sign would be re-pointed: two of its lines name the original', dry.repointed);
  ok(JSON.stringify(dry.named) === JSON.stringify([['policies', 1]]), 'and names the block that still names the original, to copy as it stands', dry.named);
  ok((await api(to, 'GET', 'lighthouse')).status === 401, 'writes nothing');

  console.log('the copy');
  const r = await copy({ from, to, as: 'keeper', key: 'K1', beyond: ['lighthouse', 'policies'], confirm: true });
  ok(r.pass && r.failed.length === 0 && r.done.length === 4 && r.done.every(([, how]) => how === 'born'), 'four blocks born under the keeper\'s pass', r);
  ok(r.index && r.index.status === 200 && !r.index.stands, "the keeper's index founded in the world", r.index);
  const strangerIdx = await api(to, 'GET', null);
  ok(strangerIdx.status === 200 && strangerIdx.body.blocks.join(',') === 'lighthouse,policies', 'a stranger\'s index in the world is exactly the beyond names', strangerIdx.body);
  ok((await api(to, 'GET', 'policies')).body?.['2']?._ === 'PRIVACY NOTICE', 'and reads one whole');
  const sign = (await api(to, 'GET', 'lighthouse')).body;
  ok(sign?.['1'] === `JOINING — everyone calls pscale_play(world='${to}', handle=<your name>); the door carries the rest.`, 'the copied sign sends a player to the copy behind the wall, not the open original', sign?.['1']);
  ok(sign?.['3'] === `the place's own index: ${to.replace(/^https?:\/\//, '')}/.well-known/pscale-beach.` && sign?.['2'] === `${from}-annex — a neighbouring place of its own`,
    '…written bare where it stood bare, and a longer name left as the other place it is', sign);
  ok(JSON.stringify(r.repointed) === JSON.stringify([['lighthouse', 2]]) && JSON.stringify(r.named) === JSON.stringify([['policies', 1]]), 'the copy says what it re-pointed and what still names the original', { repointed: r.repointed, named: r.named });
  ok((await api(to, 'GET', 'policies')).body?.['3'] === `the original stands at ${from}`, '…which copied as it stands');
  ok((await api(from, 'GET', 'lighthouse')).body?.['1'].includes(`world='${from}'`), 'and the original\'s own sign is untouched');
  ok((await api(to, 'GET', 'spine:constitution')).status === 401 && (await api(to, 'GET', 'now:ada')).status === 401, 'the rest is members-only');
  ok((await api(to, 'GET', 'passport:ada')).status === 401, 'no passport came (the same refusal whether a thing exists or not)');
  const pass = (await api(DST, 'POST', 'passport:keeper', { secret: 'K1' })).body.pass;
  ok((await api(to, 'GET', 'spine:constitution', null, pass)).body?._ === 'THE CONSTITUTION', 'a member reads the law');
  ok((await api(to, 'POST', 'now:ada', { spindle: '1', content: 'open for its holder', secret: 'A1' }, pass)).status === 200, 'a copied mirror is open: no lock came with it');
  ok((await api(to, 'POST', 'now:ada', { new_lock: 'A1' }, pass)).status === 200, 'and its holder re-latches it on first visit');

  console.log('again');
  const r2 = await copy({ from, to, as: 'keeper', key: 'K1', beyond: ['lighthouse', 'policies'], confirm: true });
  ok(r2.done.length === 3 && r2.done.every(([, how]) => how === 'replaced'), 'a second run replaces what is still open, nothing born twice', r2.done);
  ok(r2.failed.length === 1 && r2.failed[0][0] === 'now:ada' && /^403/.test(r2.failed[0][1]), 'and leaves the mirror its holder re-latched: it is theirs now', r2.failed);
  ok((await api(to, 'GET', 'now:ada', null, pass)).body?.['1'] === 'open for its holder', "the holder's line stands");
  ok(r2.index.stands && r2.index.status === 200 && r2.index.appended.length === 0 && (await api(to, 'GET', null)).body.blocks.join(',') === 'lighthouse,policies', "the keeper's index stands and lists nothing twice", r2.index);
  console.log('a long list');
  const many = Array.from({ length: 12 }, (_, i) => `page:${i + 1}`);
  for (const n of many) await api(from, 'POST', n, { content: { _: n.toUpperCase() } });
  const r3 = await copy({ from, to, as: 'keeper', key: 'K1', only: many, beyond: many, confirm: true });
  ok(r3.failed.length === 0 && r3.index.status === 200 && r3.index.appended.length === 12 && r3.index.paid.length >= 1, 'twelve more are appended, the index supernests at the tenth and its summary is paid', r3.index);
  const idx3 = (await api(to, 'GET', null)).body.blocks;
  ok(idx3.length === 14 && many.every((n) => idx3.includes(n)), 'a stranger sees all fourteen beyond names', idx3);

  console.log(fails ? `\n${fails} FAILED` : '\ncopy-world: all pass ✓');
} finally {
  for (const p of procs) p.kill();
  await fs.rm(dirS, { recursive: true, force: true }).catch(() => {});
  await fs.rm(dirD, { recursive: true, force: true }).catch(() => {});
}
process.exit(fails ? 1 : 0);
