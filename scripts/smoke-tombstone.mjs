#!/usr/bin/env node
// smoke-tombstone.mjs — the keeper's logged redaction, end to end against the REAL handler on a temp
// folder, two nightly images (one sealed) and a git mirror with a remote. Self-contained: no
// network, no Upstash.
//
//   node scripts/smoke-tombstone.mjs
//
// Proves: a dry run touches nothing and says where every copy stands; a NODE redaction leaves one
// visible line in the block, its archive copy, its day-copy, both images and the mirror, rewrites
// the mirror's history so no version holds the words, force-pushes, keeps the block's latches,
// logs a named public line and a private one; a WHOLE-BLOCK redaction takes the name out of the
// store, the index, the stamps, the images and the mirror's history, and the public line carries
// no name; a sealed image under another key is reported, not opened, and the rest still lands;
// and every refusal (sed:, an unknown code, a node that does not stand) changes nothing.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const APEX = 'base.test';
process.env.BEACH_ORIGIN = APEX;
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';
delete process.env.BEACH_GATE;

const { FileRedis } = await import('./file-redis.mjs');
const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
const { makeDoor, surface } = await import('./set-aside.mjs');
const { tombstone, REASONS } = await import('./tombstone.mjs');
const { writeImage, readImage } = await import('./image-seal.mjs');

const root = await fs.mkdtemp(join(os.tmpdir(), 'smoke-tombstone-'));
const store = join(root, 'store'), imagesA = join(root, 'images-a'), imagesB = join(root, 'images-b'), mirror = join(root, 'mirror'), remote = join(root, 'remote.git');
await fs.mkdir(imagesA); await fs.mkdir(imagesB);
const redis = new FileRedis(store);
__setRedis(redis);
const NS = 'pscale-beach-v2';
const K = (kind, name) => `${NS}:${APEX}:${kind}${name}`;
const KEY = 'image-passphrase';
const OWNER = 'owner-latch';
const PHONE = '07700 900123';

let failed = 0;
function ok(cond, label, detail) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && detail !== undefined ? '  ← ' + JSON.stringify(detail).slice(0, 240) : ''}`);
  if (!cond) failed++;
}
async function refuses(fn, label) {
  try { await fn(); ok(false, `${label} — was not refused`); } catch { ok(true, label); }
}
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_NAME: 'smoke', GIT_AUTHOR_EMAIL: 'smoke@test', GIT_COMMITTER_NAME: 'smoke', GIT_COMMITTER_EMAIL: 'smoke@test', FILTER_BRANCH_SQUELCH_WARNING: '1' } });

const apex = surface(null, APEX);
const door = makeDoor(handler, apex);
const base = { redis, door, origin: apex.origin, by: 'keeper', passphrase: OWNER, images: [imagesA, imagesB], imageKey: KEY, mirror };

// ── the beach: a room with a phone number in it, a person's passport, and the copies the beach keeps ──
const ROOM = { _: 'THE ROOM — where people talk.', 1: { _: 'a first voice' }, 2: { _: `ring me on ${PHONE} any time`, 1: 'keeper' } };
await door('POST', 'pool:here', { content: ROOM });
await door('POST', 'passport:someone', { content: { _: 'SOMEONE — a person in recovery, here under their own name.' }, new_lock: 'P1' });
await door('POST', 'now:someone', { content: { _: 'MIRROR — someone on the now field.' }, new_lock: 'P1' });
await door('POST', 'archive:pool:here:2026-01-01', { content: ROOM, new_lock: OWNER });
await redis.set(K('last:', 'pool:here:2026-01-02'), { block: ROOM, locks: {} });
await redis.set(K('last:', 'passport:someone:2026-01-02'), { block: { _: 'SOMEONE — earlier' }, locks: { _: 'h' } });
const locksBefore = JSON.stringify(await redis.get(K('locks:', 'pool:here')));

// ── two images of that store, as beach-backup.sh would write them: one plain, one sealed ──
async function snapshot() {
  const data = {}, hashes = {};
  for (const k of await redis.keys(`${NS}:*`)) {
    const v = await redis.get(k);
    if (/:(touched|born|sizes)$/.test(k)) hashes[k] = v; else data[k] = v;
  }
  return { meta: { created_at: new Date().toISOString() }, data, hashes };
}
const snap = await snapshot();
await writeImage(join(imagesA, 'beach-2026-01-01T00-00-00Z.json.gz'), snap, null);
await writeImage(join(imagesA, 'beach-latest.json'), snap, null);
await writeImage(join(imagesB, 'beach-2026-01-02T00-00-00Z.json.gz.enc'), snap, KEY);
await writeImage(join(imagesB, 'beach-2026-01-03T00-00-00Z.json.gz.enc'), snap, 'another-key');

// ── the mirror: two versions of the room, the archive, the passport; a bare remote it pushes to ──
git(root, 'init', '-q', '-b', 'main', mirror);
git(root, 'init', '-q', '--bare', remote);
await fs.mkdir(join(mirror, APEX), { recursive: true });
const mfile = (n) => join(mirror, APEX, `${encodeURIComponent(n)}.json`);
await fs.writeFile(mfile('pool:here'), JSON.stringify({ _: ROOM._, 2: { _: `ring me on ${PHONE}` } }));
git(mirror, 'add', '-A'); git(mirror, 'commit', '-q', '-m', 'v1');
await fs.writeFile(mfile('pool:here'), JSON.stringify(ROOM));
await fs.writeFile(mfile('archive:pool:here:2026-01-01'), JSON.stringify(ROOM));
await fs.writeFile(mfile('passport:someone'), JSON.stringify({ _: 'SOMEONE — a person in recovery' }));
await fs.writeFile(mfile('lighthouse'), JSON.stringify({ _: 'LIGHTHOUSE' }));
git(mirror, 'add', '-A'); git(mirror, 'commit', '-q', '-m', 'v2');
git(mirror, 'remote', 'add', 'origin', remote); git(mirror, 'push', '-q', '-u', 'origin', 'main');
await fs.writeFile(mfile('lighthouse'), JSON.stringify({ _: 'LIGHTHOUSE, split cut short' }));   // an uncommitted split
const holds = (dir, s) => { try { return git(dir, 'log', '--all', '-p').includes(s); } catch { return false; } };
ok(holds(mirror, PHONE) && holds(remote, PHONE), 'the mirror and its remote hold the number in their history');

console.log('dry run');
const dry = await tombstone({ ...base, name: 'pool:here', at: '2', why: 'contact', confirm: false });
ok(dry.dry && dry.archives.length === 1 && dry.lasts.length === 1, 'says which copies the store holds', dry);
ok(dry.images.length === 4 && dry.images.filter((f) => f.error).length === 1, 'finds it in three images and names the one it cannot open', dry.images);
ok(dry.mirror.paths.length === 2 && dry.mirror.versions[`${APEX}/pool%3Ahere.json`] === 2 && dry.mirror.dirty, "counts the mirror's versions and sees the uncommitted split", dry.mirror);
ok(JSON.stringify((await door('GET', 'pool:here')).body) === JSON.stringify(ROOM) && holds(mirror, PHONE), 'touches nothing');

console.log('a node');
const r1 = await tombstone({ ...base, name: 'pool:here', at: '2', why: 'contact', who: 'someone', confirm: true });
const now = (await door('GET', 'pool:here')).body;
ok(typeof now['2'] === 'string' && /^REMOVED \d{4}-\d{2}-\d{2} — .*contact/.test(now['2']) && now['1']._ === 'a first voice', 'the node is one visible line; the rest of the block stands', now);
ok(JSON.stringify(await redis.get(K('locks:', 'pool:here'))) === locksBefore, 'its latches are untouched');
ok(typeof (await redis.get(K('block:', 'archive:pool:here:2026-01-01')))['2'] === 'string', 'the archive copy carries the line');
ok(typeof (await redis.get(K('last:', 'pool:here:2026-01-02'))).block['2'] === 'string', 'the day-copy carries the line');
const noPhone = (o) => !JSON.stringify(o).includes(PHONE);
ok(noPhone(await readImage(join(imagesA, 'beach-2026-01-01T00-00-00Z.json.gz'), null)) && noPhone(await readImage(join(imagesA, 'beach-latest.json'), null)), 'the plain images no longer hold it');
ok(noPhone(await readImage(join(imagesB, 'beach-2026-01-02T00-00-00Z.json.gz.enc'), KEY)), 'the sealed image no longer holds it, and is still sealed');
ok(r1.reached.failed.length === 1 && r1.reached.failed[0].includes('beach-2026-01-03'), 'the image under another key is reported, not opened', r1.reached.failed);
ok(!holds(mirror, PHONE) && !holds(remote, PHONE), "no version in the mirror's history, nor the remote's, holds it");
ok(git(mirror, 'log', '--oneline', '--', `${APEX}/pool%3Ahere.json`).trim().split('\n').length === 1, 'the file has one version: the tombstone');
ok(JSON.parse(await fs.readFile(mfile('pool:here'), 'utf8'))['2'].startsWith('REMOVED'), 'the mirror file is the tombstoned block');
ok(git(mirror, 'log', '--oneline', '--', `${APEX}/lighthouse.json`).includes('before a tombstone'), 'the uncommitted split was committed first');
ok(!(await fs.stat(mfile('archive:pool:here:2026-01-01')).catch(() => null)), 'the archive file left the mirror');
const log1 = (await door('GET', 'beach-log')).body;
ok(log1 && /REDACTED: pool:here at 2/.test(log1['1']._) && log1['1']['1'] === 'keeper', 'the public line names the block and the node');
const priv = await redis.hgetall(K('tombstones', ''));
const pk = Object.keys(priv)[0];
ok(pk && pk.endsWith('|pool:here|2') && priv[pk].for === 'someone' && priv[pk].why === 'contact', 'the private line says whom it concerned', priv);
ok(!(await door('GET', '')).body.blocks.some((n) => n.includes('tombstones')), 'and is never in the index');

console.log('a whole block');
const r2 = await tombstone({ ...base, name: 'passport:someone', why: 'asked', who: 'someone', images: [imagesA, imagesB], confirm: true });
ok((await door('GET', 'passport:someone')).status === 404 && !(await door('GET', '')).body.blocks.includes('passport:someone'), 'the block and its name are gone from the store and the index');
ok((await redis.get(K('locks:', 'passport:someone'))) == null && (await redis.get(K('last:', 'passport:someone:2026-01-02'))) == null, 'its latches and its day-copy went with it');
ok(!('passport:someone' in ((await redis.hgetall(K('touched', ''))) || {})), 'its stamps went with it');
const img = await readImage(join(imagesB, 'beach-2026-01-02T00-00-00Z.json.gz.enc'), KEY);
ok(!(K('block:', 'passport:someone') in img.data) && !(K('last:', 'passport:someone:2026-01-02') in img.data) && !('passport:someone' in (img.hashes[K('touched', '')] || {})), 'the sealed image holds neither the block, its day-copy nor its stamp');
ok(!holds(mirror, 'SOMEONE') && !holds(remote, 'SOMEONE') && !(await fs.stat(mfile('passport:someone')).catch(() => null)), 'no version anywhere in the mirror holds it, and the file is gone');
const log2 = (await door('GET', 'beach-log')).body;
ok(/REMOVED: a block was removed whole/.test(log2['2']._) && !/someone/.test(log2['2']._), 'the public line carries no name');
ok(Object.keys(await redis.hgetall(K('tombstones', ''))).some((k) => k.endsWith('|passport:someone|*')), 'the private line carries it');
ok((await door('GET', 'now:someone')).status === 200 && (await door('GET', 'lighthouse')).status === 404, "a sibling block of the same holder's is untouched");

console.log('refusals');
await refuses(() => tombstone({ ...base, name: 'sed:crowd', why: 'asked', confirm: true }), 'a sed: block');
await refuses(() => tombstone({ ...base, name: 'pool:here', why: 'because', confirm: true }), 'a code not on the list');
await refuses(() => tombstone({ ...base, name: 'pool:here', at: '9', why: 'asked', confirm: true }), 'a node that does not stand');
await refuses(() => tombstone({ ...base, name: 'pool:here', at: '2;rm', why: 'asked', confirm: true }), 'a path that is not digits and underscores');
await refuses(() => tombstone({ ...base, name: 'nothing:here', why: 'asked', confirm: true }), 'a block that does not stand');
ok(Object.keys(REASONS).length === 6, 'six reason codes');

await fs.rm(root, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall green');
process.exit(failed ? 1 : 0);
