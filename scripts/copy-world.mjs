#!/usr/bin/env node
// copy-world.mjs — a place copied from one beach to another, blocks only: the law and the pages
// come, the people do not. DRY-RUN by default; --confirm acts.
//
// Made for a world moving behind a members' gate (bsp-mcp proposals/2026-11-02-leros-on-the-commons-
// the-build-to-completion.md §5 step 5): the gate goes on first, so nothing copied is open to a
// stranger's homestead; passports do not copy, since a member re-enters by invite and founds their
// own; what each holder keeps under their name copies open, and re-latches on their first visit as
// the app's door already does (R2, a write with new_lock under their pass). Locks never copy.
//
//   BEACH_KEY=<the keeper's passphrase> node scripts/copy-world.mjs \
//     --from https://beach.happyseaurchin.com/w/community-recovery \
//     --to https://beach.bringingtheflavour.com/w/community-recovery \
//     --as davidmpinto --beyond lighthouse,policies,constitution [--confirm]
//
//   --from <surface>   a beach, or <beach>/w/<world>; its index names what copies.
//   --to <surface>     the destination beach or world. Blocks already there are replaced whole.
//   --as <handle>      the hand that writes: proved once at the destination's apex with BEACH_KEY
//                      (POST {block: 'passport:<handle>', secret}) for the gate's pass; on an open
//                      beach the proof is an ordinary write and no pass is needed.
//   --skip <prefixes>  comma-joined name prefixes left behind, on top of the ones always left:
//                      passport: archive: probe: index: sed: grain:
//   --only <names>     comma-joined block names: copy these and nothing else.
//   --beyond <names>   comma-joined names a stranger may read at the destination: the keeper's own
//                      index:<as> is founded in the destination world under BEACH_KEY, or grown by
//                      append where it stands, one card per name, its 5 = beyond (shell-indexes
//                      1.111113); a summary the beach says is owed at the tenth is paid.
//   --confirm          act. Without it: what would copy, what would not, and why.

const ALWAYS_SKIP = ['passport:', 'archive:', 'probe:', 'index:', 'sed:', 'grain:'];

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

const trim = (u) => String(u).replace(/\/+$/, '');
const wellKnown = (surface) => `${trim(surface)}/.well-known/pscale-beach`;
const apexOf = (surface) => trim(surface).replace(/\/w\/[^/]+$/, '');

async function call(surface, method, block, body, pass) {
  const url = block === null ? wellKnown(surface) : `${wellKnown(surface)}?block=${encodeURIComponent(block).replace(/%3A/gi, ':')}`;
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(pass ? { authorization: `Bearer ${pass}` } : {}) },
    body: body ? JSON.stringify({ ...body, block }) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  return { status: r.status, body: j };
}

export async function prove(surface, handle, key) {
  if (!handle) return null;
  if (!key) throw new Error('BEACH_KEY is not set — the hand that writes proves its passport with it');
  const r = await call(apexOf(surface), 'POST', `passport:${handle}`, { secret: key });
  if (r.status !== 200) throw new Error(`${apexOf(surface)} refused the proof for ${handle} (${r.status}: ${r.body?.error ?? 'no reason given'})`);
  return typeof r.body?.pass === 'string' ? r.body.pass : null;   // null: an open beach, an ordinary write
}

export async function plan({ from, to, skip = [], only = [] }) {
  const idx = await call(from, 'GET', null);
  if (idx.status !== 200 || !Array.isArray(idx.body?.blocks)) throw new Error(`${from} gave no index (${idx.status})`);
  const skips = [...ALWAYS_SKIP, ...skip];
  const copies = [], left = [];
  for (const name of idx.body.blocks.sort()) {
    if (only.length && !only.includes(name)) { left.push([name, 'not in --only']); continue; }
    const s = skips.find((p) => name.startsWith(p));
    if (s) { left.push([name, `${s} stays behind`]); continue; }
    copies.push(name);
  }
  return { from, to, copies, left };
}

export async function copy({ from, to, as, key, skip, only, beyond = [], confirm, now = new Date() }) {
  const p = await plan({ from, to, skip, only });
  if (!confirm) return { dry: true, ...p, beyond };
  const pass = await prove(to, as, key);
  const done = [], failed = [];
  for (const name of p.copies) {
    const src = await call(from, 'GET', name);
    if (src.status !== 200) { failed.push([name, `read failed (${src.status})`]); continue; }
    const w = await call(to, 'POST', name, { content: src.body, confirm: true }, pass);
    if (w.status === 200) done.push([name, w.body?.born ? 'born' : 'replaced']);
    else failed.push([name, `${w.status}: ${w.body?.error ?? 'no reason given'}`]);
  }
  let index = null;
  if (beyond.length) {
    if (!as || !key) throw new Error('--beyond needs --as <handle> and BEACH_KEY: the index is the keeper\'s own');
    index = await listBeyond({ to, as, key, pass, from, beyond, now });
  }
  return { dry: false, ...p, beyond, pass: !!pass, done, failed, index };
}

// Every `_` line in a block, at any depth: the names an index already lists, however far it has grown.
function lines(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (typeof node._ === 'string') out.push(node._);
  for (const k of Object.keys(node)) if (k !== '_' || typeof node._ === 'object') lines(node[k], out);
  return out;
}

/** The keeper's index in the destination world: founded with its law and the first card, grown by
 *  append for the rest — an index is an accumulator, so the beach allocates each slot and supernests
 *  at the tenth, and a summary it says is owed is paid with one line naming the span. A name already
 *  listed is left as it stands. */
export async function listBeyond({ to, as, key, pass, from, beyond, now = new Date() }) {
  const day = now.toISOString().slice(0, 10);
  const name = `index:${as}`;
  const card = (n) => ({ _: `${n} — copied from ${from} on ${day}; served to anyone`, 1: as, 2: '', 4: 'copy', 5: 'beyond', 6: 'standing' });
  const have = await call(to, 'GET', name, null, pass);
  const stands = have.status === 200;
  const listed = new Set(stands ? lines(have.body).map((l) => l.split(/\s/)[0]) : []);
  const todo = beyond.filter((n) => !listed.has(n));
  const out = { name, stands, appended: [], paid: [], status: 200, error: null };
  if (!todo.length) return out;
  if (!stands) {
    const law = `INDEX — what ${as} holds at ${to} and what each block is to a stranger: one card per block, numbered as it arrives and never renumbered, its 5 the visibility (beyond, beach, self; shell-indexes 1.111113) — the one list the gate reads here. Founded by copy-world on ${day} for the blocks marked beyond; grown by append.`;
    const first = todo.shift();
    const w = await call(to, 'POST', name, { content: { _: law, 1: card(first) }, new_lock: key }, pass);
    if (w.status !== 200) return { ...out, status: w.status, error: w.body?.error ?? null };
    out.appended.push(first);
  }
  for (const n of todo) {
    const w = await call(to, 'POST', name, { append: true, content: card(n), secret: key }, pass);
    if (w.status !== 200) return { ...out, status: w.status, error: `${n}: ${w.body?.error ?? 'no reason given'}` };
    out.appended.push(n);
    for (const owed of w.body?.owed ?? []) {
      const paid = await call(to, 'POST', name, { spindle: owed.slot, content: `${owed.over}: the blocks marked beyond here, each copied from ${from} on ${day}`, secret: key }, pass);
      if (paid.status === 200) out.paid.push(owed.slot);
    }
  }
  return out;
}

async function main() {
  const from = arg('from'), to = arg('to');
  if (!from || !to) { console.error('usage: --from <surface> --to <surface> [--as <handle>] [--skip a:,b:] [--only x,y] [--beyond x,y] [--confirm]   (BEACH_KEY in the env)'); process.exit(2); }
  const r = await copy({ from, to, as: arg('as'), key: process.env.BEACH_KEY, skip: list(arg('skip')), only: list(arg('only')), beyond: list(arg('beyond')), confirm: has('confirm') });
  console.error(`${r.dry ? 'DRY RUN — would copy' : '✓ copied'} ${r.copies.length} block${r.copies.length === 1 ? '' : 's'}  ${r.from} → ${r.to}`);
  for (const n of r.copies) console.error(`  ${r.dry ? '·' : (r.done.find(([d]) => d === n) ? '✓' : '✗')} ${n}${r.dry ? '' : ' — ' + ((r.done.find(([d]) => d === n) || r.failed.find(([d]) => d === n))?.[1] ?? '')}`);
  for (const [n, why] of r.left) console.error(`  – ${n} (${why})`);
  if (r.beyond.length) console.error(`  beyond, in index:${arg('as') ?? '<as>'} at the destination: ${r.beyond.join(', ')}${r.index ? ` — ${r.index.status === 200 ? `${r.index.stands ? 'stood; ' : 'founded; '}${r.index.appended.length} listed${r.index.paid.length ? `, ${r.index.paid.length} summar${r.index.paid.length === 1 ? 'y' : 'ies'} paid` : ''}` : `refused ${r.index.status}: ${r.index.error}`}` : ''}`);
  if (r.dry) console.error('Re-run with --confirm to act.');
  else if (r.failed.length || (r.index && r.index.status !== 200)) process.exit(1);
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(`refused: ${e.message}`); process.exit(1); });
}
