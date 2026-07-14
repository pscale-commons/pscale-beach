#!/usr/bin/env node
// beach-restore.mjs — restore keys from a complete-image snapshot into Upstash.
// DRY-RUN by default; --confirm actually writes (overwriting current values).
//
//   set -a; . <clone>/.env.local; set +a
//   node scripts/beach-restore.mjs --in <beach-*.json[.gz]> [--only <substr>] [--confirm]
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
if (!IN) { console.error('usage: --in <beach-*.json|.gz> [--only <substr>] [--confirm]'); process.exit(1); }

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
