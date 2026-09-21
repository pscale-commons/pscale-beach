#!/usr/bin/env node
// set-aside.mjs — the beach owner's tidy: a block leaves its family, nothing is lost, the
// act is on the public record. DRY-RUN by default; --confirm acts.
//
// A stray (a mistyped handle's mirror, a probe nobody cleaned up) is SET ASIDE, never wiped:
// the block is written whole to archive:<name>:<date>, the original is removed, and one line
// lands at beach-log saying what moved, why, and where it is now. Every family sweep is a
// name-prefix filter over the index, so the block leaves all of them at once. --put-back is
// the same move in reverse.
//
//   set -a; . <clone>/.env.local; set +a
//   node scripts/set-aside.mjs --block now:somename --why "a mistyped handle's mirror" [--confirm]
//   node scripts/set-aside.mjs --put-back archive:now:somename:2026-09-21 [--confirm]
//
//   --origin <surface>  which surface (default: the apex). A sub-beach host, or <apex>/w/<world>.
//   --apex <host>       the deploy's bare domain (default: BEACH_ORIGIN, else BEACH_URL's host).
//   --by <handle>       who the beach-log line names (default: BEACH_HANDLE).
//   --to <name>         put-back only: the name to restore under, when no record stands beside the copy.
//   --dir <folder>      run against a local-beach folder instead of Upstash (scripts/local-beach.mjs).
//   --confirm           act. WITHOUT it, dry-run: says exactly what would move.
//
// WHOSE HAND THIS IS. The owner's, through the storage the owner owns — the power a beach's
// host has always had (protocol v2: "the owner can wipe it whenever the design demands"), made
// lossless and publicly recorded. An edit-latch promises that nobody else writes as you; it
// never promised that a host keeps a page forever. What keeps this hand honest is the archive
// copy and the beach-log line, not a wall. The holder of a stray's own passphrase needs none of
// this: read the block, write the archive copy, DELETE the original — three ordinary calls at
// the door.
//
// WHAT GOES THROUGH THE DOOR AND WHAT DOES NOT. The archive copy, its read-back and the
// beach-log line all go through the REAL handler, in-process — so the floor check, the shape
// gate, the latch hash, the touched stamp and the append's slot allocation are the handler's
// own and no law is copied here. Storage is touched directly for exactly two things the door
// cannot do: removing a block whose latch the owner does not hold, and keeping that block's old
// latch beside the archived copy so a put-back returns it to its holder. That record is a
// storage key, never a block: lock hashes are never public.
//
// NEEDS BEACH_PASSPHRASE: the archived copy is sealed under the owner's latch so nobody edits
// what was set aside. sed: and grain: are refused — their lifecycle is their own, as at the door.

import { pathToFileURL } from 'node:url';

const NS = 'pscale-beach-v2';
const blockKey = (o, n) => `${NS}:${o}:block:${n}`;
const locksKey = (o, n) => `${NS}:${o}:locks:${n}`;
const touchedKey = (o) => `${NS}:${o}:touched`;
const asideKey = (o, n) => `${NS}:${o}:aside:${n}`;

// The voice a beach-log is born with when a beach has none — the apex's own, which says what an
// entry is: one per change, dated, naming what moved.
const LOG_UNDERSCORE =
  'The record of what has been DONE to this beach and when — the one thing the blocks themselves ' +
  'can never tell you, because a block shows its present state and never says what it replaced or ' +
  'why. Append here, never at a slot you chose. One entry per change, dated, naming what moved and ' +
  'what was left undone. Left open on purpose: anyone who changes this beach should be able to say ' +
  'so without holding a key, and a log only the owner can write is a log nobody else can trust.';

/** Resolve a --origin argument to the storage namespace and the request shape that reaches it. */
export function surface(originArg, apex) {
  const bare = String(originArg || apex).replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  const m = bare.match(/^([^/]+)\/w\/([a-z0-9-]+)$/);
  if (m) return { origin: `${apex}/w/${m[2]}`, host: apex, world: m[2] };
  return { origin: bare, host: bare, world: null };
}

/** The real handler, called in-process: (method, block, body) → {status, body}. */
export function makeDoor(handler, surf) {
  return async (method, block, body = {}) => {
    let status = 200, payload = null;
    const req = {
      method,
      query: { block, ...(surf.world ? { world: surf.world } : {}) },
      body: { ...body, block },
      headers: { host: surf.host },
      url: '/.well-known/pscale-beach',
    };
    const res = {
      headersSent: false,
      setHeader() {},
      status(c) { status = c; return this; },
      json(o) { payload = o; this.headersSent = true; },
      end() { this.headersSent = true; },
    };
    await handler(req, res);
    return { status, body: payload };
  };
}

// Key order is not meaning: compare by a stable serialisation.
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
}

async function logLine(door, line, by, passphrase) {
  if ((await door('GET', 'beach-log')).status === 404) {
    await door('POST', 'beach-log', { content: { _: LOG_UNDERSCORE } });
  }
  const entry = { _: line, 1: by };   // the door stamps position 3 from its own clock
  let r = await door('POST', 'beach-log', { append: true, content: entry });
  if (r.status === 403 && passphrase) r = await door('POST', 'beach-log', { append: true, content: entry, secret: passphrase });
  return r.status === 200 ? r.body : null;
}

/** Set a block aside. Returns what it did (or, without confirm, what it would do). */
export async function setAside({ redis, door, origin, name, why, by, passphrase, confirm, now = new Date() }) {
  if (/^(sed|grain):/.test(name)) throw new Error(`"${name}" is a sed:/grain: block — its lifecycle is its own, here as at the door`);
  if (name.startsWith('archive:')) throw new Error(`"${name}" is already an archive`);
  if (!why) throw new Error('say why (--why "…") — the beach-log line is the point of the act');

  const block = await redis.get(blockKey(origin, name));
  if (block == null) throw new Error(`no block "${name}" at ${origin}`);
  const locks = await redis.get(locksKey(origin, name));
  const latched = !!(locks && typeof locks === 'object' && Object.keys(locks).length);

  const iso = now.toISOString();
  const day = iso.slice(0, 10);
  let archive = `archive:${name}:${day}`;
  if ((await redis.get(blockKey(origin, archive))) != null) {
    archive = `archive:${name}:${day}T${iso.slice(11, 19).replace(/:/g, '')}Z`;
  }
  const bytes = Buffer.byteLength(JSON.stringify(block));
  const line =
    `${day} — SET ASIDE: ${name} moved whole to ${archive}, by ${by} with the owner's hand ` +
    `(scripts/set-aside.mjs). Why: ${why}. It was ${latched ? 'latched' : 'open'} and held ${bytes} bytes. ` +
    `Nothing is lost: it reads at ?block=${archive}, sealed under the owner's latch, and the same script puts it back` +
    `${latched ? ' under the latch it had' : ''}.`;
  const plan = { name, archive, origin, latched, bytes, line };
  if (!confirm) return { dry: true, ...plan };

  if (!passphrase) throw new Error('BEACH_PASSPHRASE is not set — the archived copy must be sealed under the owner\'s latch');

  // 1. The copy, through the door (R1: absent + new_lock → created latched).
  const made = await door('POST', archive, { content: block, new_lock: passphrase });
  if (made.status !== 200) {
    throw new Error(`the door refused the archive copy (${made.status}: ${made.body?.error ?? 'no reason given'}) — nothing was removed`);
  }
  // 2. Read it back as any reader would, and compare. The original is not touched until this passes.
  const back = await door('GET', archive);
  if (back.status !== 200 || stable(back.body) !== stable(block)) {
    throw new Error(`the archive copy at "${archive}" does not read back identical — nothing was removed; the copy stands for inspection`);
  }
  // 3. The record beside the copy: where it came from, and the latch it had.
  await redis.set(asideKey(origin, archive), { from: name, at: iso, by, locks: latched ? locks : null });
  // 4. The original leaves — the one act the door refuses a hand that does not hold the latch.
  await redis.del(blockKey(origin, name));
  await redis.del(locksKey(origin, name));
  try { await redis.hdel(touchedKey(origin), name); } catch { /* the stamp is refinement */ }
  // 5. The public record.
  const logged = await logLine(door, line, by, passphrase);
  return { dry: false, ...plan, logged };
}

/** Put a set-aside block back under its name, and under the latch it had. */
export async function putBack({ redis, door, origin, archive, to, by, passphrase, confirm, now = new Date() }) {
  if (!archive.startsWith('archive:')) throw new Error(`"${archive}" is not an archive name`);
  const block = await redis.get(blockKey(origin, archive));
  if (block == null) throw new Error(`no block "${archive}" at ${origin}`);
  const rec = await redis.get(asideKey(origin, archive));
  const name = to || rec?.from;
  if (!name) throw new Error('no record stands beside this copy — say where it goes with --to <name>');
  if ((await redis.get(blockKey(origin, name))) != null) throw new Error(`"${name}" stands again at ${origin} — not overwriting it`);

  const day = now.toISOString().slice(0, 10);
  const relatch = !!(rec?.locks);
  const line =
    `${day} — PUT BACK: ${archive} returned to ${name}, by ${by} with the owner's hand (scripts/set-aside.mjs)` +
    `${relatch ? ', under the latch it had — its holder\'s passphrase opens it as before' : ', open as it was'}.`;
  const plan = { name, archive, origin, relatch, line };
  if (!confirm) return { dry: true, ...plan };

  const made = await door('POST', name, { content: block });
  if (made.status !== 200) throw new Error(`the door refused "${name}" (${made.status}: ${made.body?.error ?? 'no reason given'}) — the archive copy is untouched`);
  if (relatch) await redis.set(locksKey(origin, name), rec.locks);
  await redis.del(blockKey(origin, archive));
  await redis.del(locksKey(origin, archive));
  await redis.del(asideKey(origin, archive));
  try { await redis.hdel(touchedKey(origin), archive); } catch { /* refinement */ }
  const logged = await logLine(door, line, by, passphrase);
  return { dry: false, ...plan, logged };
}

// ── CLI ──

async function main() {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const has = (n) => process.argv.includes(`--${n}`);
  const BLOCK = arg('block'), PUTBACK = arg('put-back'), DIR = arg('dir');
  if (!BLOCK === !PUTBACK) {
    console.error('usage: --block <name> --why "<reason>" [--confirm]   OR   --put-back <archive:name:date> [--to <name>] [--confirm]');
    process.exit(2);
  }
  let apex = arg('apex', process.env.BEACH_ORIGIN);
  if (!apex && process.env.BEACH_URL) { try { apex = new URL(process.env.BEACH_URL).host; } catch { /* below */ } }
  if (!apex) { console.error('which beach? pass --apex <host>, or set BEACH_ORIGIN or BEACH_URL'); process.exit(2); }
  apex = apex.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  const surf = surface(arg('origin'), apex);
  const by = arg('by', process.env.BEACH_HANDLE || 'the owner');

  // The handler reads its origin and its store at module load — set both BEFORE the import.
  process.env.BEACH_ORIGIN = apex;
  let redis;
  if (DIR) {
    process.env.KV_REST_API_URL ||= 'https://local.invalid';
    process.env.KV_REST_API_TOKEN ||= 'local';
    const { FileRedis } = await import('./file-redis.mjs');
    redis = new FileRedis(DIR);
  } else {
    const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) { console.error('missing KV creds — source your beach clone .env.local first'); process.exit(1); }
    const { Redis } = await import('@upstash/redis');
    redis = new Redis({ url, token });
  }
  const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
  __setRedis(redis);   // the door and the owner's hand work the same store
  const door = makeDoor(handler, surf);

  const common = { redis, door, origin: surf.origin, by, passphrase: process.env.BEACH_PASSPHRASE, confirm: has('confirm') };
  const r = BLOCK
    ? await setAside({ ...common, name: BLOCK, why: arg('why') })
    : await putBack({ ...common, archive: PUTBACK, to: arg('to') });

  console.error(`${r.dry ? 'DRY RUN — would move' : '✓ moved'}  ${BLOCK ? `${r.name} → ${r.archive}` : `${r.archive} → ${r.name}`}  @ ${r.origin}`);
  console.error(`beach-log: ${r.line}`);
  if (r.dry) console.error('Re-run with --confirm to act.');
  else if (!r.logged) console.error('! the beach-log line did NOT land — append it by hand; the move itself is done.');
  else console.error(`logged at beach-log slot ${r.logged.slot}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(`refused: ${e.message}`); process.exit(1); });
}
