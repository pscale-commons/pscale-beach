#!/usr/bin/env node
//
// sweep-empty-locks.js — one-time migration: remove historical empty-secret
// lock entries (the "brick").
//
// Before R5, `new_lock: ''` STORED hash('') — a lock that can never be
// proven, because the handler reads an empty secret as absent. A position
// bricked this way was readable but un-writable and un-deletable via the
// API forever. R5 makes '' (and null) mean RELINQUISH, so no new bricks can
// be minted — but locks already stored as hash('') are data residue that
// only direct KV surgery can clear. This script is that surgery, shipped
// with the package so any operator runs it once.
//
// It scans every locks key (origin-namespaced AND legacy), computes the
// empty-secret hash for each position under the correct salt family
// (ordinary / sed: / grain:), and removes exactly the entries that match.
// Nothing else is touched; block content is never read or written.
//
// Required env: KV_REST_API_URL, KV_REST_API_TOKEN
// Optional env: DRY_RUN=1 (default — lists what would be removed)
//               APPLY=1   (actually rewrite the lock entries)
//
// Run: node --env-file=.env.local scripts/sweep-empty-locks.js
//      APPLY=1 node --env-file=.env.local scripts/sweep-empty-locks.js

import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const APPLY = process.env.APPLY === '1';
const NS = 'pscale-beach-v2';

// Salt families — byte-identical to api/pscale-beach.js.
const sha = (s) => createHash('sha256').update(s).digest('hex');
const hashOrdinary = (origin, secret, blockName, position) =>
  sha(`${secret}block:https://${origin}:${blockName}:${position}`);
const hashSed = (secret, collective, position) => sha(`${secret}${collective}${position}`);
const hashGrain = (secret, pairId, side) => sha(`${secret}grain:${pairId}:${side}`);

function emptyHashFor(origin, blockName, position) {
  if (blockName.startsWith('sed:')) return hashSed('', blockName.slice(4), position);
  if (blockName.startsWith('grain:')) return hashGrain('', blockName.slice(6), position);
  return hashOrdinary(origin, '', blockName, position);
}

// A locks key is either `pscale-beach-v2:<origin>:locks:<name>` (namespaced)
// or `pscale-beach-v2:locks:<name>` (legacy, pre-namespacing — the empty-hash
// salt still used the deploy's origin; pass BEACH_ORIGIN to cover these).
function parseLocksKey(key) {
  const rest = key.slice(NS.length + 1);
  const i = rest.indexOf(':locks:');
  if (i > 0) return { origin: rest.slice(0, i), name: rest.slice(i + ':locks:'.length) };
  if (rest.startsWith('locks:')) {
    const origin = process.env.BEACH_ORIGIN;
    if (!origin) return null; // legacy key but no origin to salt with — skip, report
    return { origin, name: rest.slice('locks:'.length) };
  }
  return null;
}

async function main() {
  const keys = await redis.keys(`${NS}:*locks:*`);
  const locksKeys = keys.filter(k => k.includes(':locks:'));
  console.log(`${locksKeys.length} locks key(s) under ${NS}`);

  let bricked = 0, skipped = 0;
  for (const key of locksKeys) {
    const parsed = parseLocksKey(key);
    if (!parsed) {
      console.log(`  ? ${key} — legacy key and no BEACH_ORIGIN set; skipped`);
      skipped++;
      continue;
    }
    const hashes = await redis.get(key);
    if (!hashes || typeof hashes !== 'object') continue;
    const dead = Object.entries(hashes)
      .filter(([pos, h]) => h === emptyHashFor(parsed.origin, parsed.name, pos))
      .map(([pos]) => pos);
    if (dead.length === 0) continue;

    bricked += dead.length;
    console.log(`  ✂ ${parsed.name} @ ${parsed.origin} — empty-secret lock at position(s): ${dead.join(', ')}`);
    if (APPLY) {
      for (const pos of dead) delete hashes[pos];
      if (Object.keys(hashes).length === 0) {
        await redis.del(key);
        console.log(`    removed (locks entry now empty — key deleted)`);
      } else {
        await redis.set(key, hashes);
        console.log(`    rewritten without the bricked position(s)`);
      }
    }
  }

  console.log(APPLY
    ? `swept: ${bricked} bricked entr${bricked === 1 ? 'y' : 'ies'} removed${skipped ? `, ${skipped} key(s) skipped` : ''}`
    : `dry-run: ${bricked} bricked entr${bricked === 1 ? 'y' : 'ies'} found${skipped ? `, ${skipped} key(s) skipped` : ''} — set APPLY=1 to remove`);
}

main().catch(e => { console.error(e); process.exit(1); });
