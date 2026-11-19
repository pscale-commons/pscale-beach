#!/usr/bin/env node
// tombstone.mjs — the keeper's logged redaction: a block or a node inside it leaves the beach and
// every copy the operator keeps, a visible tombstone stands where words were, and one private line
// says what went, whom it concerned, who acted and why. DRY-RUN by default; --confirm acts.
//
// What set-aside.mjs is to a stray, this is to words that must stand nowhere the operator holds
// them (who-answers 1.1113; bsp-mcp proposals/2026-11-02-leros-on-the-commons-the-build-to-
// completion.md §4.5 item 2), on the shape of Wikimedia's oversight: a few named people, a reason
// code, a private log. One act reaches the LIVE STORE (the block, the day-copies the door kept
// before an unlatched wipe, the archive copies set-aside made), the NIGHTLY IMAGES on the
// operator's drives, and the GIT MIRROR — the file as it stands and every version of it in the
// repository's history.
//
//   set -a; . <clone>/.env.local; set +a
//   node scripts/tombstone.mjs --block pool:somewhere --at 7 --why named --for <handle> [--confirm]
//   node scripts/tombstone.mjs --block passport:somename --why asked --for somename [--confirm]
//
//   --block <name>     the block.
//   --at <path>        a node inside it, named as it stands in the stored JSON — digits and
//                      underscores joined by dots (7 · 1.2 · _.11.3), the shape a raw read shows
//                      (?block=<name> with no pscale). Without --at the whole block goes.
//   --why <code>       asked · named · health · contact · unlawful · safeguarding (REASONS below).
//   --for <handle>     whom it concerns, if anyone: the private line only, never the public one.
//   --by <handle>      the keeper acting (default: BEACH_HANDLE).
//   --images <dirs>    comma-separated folders of nightly images (default: $OUT and $CORSAIR_DIR,
//                      the folders beach-backup.sh writes); sealed images open under BEACH_IMAGE_KEY.
//   --mirror <dir>     the git mirror's folder (default: $SPLIT); its history is rewritten.
//   --origin, --apex, --dir   as set-aside.mjs: the surface, the deploy's host, a local folder.
//   --confirm          act. Without it: what would go, where each copy stands, and what the
//                      mirror's history holds.
//
// A NODE is replaced, in the block and in every copy, by one visible line — REMOVED, the day, the
// code — and the block stays under the latches it had: its name was already public and stays, so
// the tombstone can stand in place. A WHOLE BLOCK goes, its name with it, since a name alone can
// be the detail that had to go (a passport in a recovery place); the public record is a line at
// beach-log that gives the day, the code and the keeper, and no name. The private record — the
// name, whom it concerned, the keeper, the code, and which copies were reached — is a storage
// hash the keeper reads with the store's token (<ns>:<origin>:tombstones), never a block. Nothing
// is kept: no archive copy, no day-copy; a redaction that kept a copy would not be one.
//
// THE MIRROR's history is rewritten with git's own filter-branch (no extra tool): the file's every
// version is dropped from every ref, the old refs and reflog expired, the repository pruned, and
// the result force-pushed where a remote stands. A hosted remote keeps unreachable objects for a
// while after a force-push — which is why a notice says "within a month", and why the keeper may
// ask the host to purge them. Uncommitted files in the mirror (a split the watchdog cut short) are
// committed first, so nothing of the mirror is lost but what was meant to go.
//
// REFUSED: sed: and grain: (their lifecycle is their own); a code not on the list; a block or a
// node that does not stand (nothing to redact is nothing to log).

import { pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { readImage, writeImage, isImageFile } from './image-seal.mjs';
import { makeDoor, surface, logLine } from './set-aside.mjs';

const NS = 'pscale-beach-v2';
const blockKey = (o, n) => `${NS}:${o}:block:${n}`;
const locksKey = (o, n) => `${NS}:${o}:locks:${n}`;
const asideKey = (o, n) => `${NS}:${o}:aside:${n}`;
const touchedKey = (o) => `${NS}:${o}:touched`;
const bornKey = (o) => `${NS}:${o}:born`;
const sizesKey = (o) => `${NS}:${o}:sizes`;
const tombstonesKey = (o) => `${NS}:${o}:tombstones`;

export const REASONS = {
  asked: 'the person it concerned asked',
  named: 'it named or described someone who had not agreed to it',
  health: 'it carried health or recovery detail in the open',
  contact: 'it carried contact details or an ID number',
  unlawful: 'it was reported as unlawful',
  safeguarding: 'a safeguarding concern',
};

/** The visible line that stands where a node was. */
export function tombstoneLine(day, why) {
  return `REMOVED ${day} — what stood here was redacted by the beach's keeper (${why}: ${REASONS[why]}). Every copy the keeper holds was redacted the same day, and nothing of it is kept. Ask the keepers about it, not here.`;
}

function nodeAt(block, path) {
  let n = block;
  for (const seg of path.split('.')) {
    if (!n || typeof n !== 'object' || !Object.prototype.hasOwnProperty.call(n, seg)) return undefined;
    n = n[seg];
  }
  return n;
}
function withNode(block, path, value) {
  const copy = JSON.parse(JSON.stringify(block));
  const segs = path.split('.');
  let n = copy;
  for (const seg of segs.slice(0, -1)) n = n[seg];
  n[segs[segs.length - 1]] = value;
  return copy;
}
const encName = (name) => encodeURIComponent(name);

/** Every place in a store a block's words can stand under one origin: its own key, the door's
 *  day-copies, set-aside's archive copies (block names). */
export async function copiesOf(redis, origin, name) {
  const prefix = blockKey(origin, `archive:${name}:`);
  const archives = (await redis.keys(`${prefix}*`)).map((k) => k.slice(blockKey(origin, '').length));
  const lasts = await redis.keys(`${NS}:${origin}:last:${name}:*`);
  return { archives: archives.sort(), lasts: lasts.sort() };
}

/** Patch one image in memory: returns what it touched, or null when the image holds nothing of it. */
function patchImage(snap, origin, name, at, line, archives) {
  const data = snap.data || {}, hashes = snap.hashes || {};
  const touched = [];
  const names = [name, ...archives];
  for (const n of names) {
    const k = blockKey(origin, n);
    if (!(k in data)) continue;
    if (at) {
      if (nodeAt(data[k], at) === undefined) continue;
      data[k] = withNode(data[k], at, line);
    } else {
      delete data[k];
      delete data[locksKey(origin, n)];
      delete data[asideKey(origin, n)];
      for (const h of [touchedKey(origin), bornKey(origin), sizesKey(origin)]) if (hashes[h] && typeof hashes[h] === 'object') delete hashes[h][n];
    }
    touched.push(n);
  }
  for (const k of Object.keys(data)) {
    if (!k.startsWith(`${NS}:${origin}:last:${name}:`)) continue;
    if (at) {
      const kept = data[k];
      if (!kept || typeof kept !== 'object' || nodeAt(kept.block, at) === undefined) continue;
      data[k] = { ...kept, block: withNode(kept.block, at, line) };
    } else {
      delete data[k];
    }
    touched.push(k.slice(`${NS}:${origin}:`.length));
  }
  return touched.length ? touched : null;
}

function git(dir, args, input) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], input, env: { ...process.env, FILTER_BRANCH_SQUELCH_WARNING: '1' } });
}

/** The mirror's files for a block and its archives: those on disk, and those only history still holds. */
function mirrorPaths(mirror, origin, name) {
  const dir = origin.replace(/^https?:\/\//, '');
  const want = (n) => n === name || n.startsWith(`archive:${name}:`);
  const paths = new Set();
  let listed = '';
  try { listed = git(mirror, ['log', '--all', '--name-only', '--pretty=format:', '--', dir]); } catch { listed = ''; }
  for (const p of listed.split('\n')) {
    const m = p.trim().match(/^(.+)\/([^/]+)\.json$/);
    if (m && m[1] === dir && want(decodeURIComponent(m[2]))) paths.add(p.trim());
  }
  paths.add(`${dir}/${encName(name)}.json`);
  return [...paths].sort();
}

/** Redact. Returns the plan (dry) or what was done. */
export async function tombstone({ redis, door, origin, name, at, why, who, by, passphrase, images = [], imageKey, mirror, confirm, now = new Date() }) {
  if (/^(sed|grain):/.test(name)) throw new Error(`"${name}" is a sed:/grain: block — its lifecycle is its own, here as at the door`);
  if (!REASONS[why]) throw new Error(`--why must be one of ${Object.keys(REASONS).join(' · ')}`);
  if (at && !/^[_1-9](\.[_0-9]+)*$/.test(at)) throw new Error(`--at "${at}" is not a node path: digits and underscores joined by dots, as the stored JSON shows them`);
  const block = await redis.get(blockKey(origin, name));
  if (block == null) throw new Error(`no block "${name}" at ${origin}`);
  if (at && nodeAt(block, at) === undefined) throw new Error(`"${name}" has no node at ${at} — read it raw (?block=${name}) and name the node as it stands`);

  const iso = now.toISOString(), day = iso.slice(0, 10);
  const line = tombstoneLine(day, why);
  const { archives, lasts } = await copiesOf(redis, origin, name);

  // Where it stands on disk, read before anything moves.
  const imageFiles = [];
  for (const d of images) {
    let entries = [];
    try { entries = await fs.readdir(d); } catch { continue; }
    for (const f of entries.filter(isImageFile).sort()) {
      const path = join(d, f);
      try {
        const snap = await readImage(path, imageKey);
        const hit = patchImage(snap, origin, name, at, line, archives);
        if (hit) imageFiles.push({ path, holds: hit });
      } catch (e) { imageFiles.push({ path, error: e.message }); }
    }
  }
  let mirrorPlan = null;
  if (mirror) {
    const paths = mirrorPaths(mirror, origin, name);
    const versions = {};
    for (const p of paths) {
      let n = 0;
      try { n = git(mirror, ['log', '--all', '--oneline', '--', p]).split('\n').filter(Boolean).length; } catch { n = 0; }
      versions[p] = n;
    }
    let dirty = false;
    try { dirty = git(mirror, ['status', '--porcelain']).trim() !== ''; } catch { dirty = false; }
    let remote = null;
    try { remote = git(mirror, ['remote', 'get-url', 'origin']).trim(); } catch { remote = null; }
    mirrorPlan = { dir: mirror, paths, versions, dirty, remote };
  }

  const publicLine = at
    ? `${day} — REDACTED: ${name} at ${at} is now a tombstone, by ${by} with the keeper's hand (scripts/tombstone.mjs), reason ${why}: ${REASONS[why]}. The day-copies, the archive copies, the nightly images and the mirror were redacted the same way, and nothing of it is kept.`
    : `${day} — REMOVED: a block was removed whole, by ${by} with the keeper's hand (scripts/tombstone.mjs), reason ${why}: ${REASONS[why]}. Its name is in the keepers' private log and not here; its day-copies, archive copies, nightly images and mirror versions went with it, and nothing of it is kept.`;
  const plan = { name, at: at || null, why, who: who || null, by, origin, day, line, archives, lasts: lasts.map((k) => k.slice(`${NS}:${origin}:`.length)), images: imageFiles, mirror: mirrorPlan, publicLine };
  if (!confirm) return { dry: true, ...plan };

  const reached = { store: [], images: [], mirror: [], failed: [] };
  // 1. The live store — the block, then every copy.
  if (at) {
    await redis.set(blockKey(origin, name), withNode(block, at, line));
    try { await redis.hset(touchedKey(origin), { [name]: iso }); } catch { /* the stamp is refinement */ }
    reached.store.push(name);
    for (const a of archives) {
      const copy = await redis.get(blockKey(origin, a));
      if (copy && nodeAt(copy, at) !== undefined) { await redis.set(blockKey(origin, a), withNode(copy, at, line)); reached.store.push(a); }
    }
    for (const k of lasts) {
      const kept = await redis.get(k);
      if (!kept || typeof kept !== 'object' || nodeAt(kept.block, at) === undefined) continue;
      let ttl = 0;
      try { ttl = typeof redis.ttl === 'function' ? Number(await redis.ttl(k)) : 0; } catch { ttl = 0; }
      await redis.set(k, { ...kept, block: withNode(kept.block, at, line) }, ttl > 0 ? { ex: ttl } : undefined);
      reached.store.push(k.slice(`${NS}:${origin}:`.length));
    }
  } else {
    for (const n of [name, ...archives]) {
      await redis.del(blockKey(origin, n));
      await redis.del(locksKey(origin, n));
      await redis.del(asideKey(origin, n));
      for (const h of [touchedKey(origin), bornKey(origin), sizesKey(origin)]) { try { await redis.hdel(h, n); } catch { /* refinement */ } }
      reached.store.push(n);
    }
    for (const k of lasts) { await redis.del(k); reached.store.push(k.slice(`${NS}:${origin}:`.length)); }
  }
  // 2. The private line — a storage hash, never a block.
  await redis.hset(tombstonesKey(origin), { [`${iso}|${name}|${at || '*'}`]: { for: who || null, by, why, store: reached.store } });
  // 3. The nightly images, one at a time, written back as they were kept.
  for (const f of imageFiles) {
    if (f.error) { reached.failed.push(`${f.path}: ${f.error}`); continue; }
    try {
      const snap = await readImage(f.path, imageKey);
      patchImage(snap, origin, name, at, line, archives);
      await writeImage(f.path, snap, imageKey);
      reached.images.push(f.path);
    } catch (e) { reached.failed.push(`${f.path}: ${e.message}`); }
  }
  // 4. The mirror — the file now, and its every version.
  if (mirrorPlan) {
    try {
      if (mirrorPlan.dirty) { git(mirror, ['add', '-A']); git(mirror, ['commit', '-q', '-m', `snapshot committed before a tombstone ${day}`]); }
      const rm = `git rm -q --cached --ignore-unmatch -- ${mirrorPlan.paths.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(' ')}`;
      git(mirror, ['filter-branch', '-f', '--index-filter', rm, '--', '--all']);
      for (const ref of git(mirror, ['for-each-ref', '--format=%(refname)', 'refs/original/']).split('\n').filter(Boolean)) git(mirror, ['update-ref', '-d', ref]);
      git(mirror, ['reflog', 'expire', '--expire=now', '--all']);
      git(mirror, ['gc', '--prune=now', '--quiet']);
      for (const p of mirrorPlan.paths) { try { await fs.rm(join(mirror, p), { force: true }); } catch { /* already gone */ } }
      if (at) {
        const p = `${origin.replace(/^https?:\/\//, '')}/${encName(name)}.json`;
        await fs.mkdir(join(mirror, p, '..'), { recursive: true });
        await fs.writeFile(join(mirror, p), JSON.stringify(withNode(block, at, line)) + '\n');
        git(mirror, ['add', '--', p]);
        git(mirror, ['commit', '-q', '-m', `tombstone ${day}: ${name} at ${at}`]);
      }
      reached.mirror = mirrorPlan.paths;
      if (mirrorPlan.remote) git(mirror, ['push', '--force', '--all', '-q']);
      else reached.failed.push(`${mirror}: no remote named origin — push it yourself with: git push --force --all`);
    } catch (e) { reached.failed.push(`${mirror}: ${String(e.stderr || e.message).trim().split('\n').pop()}`); }
  }
  // 5. The public line.
  const logged = await logLine(door, publicLine, by, passphrase);
  return { dry: false, ...plan, reached, logged };
}

// ── CLI ──

async function main() {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const has = (n) => process.argv.includes(`--${n}`);
  const BLOCK = arg('block'), AT = arg('at'), WHY = arg('why'), DIR = arg('dir');
  if (!BLOCK || !WHY) {
    console.error('usage: --block <name> [--at <node path>] --why <asked|named|health|contact|unlawful|safeguarding> [--for <handle>] [--images <dir,dir>] [--mirror <dir>] [--confirm]');
    process.exit(2);
  }
  let apex = arg('apex', process.env.BEACH_ORIGIN);
  if (!apex && process.env.BEACH_URL) { try { apex = new URL(process.env.BEACH_URL).host; } catch { /* below */ } }
  if (!apex) { console.error('which beach? pass --apex <host>, or set BEACH_ORIGIN or BEACH_URL'); process.exit(2); }
  apex = apex.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
  const surf = surface(arg('origin'), apex);
  const by = arg('by', process.env.BEACH_HANDLE || 'the keeper');
  const images = (arg('images', [process.env.OUT, process.env.CORSAIR_DIR].filter(Boolean).join(',')) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const mirror = arg('mirror', process.env.SPLIT || '') || null;

  process.env.BEACH_ORIGIN = apex;
  // The keeper's hand, in-process: the gate is the network door's (set-aside.mjs says the same).
  delete process.env.BEACH_GATE;
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
  __setRedis(redis);
  const door = makeDoor(handler, surf);

  const r = await tombstone({ redis, door, origin: surf.origin, name: BLOCK, at: AT, why: WHY, who: arg('for'), by,
    passphrase: process.env.BEACH_PASSPHRASE, images, imageKey: process.env.BEACH_IMAGE_KEY, mirror, confirm: has('confirm') });

  const where = r.at ? `${r.name} at ${r.at} → a tombstone` : `${r.name} → removed whole, its name with it`;
  console.error(`${r.dry ? 'DRY RUN — would redact' : '✓ redacted'}  ${where}  @ ${r.origin}  (${r.why}: ${REASONS[r.why]})`);
  console.error(`  store: the block${r.archives.length ? `, ${r.archives.length} archive cop${r.archives.length === 1 ? 'y' : 'ies'} (${r.archives.join(', ')})` : ''}${r.lasts.length ? `, ${r.lasts.length} day-cop${r.lasts.length === 1 ? 'y' : 'ies'}` : ''}`);
  console.error(`  images: ${r.images.length} hold it${r.images.length ? ' — ' + r.images.map((f) => f.error ? `${f.path} (${f.error})` : f.path).join(', ') : ''}`);
  if (r.mirror) console.error(`  mirror: ${r.mirror.paths.length} path${r.mirror.paths.length === 1 ? '' : 's'} at ${r.mirror.dir}${r.mirror.paths.map((p) => ` — ${p} (${r.mirror.versions[p]} version${r.mirror.versions[p] === 1 ? '' : 's'} in history)`).join('')}${r.mirror.dirty ? ' — uncommitted files there are committed first' : ''}${r.mirror.remote ? ` — force-pushed to ${r.mirror.remote}` : ' — no remote: push it yourself'}`);
  else console.error('  mirror: none named (--mirror <dir> or SPLIT) — its history is NOT rewritten');
  console.error(`  beach-log: ${r.publicLine}`);
  if (r.dry) { console.error('Re-run with --confirm to act.'); return; }
  console.error(`  private line kept at ${tombstonesKey(r.origin)}${r.who ? ` (for ${r.who})` : ''}`);
  for (const f of r.reached.failed) console.error(`  ! ${f}`);
  if (!r.logged) console.error('  ! the beach-log line did NOT land — append it by hand; the redaction itself is done.');
  else console.error(`  logged at beach-log slot ${r.logged.slot}`);
  if (r.reached.failed.length) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(`refused: ${e.message}`); process.exit(1); });
}
