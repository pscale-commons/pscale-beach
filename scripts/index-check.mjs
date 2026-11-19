#!/usr/bin/env node
// index-check.mjs — every holder's index measured against what the beach holds, and founded by
// the same hand (shell-indexes, step 1: bsp-mcp proposals/2026-11-03-shell-indexes-one-index-per-
// holder.md §4.3 and §8). A REPORT, never a gate: dry unless --confirm, and it exits 0 whatever it
// finds (2 when it cannot start, 1 when an act it was asked for was refused).
//
//   node scripts/index-check.mjs --beach https://beach.happyseaurchin.com --handle weft
//   node scripts/index-check.mjs --beach https://beach.happyseaurchin.com --all --json
//   BEACH_KEY=<the member's passphrase> node scripts/index-check.mjs --beach https://beach.x.com --as ada
//   set -a; . <clone>/.env.local; set +a
//   BEACH_KEY=<the holder's passphrase> node scripts/index-check.mjs --beach … --handle ada --latches
//   BEACH_KEY=<the holder's passphrase> node scripts/index-check.mjs --beach … --handle ada --confirm [--take now:adda]
//
//   --beach <url>   the surface (default BEACH_URL): a beach, or <beach>/w/<world>.
//   --handle <h>    one holder. --all: every handle with a passport on the surface, and every
//                   index:<h> that stands, whoever h is.
//   --as <h>        at a members' beach, the member who reads: their passport proved once with
//                   BEACH_KEY for the gate's pass, as the router does. --handle defaults to it.
//   --json          the report as one JSON object on stdout.
//   --latches       the operator half. With the store (the clone's .env.local sourced, or --dir
//                   <folder> for a local beach) and BEACH_KEY, the key is hashed against every root
//                   latch as the handler hashes it: LATCHED ELSEWHERE is what it opens whose name is
//                   not the holder's. The store is read and nothing written; the door is not asked,
//                   so no wrong key is noted anywhere.
//   --confirm       act, with BEACH_KEY: found index:<h> where none stands; append every UNLISTED
//                   name in born order, and the LATCHED ELSEWHERE names the holder chooses with
//                   --take <names> (comma-joined); pay every OWED summary from the names. Then read
//                   it back and report again.
//
// THE WIRE HALF needs no key and runs against any beach. It reads the surface index once (names,
// born) and each holder's index:<h> once, whole, as the gate's own holderIndex reads it — pscale 0
// shows the lines but not the cards — and reports four lists per holder:
//   UNLISTED  blocks named for the holder by the last-word rule (the word after the last colon;
//             sed: grain: archive: probe: are nobody's, as the gate and handle_bound read it) that
//             the index does not name, in born order, a block with no born stamp before every block
//             with one. A colour: name among them is marked: listed only sealed, never here.
//   GONE      entries whose block does not stand and whose 6 says nothing of its leaving. A line
//             the tombstone left (REMOVED …) has said it.
//   OWED      the summaries the index owes, by the beach's own law (api/floor.js owedSummaries).
//   ODD       an index: block that does not read as an index (no entry of it is a block's name:
//             index:waer, a snapshot of the beach index); an entry whose line is not a block's
//             name; a card holding copied state (a 6 while the block stands, a 7 or an 8).
//
// WHAT --confirm WRITES, and never writes. The index is founded in ONE write latched with the key:
// the underscore of the design's §4.2; 1 to 4 the four organs, passport, shell, history and stash,
// 5 the index itself — each at its fixed number whether or not the organ stands yet, since an empty
// slot would be taken by the next append, and one that does not stand reads GONE until it does;
// each card's 1 the handle, its 3 the born date where the beach has one. Then one append per
// UNLISTED name, {_: name, 1: handle}, the beach stamping 3 and naming what it makes owed, and each
// debt paid as the names of the nine it closes. No 5 and no 9 for any thing, which are the
// holder's, save the index's own 5 at a members' beach, founded self (§5.3). THE KEY IS A POINTER:
// read from the environment only, never printed, never in a file, a block or the report.

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { floorDepth, owedSummaries, rawWalk } from '../api/floor.js';
import { prove } from './copy-world.mjs';

const NOBODYS = ['sed:', 'grain:', 'archive:', 'probe:'];
const ORGANS = ['passport', 'shell', 'history', 'stash'];

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const trim = (u) => String(u).replace(/\/+$/, '');

async function call(surface, method, block, body, pass, query = '') {
  const url = `${trim(surface)}/.well-known/pscale-beach${block === null ? '' : `?block=${encodeURIComponent(block).replace(/%3A/gi, ':')}${query}`}`;
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json', ...(pass ? { authorization: `Bearer ${pass}` } : {}) },
    body: body ? JSON.stringify({ ...body, block }) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch { j = null; }
  return { status: r.status, body: j };
}

/** The handle a block is named for by the last-word rule, or null: nobody's. */
export function holderOf(name) {
  const cut = name.lastIndexOf(':');
  if (cut <= 0 || cut === name.length - 1 || NOBODYS.some((p) => name.startsWith(p))) return null;
  return name.slice(cut + 1);
}

/** An index's entries, each at its address as the beach's own disc at pscale 0 gives it (entry 7
 *  of a wrapped block is 7, and 07 reads it): the gate's own walk, entries at depth = floor, a bare
 *  string read as its line. */
export function entriesOf(index) {
  const floor = Math.max(1, floorDepth(index));
  const out = [];
  const walk = (node, depth, path) => {
    if (depth === floor) { out.push({ address: path.join('').replace(/^0+(?=\d)/, ''), node }); return; }
    if (!node || typeof node !== 'object') return;
    if (node._ && typeof node._ === 'object') walk(node._, depth + 1, path.concat('0'));
    for (const d of '123456789') if (d in node) walk(node[d], depth + 1, path.concat(d));
  };
  walk(index, 0, []);
  return out;
}
const lineOf = (node) => (typeof node === 'string' ? node : node && typeof node === 'object' && typeof node._ === 'string' ? node._ : '');
const nameOf = (line) => line.split(' — ')[0].trim();
const field = (node, k) => { const v = node && typeof node === 'object' ? node[k] : undefined; return typeof v === 'string' ? v.trim() : v && typeof v === 'object' && typeof v._ === 'string' ? v._.trim() : ''; };
const nameShaped = (s) => /^[^,\n]{1,120}$/.test(s);

/** The underscore every index is born carrying (the design's §4.2). */
export const law = (handle, beach) =>
  `${handle}'s index at ${beach}: one entry for each thing ${handle} holds here, numbered as it arrives and never renumbered or reused; ` +
  `each entry's line is the thing's address, and beneath it its card: 1 who wrote the entry, 2 what the thing is of, 3 when it arrived, ` +
  `4 a kind word, 5 who may see it, beyond, beach, self or a colour rule, and where it is absent this beach's own default, 6 how it left ` +
  `once it has, 9 why it is kept. 1 to 4 are passport, shell, history and stash, 5 this index, the rest as born. A birth under ${handle}'s ` +
  `key is appended by the beach; a field is set by a write at its address; each summary owed is the names of the nine it closes.`;

export async function readSurface(beach, pass = null) {
  const r = await call(beach, 'GET', null, null, pass);
  if (r.status !== 200 || !Array.isArray(r.body?.blocks)) throw new Error(`${beach} gave no index (${r.status}: ${r.body?.error ?? 'no reason given'})`);
  return r.body;
}
const handlesOf = (surface) => [...new Set(surface.blocks.flatMap((n) => (n.startsWith('passport:') ? [n.slice(9)] : n.startsWith('index:') ? [n.slice(6)] : [])))].filter(Boolean).sort();

/** The wire half: one holder measured against the surface. */
export async function checkHandle({ beach, surface, handle, pass = null }) {
  const born = surface.born || {};
  const byBirth = (a, b) => ((born[a] || '') < (born[b] || '') ? -1 : (born[a] || '') > (born[b] || '') ? 1 : a < b ? -1 : a > b ? 1 : 0);
  const name = `index:${handle}`;
  const named = surface.blocks.filter((n) => holderOf(n) === handle);
  const r = { handle, index: name, stands: surface.blocks.includes(name), floor: 0, entries: 0, refused: null, listed: [], unlisted: [], gone: [], owed: [], odd: [] };
  let index = null;
  if (r.stands) {
    const got = await call(beach, 'GET', name, null, pass);
    if (got.status !== 200) { r.refused = `${got.status}: ${got.body?.error ?? 'no reason given'}`; return r; }
    index = got.body;
    r.floor = floorDepth(index);
  }
  const on = new Set(surface.blocks);
  const listed = new Set();
  const ents = index ? entriesOf(index) : [];
  r.entries = ents.length;
  let unshaped = 0;
  for (const e of ents) {
    const line = lineOf(e.node);
    const cand = nameOf(line);
    const hit = on.has(cand) ? cand : named.find((n) => line === n || line.startsWith(n + ' '));
    const six = field(e.node, '6');
    if (hit) {
      listed.add(hit);
      if (six) r.odd.push({ address: e.address, line: cand, why: `its 6 reads "${six}" while ${hit} stands: 6 is how a thing left, once it has` });
    } else if (!nameShaped(cand)) {
      unshaped++;
      r.odd.push({ address: e.address, line: cand.slice(0, 60), why: "its line is not a block's name" });
    } else if (!six && !/^REMOVED /.test(line)) {
      r.gone.push({ address: e.address, name: cand });
    }
    if (field(e.node, '7') || field(e.node, '8')) r.odd.push({ address: e.address, line: cand, why: '7 and 8 stay free: the card holds copied state' });
  }
  if (ents.length && unshaped === ents.length) {
    r.odd = [{ address: null, line: name, why: `does not read as an index: ${ents.length === 1 ? 'its one entry is not' : `none of its ${ents.length} entries is`} a block's name` }];
    r.gone = [];
  }
  r.listed = [...listed];
  r.unlisted = named.filter((n) => !listed.has(n)).sort(byBirth).map((n) => ({ name: n, born: born[n] ? String(born[n]).slice(0, 10) : null, ...(n.startsWith('colour:') ? { sealed: true } : {}) }));
  r.owed = index ? owedSummaries(index) : [];
  return r;
}

export async function check({ beach, surface, handles = [], all = false, pass = null }) {
  const origin = surface.origin || new URL(beach).host;
  const stranger = !pass && /members' beach/.test(surface._ || '');
  const rep = { beach: trim(beach), origin, members: !!pass, stranger, handles: [] };
  for (const h of all ? handlesOf(surface) : handles) {
    rep.handles.push(stranger
      ? { handle: h, index: `index:${h}`, refused: `${origin} is its members' beach: read it with --as <member> and BEACH_KEY` }
      : await checkHandle({ beach, surface, handle: h, pass }));
  }
  return rep;
}

// ── the operator half ──

const NS = 'pscale-beach-v2';
/** A root latch as the handler hashes it (wire-frozen salts; a grain has no root latch). */
export function rootHash(origin, name, key) {
  if (name.startsWith('grain:')) return null;
  const salt = name.startsWith('sed:') ? `${key}${name.slice(4)}_` : `${key}block:https://${origin}:${name}:_`;
  return createHash('sha256').update(salt).digest('hex');
}
export async function store(dir) {
  if (dir) { const { FileRedis } = await import('./file-redis.mjs'); return new FileRedis(dir); }
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("--latches needs the store: source the clone's .env.local, or --dir <folder> for a local beach");
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url, token });
}
/** LATCHED ELSEWHERE: the blocks this key latches at their root whose name is not the holder's. */
export async function latches({ redis, origin, handle, key }) {
  const prefix = `${NS}:${origin}:locks:`;
  const out = [];
  for (const k of (await redis.keys(`${prefix}*`)).sort()) {
    const name = k.slice(prefix.length);
    if (holderOf(name) === handle) continue;
    const locks = await redis.get(k);
    const root = locks && typeof locks === 'object' ? locks._ : undefined;
    if (root && rootHash(origin, name, key) === root) out.push(name);
  }
  return out;
}

// ── --confirm ──

/** The nine lines a container's underscore closes, by their names. */
function closes(index, over) {
  const p = over.split('-')[0].slice(0, -1);
  const under = '_'.repeat(Math.max(0, floorDepth(index) - 1 - p.length));
  const names = [];
  for (const d of '123456789') { const n = rawWalk(index, under + p + d); if (n !== undefined) names.push(nameOf(lineOf(n)) || '—'); }
  return names;
}

export async function act({ beach, surface, handle, key, pass = null, report, take = [], now = new Date() }) {
  if (!key) throw new Error('BEACH_KEY is not set — the index is founded and grown under its holder\'s own key');
  const name = `index:${handle}`;
  const origin = surface.origin || new URL(beach).host;
  const born = surface.born || {};
  const out = { founded: false, listed: [], paid: [], skipped: [], refused: null };
  const onSurface = new Set(surface.blocks);
  const listedNow = new Set();
  if (!report.stands) {
    const card = (n) => ({ _: n, 1: handle, ...(born[n] ? { 3: born[n] } : {}) });
    const content = { _: law(handle, origin) };
    ORGANS.forEach((o, i) => { content[String(i + 1)] = card(`${o}:${handle}`); listedNow.add(`${o}:${handle}`); });
    content['5'] = { _: name, 1: handle, 3: now.toISOString(), ...(pass ? { 5: 'self' } : {}) };
    listedNow.add(name);
    const w = await call(beach, 'POST', name, { content, new_lock: key }, pass);
    if (w.status !== 200) return { ...out, refused: `founding ${name}: ${w.status} ${w.body?.error ?? 'no reason given'}` };
    out.founded = true;
  }
  const pay = async (owed) => {
    const got = await call(beach, 'GET', name, null, pass);
    if (got.status !== 200) return;
    const text = `${owed.over}: ${closes(got.body, owed.over).join(', ')}`;
    const w = await call(beach, 'POST', name, { spindle: owed.slot, content: text, secret: key }, pass);
    if (w.status === 200) out.paid.push(owed.slot);
    else out.skipped.push([`summary ${owed.slot}`, `${w.status} ${w.body?.error ?? 'no reason given'}`]);
  };
  const todo = [...report.unlisted.map((u) => u.name), ...take].filter((n, i, a) => a.indexOf(n) === i && !listedNow.has(n));
  for (const n of todo) {
    if (n.startsWith('colour:')) { out.skipped.push([n, 'a colour: name is listed only sealed, from a door that seals']); continue; }
    if (!onSurface.has(n)) { out.skipped.push([n, 'no such block on the surface']); continue; }
    const w = await call(beach, 'POST', name, { append: true, content: { _: n, 1: handle }, secret: key }, pass);
    if (w.status !== 200) { out.refused = `listing ${n}: ${w.status} ${w.body?.error ?? 'no reason given'}`; return out; }
    out.listed.push([n, w.body?.slot]);
    for (const o of w.body?.owed ?? []) await pay(o);
  }
  for (const o of report.owed.filter((o) => !out.paid.includes(o.slot))) await pay(o);
  return out;
}

// ── the report ──

export function render(rep, acted = null) {
  const L = [];
  const n = (k, v) => `${v} ${k}${v === 1 ? '' : 's'}`;
  if (acted) {
    L.push(`${acted.founded ? `✓ founded index:${rep.handles[0]?.handle} at ${rep.origin}, in one write latched under the holder's key` : `· index:${rep.handles[0]?.handle} stood`}`);
    if (acted.listed.length) L.push(`✓ listed ${acted.listed.length}: ${acted.listed.map(([a, s]) => `${a} at ${s}`).join(', ')}`);
    if (acted.paid.length) L.push(`✓ paid ${n('summary', acted.paid.length).replace('summarys', 'summaries')}: ${acted.paid.join(', ')}`);
    for (const [a, why] of acted.skipped) L.push(`– ${a}: ${why}`);
    if (acted.refused) L.push(`✗ refused — ${acted.refused}`);
    L.push('');
  }
  L.push(`${rep.origin} — ${n('holder', rep.handles.length)}${rep.members ? ', read as a member' : rep.stranger ? ', read as a stranger' : ''}`);
  const sum = { unlisted: 0, gone: 0, owed: 0, odd: 0 };
  for (const h of rep.handles) {
    if (h.refused) { L.push(`${h.index} — ${h.refused}`); continue; }
    L.push(`${h.index} — ${h.stands ? `stands, ${n('entry', h.entries).replace('entrys', 'entries')} at floor ${h.floor}` : 'none stands'} · UNLISTED ${h.unlisted.length} · GONE ${h.gone.length} · OWED ${h.owed.length} · ODD ${h.odd.length}${h.latched_elsewhere ? ` · LATCHED ELSEWHERE ${h.latched_elsewhere.length}` : ''}`);
    for (const k of Object.keys(sum)) sum[k] += h[k].length;
    const show = (title, items, f) => { if (!items.length) return; L.push(`  ${title} (${items.length})`); for (const i of items) L.push(`    ${f(i)}`); };
    show('UNLISTED, in born order', h.unlisted, (u) => `${u.name}${u.born ? `  ${u.born}` : ''}${u.sealed ? '  — a colour: name, listed only sealed' : ''}`);
    show('GONE', h.gone, (g) => `${g.address}  ${g.name} — does not stand, and 6 says nothing of its leaving`);
    show('OWED', h.owed, (o) => `${o.slot}  over ${o.over}`);
    show('ODD', h.odd, (o) => `${o.address ? `${o.address}  ${o.line} — ` : `${o.line} `}${o.why}`);
    if (h.latched_elsewhere) show('LATCHED ELSEWHERE', h.latched_elsewhere, (x) => `${x} — latched under this key, named for ${holderOf(x) ?? 'nobody'}; ${h.listed.includes(x) ? 'listed' : 'list it with --take'}`);
  }
  if (rep.handles.length > 1) L.push(`in all: UNLISTED ${sum.unlisted} · GONE ${sum.gone} · OWED ${sum.owed} · ODD ${sum.odd}`);
  return L;
}

async function main() {
  const beach = arg('beach', process.env.BEACH_URL);
  const as = arg('as'), handle = arg('handle', as), all = has('all');
  if (!beach || (!handle && !all)) {
    console.error('usage: --beach <url> (--handle <h> | --all) [--as <member>] [--json] [--latches [--dir <folder>]] [--confirm [--take a,b]]   (BEACH_KEY in the env, never on the line)');
    process.exit(2);
  }
  const key = process.env.BEACH_KEY;
  if ((has('latches') || has('confirm')) && !handle) { console.error('refused: --latches and --confirm are one holder\'s act, under their own key — name the holder with --handle'); process.exit(2); }
  if ((has('latches') || has('confirm') || as) && !key) { console.error('refused: BEACH_KEY is not set'); process.exit(2); }
  const pass = as ? await prove(beach, as, key) : null;
  let surface = await readSurface(beach, pass);
  let rep = await check({ beach, surface, handles: [handle], all, pass });
  let redis = null;
  if (has('latches')) { redis = await store(arg('dir')); rep.handles[0].latched_elsewhere = await latches({ redis, origin: rep.origin, handle, key }); }
  let acted = null;
  if (has('confirm')) {
    const take = list(arg('take'));
    const elsewhere = rep.handles[0].latched_elsewhere;
    acted = await act({ beach, surface, handle, key, pass, report: rep.handles[0], take: elsewhere ? take.filter((t) => elsewhere.includes(t)) : take });
    if (elsewhere) for (const t of take) if (!elsewhere.includes(t)) acted.skipped.push([t, 'not under --latches as LATCHED ELSEWHERE — listed only what the key proves']);
    surface = await readSurface(beach, pass);
    rep = await check({ beach, surface, handles: [handle], pass });
    if (redis) rep.handles[0].latched_elsewhere = await latches({ redis, origin: rep.origin, handle, key });
    rep.acted = acted;
  }
  console.log(has('json') ? JSON.stringify(rep, null, 2) : render(rep, acted).join('\n'));
  if (acted?.refused) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(`refused: ${e.message}`); process.exit(1); });
}
