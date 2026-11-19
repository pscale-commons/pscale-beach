#!/usr/bin/env node
// smoke-index-check.mjs — the checker (scripts/index-check.mjs; shell-indexes step 1) end to end
// against two freshly-spawned local beaches, one open and one behind the members' gate, three
// handles.
//
//   npm run smoke:index-check
//
// Proves: a beach with no index reports every named-for block UNLISTED, and a dry run writes
// nothing; --confirm founds the index in one write and lists in born order, read back at pscale 0
// as its next reader receives it; the tenth entry supernests, 10 is owed and paid from the names,
// and 07 still reads; a block latched under the key with another's name shows under --latches and
// is listed with --take; a removed block shows GONE until its 6 says how it left; a snapshot under
// the name, and a card holding copied state, show ODD; at the gated beach a stranger is refused,
// the wire half proves a pass and reads as a member, and the index is founded marking itself self;
// a colour: block is reported and never listed; and no line of any output carries the key.

import { spawn, execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const beachScript = fileURLToPath(new URL('./local-beach.mjs', import.meta.url));
const checker = fileURLToPath(new URL('./index-check.mjs', import.meta.url));
const { readSurface, check, act, latches, store } = await import('./index-check.mjs');
const W = '/.well-known/pscale-beach';
let fails = 0;
const ok = (c, m, detail) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (!c && detail !== undefined ? '  ← ' + JSON.stringify(detail).slice(0, 240) : '')); if (!c) fails++; };
async function api(surface, method, block, body, pass, query = '') {
  const url = block === null ? `${surface}${W}` : `${surface}${W}?block=${encodeURIComponent(block).replace(/%3A/gi, ':')}${query}`;
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// births one after another, each a little later than the last, so the born order is not the name order
async function found(surface, names, lock, pass) {
  for (const [name, content] of names) { await api(surface, 'POST', name, { content, ...(lock ? { new_lock: lock } : {}) }, pass); await sleep(3); }
}
const run = async (args, env) => {
  try { const { stdout, stderr } = await promisify(execFile)('node', [checker, ...args], { env: { ...process.env, ...env } }); return { code: 0, out: stdout + stderr }; }
  catch (e) { return { code: e.code, out: String(e.stdout) + String(e.stderr) }; }
};

const A = 'ada-key-7f3e9c1b', B = 'bob-key-2d8a4e6f', C = 'cy-key-9b1c3d5e', K = 'keeper-key-4a2b6d', OP = 'op-latch-1c3e5a';
const dirO = await fs.mkdtemp(join(os.tmpdir(), 'index-open-')), dirG = await fs.mkdtemp(join(os.tmpdir(), 'index-gated-'));
const O = 'http://127.0.0.1:8861', G = 'http://127.0.0.1:8862';
const procs = [
  spawn('node', [beachScript, '--dir', dirO, '--port', '8861', '--origin', '127.0.0.1:8861'], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, BEACH_GATE: '', BEACH_GATE_SECRET: '', BEACH_KEEPERS: '' } }),
  spawn('node', [beachScript, '--dir', dirG, '--port', '8862', '--origin', '127.0.0.1:8862'], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, BEACH_GATE: 'members', BEACH_GATE_SECRET: 'test-gate-secret', BEACH_KEEPERS: 'keeper' } }),
];
try {
  if (!await ready(O) || !await ready(G)) { console.error('a local beach did not start'); process.exit(2); }

  // ── the open beach: three holders ──
  await found(O, [['passport:ada', { _: 'ADA' }], ['shell:ada', { _: 'SHELL' }], ['history:ada', { _: 'HISTORY' }], ['stash:ada', { _: 'STASH' }],
    ['poems:ada', { _: 'POEMS' }], ['now:ada', { _: 'NOW' }], ['thread:ada', { _: 'THREADS' }], ['days:ada', { _: 'DAYS' }], ['pool:ada', { _: 'POOL' }],
    ['colour:ada', { _: 'a colour' }], ['now:adaa', { _: "a mistyped handle's mirror" }]], A);
  await found(O, [['passport:bob', { _: 'BOB' }], ['shell:bob', { _: 'SHELL' }], ['history:bob', { _: 'HISTORY' }], ['stash:bob', { _: 'STASH' }],
    ['index:bob', { _: 'the beach index as bob saw it on 2026-11-01', 1: 'passport:ada, passport:bob, shell:ada, shell:bob, now:ada', 2: 'and the rest, comma-joined' }]], B);
  await found(O, [['passport:cy', { _: 'CY' }], ['shell:cy', { _: 'SHELL' }], ['history:cy', { _: 'HISTORY' }], ['stash:cy', { _: 'STASH' }], ['notes:cy', { _: 'NOTES' }],
    ['index:cy', { _: "cy's index", 1: { _: 'passport:cy', 1: 'cy' }, 2: { _: 'shell:cy', 1: 'cy' }, 3: { _: 'history:cy', 1: 'cy' }, 4: { _: 'stash:cy', 1: 'cy' }, 5: { _: 'index:cy', 1: 'cy' },
      6: { _: 'notes:cy — my notes', 1: 'cy', 6: 'live, 3 entries', 7: 'the latest line' }, 7: { _: 'poems:cy', 1: 'cy' }, 8: { _: 'old:cy', 1: 'cy', 6: 'set aside to archive:old:cy:2026-10-01' } }]], C);

  console.log('\n— a beach with no index: everything named for the holder is UNLISTED —');
  let surface = await readSurface(O);
  let rep = await check({ beach: O, surface, handles: ['ada'] });
  let h = rep.handles[0];
  ok(!h.stands && h.entries === 0, 'index:ada: none stands', h);
  ok(h.unlisted.map((u) => u.name).join(',') === 'passport:ada,shell:ada,history:ada,stash:ada,poems:ada,now:ada,thread:ada,days:ada,pool:ada,colour:ada', 'ten blocks UNLISTED, in born order (not name order)', h.unlisted.map((u) => u.name));
  ok(h.unlisted.every((u) => u.born === new Date().toISOString().slice(0, 10)), 'each with its born day', h.unlisted);
  ok(h.unlisted.find((u) => u.name === 'colour:ada')?.sealed === true, 'the colour: name is marked: listed only sealed');
  ok(!h.unlisted.some((u) => u.name === 'now:adaa'), "now:adaa is nobody's by the last-word rule (named for adaa)");
  ok(h.gone.length === 0 && h.owed.length === 0 && h.odd.length === 0, 'nothing GONE, OWED or ODD');
  ok((await api(O, 'GET', 'index:ada')).status === 404, 'a dry run writes nothing');

  console.log('\n— --confirm: founded in one write, listed in born order, read back at pscale 0 —');
  let acted = await act({ beach: O, surface, handle: 'ada', key: A, report: h });
  ok(acted.founded && !acted.refused, 'index:ada founded', acted);
  ok(acted.listed.map(([n, s]) => `${n}@${s}`).join(',') === 'poems:ada@6,now:ada@7,thread:ada@8,days:ada@9,pool:ada@11', 'five appended in born order; the tenth entry lands at 11', acted.listed);
  ok(acted.paid.join(',') === '10', 'the summary at 10 is owed and paid', acted.paid);
  ok(acted.skipped.length === 1 && acted.skipped[0][0] === 'colour:ada', 'colour:ada is reported, not listed', acted.skipped);
  let back = await api(O, 'GET', 'index:ada', null, null, '&pscale=0');
  let ents = (back.body?.entries || []).filter((e) => e.address !== '0');
  ok(back.body?.floor === 2 && ents.map((e) => e.address).join(',') === '1,2,3,4,5,6,7,8,9,11', 'at pscale 0 the next reader receives 1 to 9 and 11 at floor 2 (the beach\'s own form; 07 reads 7)', back.body);
  ok(ents.map((e) => e.content).join(',') === 'passport:ada,shell:ada,history:ada,stash:ada,index:ada,poems:ada,now:ada,thread:ada,days:ada,pool:ada', 'the lines are the names, the four organs then the index then the rest as born', ents.map((e) => e.content));
  ok((back.body?.entries || [])[0]?.content?.startsWith("ada's index at 127.0.0.1:8861: one entry for each thing ada holds here"), 'the underscore is the law of §4.2', (back.body?.entries || [])[0]);
  let raw = await api(O, 'GET', 'index:ada');
  const at = (p) => p.split('').reduce((n, d) => (n == null ? n : n[d === '0' ? '_' : d]), raw.body);
  ok(at('01')?.['1'] === 'ada' && typeof at('01')?.['3'] === 'string' && at('01')['3'] === surface.born['passport:ada'], "01's card: 1 the handle, 3 the born date the beach has", at('01'));
  ok(at('05')?._ === 'index:ada' && at('05')?.['1'] === 'ada' && /^\d{4}-/.test(at('05')?.['3'] || '') && at('05')?.['5'] === undefined, "05 is the index itself; on an open beach no 5 is written", at('05'));
  ok(at('11')?._ === 'pool:ada' && at('11')?.['1'] === 'ada' && /^\d{4}-/.test(at('11')?.['3'] || ''), 'an appended entry: the name, the handle, the beach\'s stamp at 3', at('11'));
  ok(['01', '02', '03', '04', '05', '06', '07', '08', '09', '11'].every((p) => at(p)?.['5'] === undefined && at(p)?.['9'] === undefined), 'no 5 and no 9 anywhere: they are the holder\'s');
  ok((await api(O, 'GET', 'index:ada', null, null, '&spindle=10')).body?._ === '1-9: passport:ada, shell:ada, history:ada, stash:ada, index:ada, poems:ada, now:ada, thread:ada, days:ada', 'the summary at 10 is the names of the nine it closes', (await api(O, 'GET', 'index:ada', null, null, '&spindle=10')).body);
  ok((await api(O, 'GET', 'index:ada', null, null, '&spindle=07')).body?._ === 'now:ada' && (await api(O, 'GET', 'index:ada', null, null, '&spindle=7')).body?._ === 'now:ada', '07 still reads (and 7 pads to it)');
  surface = await readSurface(O);
  rep = await check({ beach: O, surface, handles: ['ada'] }); h = rep.handles[0];
  ok(h.stands && h.floor === 2 && h.entries === 10, 'read back: stands, ten entries at floor 2', h);
  ok(h.unlisted.map((u) => u.name).join(',') === 'colour:ada' && h.owed.length === 0 && h.gone.length === 0 && h.odd.length === 0, 'only the colour: name stays UNLISTED; nothing owed', h);
  ok(!acted.refused && (await act({ beach: O, surface, handle: 'ada', key: A, report: h })).listed.length === 0, 'a second --confirm lists nothing twice');

  console.log('\n— --latches: what the key opens under other names —');
  const redis = await store(dirO);
  let elsewhere = await latches({ redis, origin: '127.0.0.1:8861', handle: 'ada', key: A });
  ok(elsewhere.join(',') === 'now:adaa', 'now:adaa, latched under ada\'s key and named for adaa, is LATCHED ELSEWHERE', elsewhere);
  ok((await latches({ redis, origin: '127.0.0.1:8861', handle: 'bob', key: B })).length === 0, "bob's key opens nothing under other names");
  acted = await act({ beach: O, surface, handle: 'ada', key: A, report: h, take: ['now:adaa', 'nothing:here'] });
  ok(acted.listed.map(([n, s]) => `${n}@${s}`).join(',') === 'now:adaa@12' && acted.skipped.some(([n]) => n === 'nothing:here'), '--take lists the chosen name at 12 and refuses a name not on the surface', acted);

  console.log('\n— GONE: a block removed, until its 6 says how it left —');
  ok((await api(O, 'DELETE', 'poems:ada', { confirm: true, secret: A })).status === 200, 'poems:ada is wiped under its key');
  surface = await readSurface(O);
  h = (await check({ beach: O, surface, handles: ['ada'] })).handles[0];
  ok(h.gone.length === 1 && h.gone[0].address === '6' && h.gone[0].name === 'poems:ada', '6 poems:ada is GONE', h.gone);
  ok((await api(O, 'POST', 'index:ada', { spindle: '06.6', content: 'set aside to archive:poems:ada:2026-11-04', secret: A })).status === 200, 'its 6 is written at 06.6');
  h = (await check({ beach: O, surface, handles: ['ada'] })).handles[0];
  ok(h.gone.length === 0 && h.odd.length === 0, 'and it is GONE no longer', h);

  console.log('\n— ODD: a snapshot under the name; a card holding copied state —');
  rep = await check({ beach: O, surface, all: true });
  ok(rep.handles.map((x) => x.handle).join(',') === 'ada,bob,cy', '--all finds every passport', rep.handles.map((x) => x.handle));
  const bob = rep.handles[1], cy = rep.handles[2];
  ok(bob.stands && bob.odd.length === 1 && bob.odd[0].address === null && /does not read as an index/.test(bob.odd[0].why), 'index:bob, a snapshot of the beach index, does not read as an index', bob.odd);
  ok(bob.gone.length === 0 && bob.unlisted.length === 5, 'a snapshot lists nothing: all five of bob\'s are UNLISTED', bob);
  ok(cy.odd.length === 2 && cy.odd.every((o) => o.address === '6') && /its 6 reads "live, 3 entries" while notes:cy stands/.test(cy.odd[0].why) && /7 and 8 stay free/.test(cy.odd[1].why), "cy's card at 6 holds copied state: a 6 while the block stands, a 7", cy.odd);
  ok(cy.gone.length === 1 && cy.gone[0].address === '7' && cy.gone[0].name === 'poems:cy', 'poems:cy, listed and never founded, is GONE', cy.gone);
  ok(!cy.gone.some((g) => g.name === 'old:cy'), 'old:cy, whose 6 says it was set aside, is not', cy.gone);
  ok(cy.unlisted.length === 0 && cy.owed.length === 0, 'everything cy holds is listed');

  console.log('\n— the gated beach: a stranger is refused, a member proves and reads, the index is founded self —');
  await found(G, [['passport:keeper', { _: 'KEEPER' }]], K);
  await found(G, [['passport:ada', { _: 'ADA' }], ['shell:ada', { _: 'SHELL' }], ['history:ada', { _: 'HISTORY' }], ['stash:ada', { _: 'STASH' }], ['now:ada', { _: 'NOW' }], ['days:ada', { _: 'DAYS' }]], A);
  ok((await api(G, 'POST', 'settings', { content: { _: 'the beach settings' }, new_lock: OP })).status === 200, 'settings latched: the gate is up');
  rep = await check({ beach: G, surface: await readSurface(G), handles: ['ada'] });
  ok(rep.stranger && /members' beach/.test(rep.handles[0].refused || ''), "a stranger's run says so and reads no index", rep.handles[0]);
  let r = await run(['--beach', G, '--as', 'ada', '--json'], { BEACH_KEY: A });
  ok(r.code === 0 && !r.out.includes(A), 'the member\'s run exits 0 and no line of its output carries the key');
  let j = null; try { j = JSON.parse(r.out); } catch { j = null; }
  ok(j?.members === true && j.handles?.[0]?.unlisted?.map((u) => u.name).join(',') === 'passport:ada,shell:ada,history:ada,stash:ada,now:ada,days:ada', 'the wire half proves a pass and reads as the member: six UNLISTED', j?.handles?.[0]);
  r = await run(['--beach', G, '--as', 'ada', '--confirm'], { BEACH_KEY: A });
  ok(r.code === 0 && !r.out.includes(A) && /founded index:ada/.test(r.out) && /listed 2: now:ada at 6, days:ada at 7/.test(r.out), '--confirm as the member founds and lists; the key is in no line of the output', r.out.slice(0, 400));
  const pass = (await api(G, 'POST', 'passport:ada', { secret: A })).body?.pass;
  back = await api(G, 'GET', 'index:ada', null, pass, '&pscale=0');
  ents = (back.body?.entries || []).filter((e) => e.address !== '0');
  ok(ents.map((e) => `${e.address}:${e.content}`).join(',') === '1:passport:ada,2:shell:ada,3:history:ada,4:stash:ada,5:index:ada,6:now:ada,7:days:ada', 'read back as a member at pscale 0', ents);
  const five = await api(G, 'GET', 'index:ada', null, pass, '&spindle=5');
  ok(five.body?.['5'] === 'self' && five.body?.['1'] === 'ada', "the index's own card says self at a members' beach", five.body);
  ok((await api(G, 'GET', 'index:ada')).status === 401, 'so a stranger is refused it, as the gate reads an index about itself');
  ok((await api(G, 'GET', 'index:ada', null, pass, '&spindle=6')).body?.['5'] === undefined, 'and no other entry carries a 5');

  console.log('\n— the command line —');
  r = await run(['--beach', O, '--handle', 'ada', '--latches', '--dir', dirO], { BEACH_KEY: A });
  ok(r.code === 0 && !r.out.includes(A) && /LATCHED ELSEWHERE 1/.test(r.out) && /now:adaa — latched under this key, named for adaa; listed/.test(r.out) && /UNLISTED 1/.test(r.out), 'a keyed --latches run: the report says what the key opens elsewhere and that it is listed; no line carries the key', r.out.slice(0, 300));
  r = await run(['--beach', O, '--all', '--json'], {});
  try { j = JSON.parse(r.out); } catch { j = null; }
  ok(r.code === 0 && j?.handles?.length === 3 && j.handles[1].odd[0].line === 'index:bob', '--all --json is one JSON object, three holders', r.out.slice(0, 200));
  r = await run(['--beach', O, '--handle', 'cy'], {});
  ok(r.code === 0 && /index:cy — stands, 8 entries at floor 1 · UNLISTED 0 · GONE 1 · OWED 0 · ODD 2/.test(r.out), 'the text report counts each list', r.out.slice(0, 300));
  r = await run(['--beach', O], {});
  ok(r.code === 2, 'no holder named: usage, exit 2');
  r = await run(['--beach', O, '--handle', 'ada', '--confirm'], {});
  ok(r.code === 2 && /BEACH_KEY is not set/.test(r.out), '--confirm without BEACH_KEY is refused before anything is read');

  console.log(fails ? `\n${fails} FAILED` : "\nthe checker: all pass ✓");
} finally {
  for (const p of procs) p.kill();
  await fs.rm(dirO, { recursive: true, force: true }).catch(() => {});
  await fs.rm(dirG, { recursive: true, force: true }).catch(() => {});
}
process.exit(fails ? 1 : 0);
