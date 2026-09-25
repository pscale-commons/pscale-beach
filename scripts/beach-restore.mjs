#!/usr/bin/env node
// beach-restore.mjs — restore keys from a complete-image snapshot into Upstash.
// DRY-RUN by default; --confirm actually writes (overwriting current values).
//
//   set -a; . <clone>/.env.local; set +a
//   node scripts/beach-restore.mjs --in <beach-*.json[.gz]> [--only <substr>] [--confirm]
//   node scripts/beach-restore.mjs --block-file <f> --origin <domain> --name <block> [--confirm]   (Mode B, below)
//
//   --only <substr>  restore only keys containing <substr> (e.g. an origin, or a block name) —
//                    surgical recovery of one corrupted block without touching the rest.
//   --confirm        actually SET the snapshot values. WITHOUT it, dry-run: lists what would change.
//
// DESTRUCTIVE with --confirm: the current value of each restored key is overwritten by the
// snapshot's. Restores BOTH content and locks (a complete image), so ownership comes back too.

import { Redis } from '@upstash/redis';
import { promises as fs } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const IN = arg('in'), ONLY = arg('only'), CONFIRM = has('confirm');
const BLOCKFILE = arg('block-file'), ORIGIN = arg('origin'), NAME = arg('name');

// Mode B — restore ONE block's content from a per-block file (e.g. a version checked out of the
// git mirror: `git checkout <commit> -- <origin>/<block>.json`). Content only (the mirror carries
// no lock hashes); the block's existing lock is left untouched. The beach keys by the BARE origin —
// BEACH_ORIGIN carries no scheme, a path world is <domain>/w/<world>, and the mirror names its
// directories the same way — so a scheme or trailing slash on --origin is stripped. The dry run GETs
// the key (so it needs the KV creds too) and says whether the beach holds anything there: a wrong
// key shows before --confirm, instead of a write the beach never reads.
if (BLOCKFILE) {
  if (!ORIGIN || !NAME) { console.error('block-file mode needs --origin <domain> and --name <block>'); process.exit(1); }
  const origin = ORIGIN.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '');
  const k = `pscale-beach-v2:${origin}:block:${NAME}`;
  const content = JSON.parse(await fs.readFile(BLOCKFILE, 'utf8'));
  console.error(`block-file → ${k}`);
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) { console.error('missing KV creds — source your beach clone .env.local first'); process.exit(1); }
  const redis = new Redis({ url, token });
  const current = await redis.get(k);
  const bytes = (v) => Buffer.byteLength(JSON.stringify(v));
  console.error(current == null
    ? '  ABSENT — nothing at this key. Unless the block is gone, the key is wrong: --origin is the bare domain (as the mirror names its directory), --name the decoded block name (history:weft, not history%3Aweft).'
    : `  exists — ${bytes(current)} bytes now, ${bytes(content)} from the file; --confirm overwrites.`);
  if (!CONFIRM) { console.error('DRY RUN — re-run with --confirm to set this block content.'); process.exit(0); }
  await redis.set(k, content);
  console.error(`✓ restored block content ${NAME} @ ${origin} (lock untouched)`);
  process.exit(0);
}

if (!IN) { console.error('usage: --in <beach-*.json|.gz> [--only <substr>] [--confirm]  OR  --block-file <f> --origin <domain> --name <block> [--confirm]'); process.exit(1); }

const raw = await fs.readFile(IN);
const text = IN.endsWith('.gz') ? gunzipSync(raw).toString() : raw.toString();
const snap = JSON.parse(text);
let keys = Object.keys(snap.data || {});
if (ONLY) keys = keys.filter((k) => k.includes(ONLY));

console.error(`snapshot ${snap.meta?.created_at} — ${keys.length} key(s)${ONLY ? ` matching "${ONLY}"` : ''}`);
if (!keys.length) { console.error('nothing to restore'); process.exit(0); }

if (!CONFIRM) {
  console.error('DRY RUN (no --confirm) — would overwrite current values of:');
  keys.slice(0, 25).forEach((k) => console.error('  ' + k));
  if (keys.length > 25) console.error(`  … and ${keys.length - 25} more`);
  console.error('Re-run with --confirm to write.');
  process.exit(0);
}

const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
if (!url || !token) { console.error('missing KV creds — source your beach clone .env.local first'); process.exit(1); }
const redis = new Redis({ url, token });

let n = 0;
for (let i = 0; i < keys.length; i += 25) {
  const chunk = keys.slice(i, i + 25);
  await Promise.all(chunk.map((k) => redis.set(k, snap.data[k])));
  n += chunk.length;
}
console.error(`✓ restored ${n} key(s), overwritten from snapshot ${snap.meta?.created_at}`);
