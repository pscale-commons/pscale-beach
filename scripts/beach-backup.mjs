#!/usr/bin/env node
// beach-backup.mjs — DR-grade snapshot of a beach's Upstash KV: EVERY key
// (blocks AND locks, all origins) — the complete restorable image. Read-only.
//
//   set -a; . <clone>/.env.local; set +a
//   node scripts/beach-backup.mjs [--out <dir>] [--match <pat>] [--split <dir>]
//
//   --out    complete image (blocks + locks, gzipped, timestamped) + beach-latest.json.
//            Default /Volumes/CORSAIR/pscale/beach-backups — the DR copy: a PRIVATE volume,
//            because it includes lock hashes. Restore it with beach-restore.mjs.
//   --split  ALSO write per-block CONTENT files (NO locks) under <dir>/<origin>/<block>.json —
//            git-friendly for a public off-site mirror: git stores only the blocks that changed,
//            so a daily commit grows with real change, not with time (the whole beach is a few MB).
//
// Reads only (SCAN + GET); never writes to the beach.

import { Redis } from '@upstash/redis';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg('out', '/Volumes/CORSAIR/pscale/beach-backups');
const MATCH = arg('match', 'pscale-beach-v2:*');
const SPLIT = arg('split', null);

const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
if (!url || !token) { console.error('missing KV_REST_API_URL / KV_REST_API_TOKEN — source your beach clone .env.local first'); process.exit(1); }
const redis = new Redis({ url, token });

// ── SCAN every key ──
let cursor = '0', keys = [];
do {
  const res = await redis.scan(cursor, { match: MATCH, count: 1000 });
  const [next, batch] = Array.isArray(res) ? res : [res.cursor ?? res[0], res.keys ?? res[1]];
  cursor = String(next); keys.push(...(batch || []));
} while (cursor !== '0');
keys = [...new Set(keys)].sort();

// ── GET every value (batched, read-only) ──
const data = {};
for (let i = 0; i < keys.length; i += 25) {
  const chunk = keys.slice(i, i + 25);
  const vals = await Promise.all(chunk.map((k) => redis.get(k)));
  chunk.forEach((k, j) => { data[k] = vals[j]; });
}

// ── breakdown ──
const origins = {};
let blocks = 0, locks = 0;
for (const k of keys) {
  const m = k.match(/^pscale-beach-v2:(.*?):(block|locks):(.*)$/s);
  if (!m) continue;
  origins[m[1]] = (origins[m[1]] || 0) + 1;
  if (m[2] === 'block') blocks++; else locks++;
}

const created_at = new Date().toISOString();
const snap = { meta: { created_at, match: MATCH, key_count: keys.length, blocks, locks, origins }, data };
const body = JSON.stringify(snap, null, 2);
const ts = created_at.replace(/[:.]/g, '-');

await fs.mkdir(OUT, { recursive: true });
const gz = gzipSync(Buffer.from(body));
await fs.writeFile(join(OUT, `beach-${ts}.json.gz`), gz);
await fs.writeFile(join(OUT, 'beach-latest.json'), body);

console.error(`✓ complete image: ${keys.length} keys (${blocks} blocks + ${locks} locks), ${(body.length / 1048576).toFixed(2)} MB → ${(gz.length / 1048576).toFixed(2)} MB gz`);
console.error(`  origins: ${Object.entries(origins).map(([o, n]) => `${o.replace('https://', '')}=${n}`).join(', ')}`);
console.error(`  → ${join(OUT, `beach-${ts}.json.gz`)}`);

// ── optional git-friendly per-block content mirror (blocks only, no lock hashes) ──
if (SPLIT) {
  let n = 0;
  for (const k of keys) {
    const m = k.match(/^pscale-beach-v2:(.*?):block:(.*)$/s);
    if (!m) continue;
    const origin = m[1].replace(/^https?:\/\//, '');
    const file = join(SPLIT, origin, encodeURIComponent(m[2]) + '.json');
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data[k], null, 2) + '\n');
    n++;
  }
  console.error(`  split: ${n} per-block content files → ${SPLIT} (locks excluded — safe for a public mirror)`);
}
