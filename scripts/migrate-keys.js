#!/usr/bin/env node
//
// migrate-keys.js — relocate pre-namespacing legacy keys to the new
// origin-namespaced layout. Run once per Upstash that holds a legacy
// single-beach deploy you now want to share with another beach.
//
// Pre-namespacing layout:   pscale-beach-v2:block:<name>
//                           pscale-beach-v2:locks:<name>
// Origin-namespaced layout: pscale-beach-v2:<origin>:block:<name>
//                           pscale-beach-v2:<origin>:locks:<name>
//
// The handler reads from both locations transparently (legacy as fallback),
// so existing locked blocks keep verifying. This script copies legacy keys
// to the namespaced layout so the surface index and future writes converge
// on one place.
//
// Required env: KV_REST_API_URL, KV_REST_API_TOKEN, BEACH_ORIGIN
// Optional env: DELETE_LEGACY=1 (deletes legacy keys after successful copy)
//               DRY_RUN=1       (lists keys that would migrate without writing)
//
// Run: npm run migrate:keys

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ORIGIN = process.env.BEACH_ORIGIN;
if (!ORIGIN) {
  console.error('BEACH_ORIGIN required — the bare domain (no scheme) of the beach you are migrating. Must match the BEACH_ORIGIN set on the deployed handler so lock hashes verify.');
  process.exit(1);
}
if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error('KV_REST_API_URL and KV_REST_API_TOKEN required.');
  process.exit(1);
}

const DRY = process.env.DRY_RUN === '1';
const DELETE = process.env.DELETE_LEGACY === '1';

const LEGACY_BLOCK_PREFIX = 'pscale-beach-v2:block:';
const LEGACY_LOCKS_PREFIX = 'pscale-beach-v2:locks:';
const NEW_BLOCK_PREFIX = `pscale-beach-v2:${ORIGIN}:block:`;
const NEW_LOCKS_PREFIX = `pscale-beach-v2:${ORIGIN}:locks:`;

async function migrate(legacyPrefix, newPrefix, kind) {
  const legacyKeys = await redis.keys(`${legacyPrefix}*`);
  if (legacyKeys.length === 0) {
    console.log(`  no legacy ${kind} keys to migrate`);
    return 0;
  }
  let migrated = 0;
  for (const legacy of legacyKeys) {
    const name = legacy.slice(legacyPrefix.length);
    const target = `${newPrefix}${name}`;
    if (DRY) {
      console.log(`  [dry] ${legacy} → ${target}`);
      migrated++;
      continue;
    }
    const value = await redis.get(legacy);
    if (value === null) continue;
    await redis.set(target, value);
    if (DELETE) await redis.del(legacy);
    migrated++;
    console.log(`  ✓ ${name} ${DELETE ? '(deleted legacy)' : '(legacy retained)'}`);
  }
  return migrated;
}

async function main() {
  console.log(`pscale-beach: migrating legacy keys → pscale-beach-v2:${ORIGIN}:*`);
  if (DRY) console.log(`  DRY RUN — no writes`);
  console.log(`  block keys:`);
  const blocks = await migrate(LEGACY_BLOCK_PREFIX, NEW_BLOCK_PREFIX, 'block');
  console.log(`  locks keys:`);
  const locks = await migrate(LEGACY_LOCKS_PREFIX, NEW_LOCKS_PREFIX, 'locks');
  console.log(`done — ${blocks} block(s), ${locks} lock-record(s) ${DRY ? '(dry run)' : 'migrated'}`);
  if (!DELETE && !DRY && blocks + locks > 0) {
    console.log(`\nLegacy keys retained for safety. Once you've verified the migration end-to-end:`);
    console.log(`  DELETE_LEGACY=1 BEACH_ORIGIN=${ORIGIN} npm run migrate:keys`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
