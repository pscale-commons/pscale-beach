#!/usr/bin/env node
//
// wipe-by-tide.js — periodic mark-wipe driven by the (beach, 'tide') config.
//
// Reads the tide schedule from the beach, walks the marks block, identifies
// stale marks by category (anonymous / handle / signed), and clears those
// slots. Categories that aren't configured (absent or non-numeric in the
// tide block) are never wiped — the kernel's readSecs() helper and the
// substrate-truth seeded at config/tide.json define the same semantics.
//
// Mark categorisation (mirrors xstream-bsp/src/kernel/beach-kernel.ts):
//   anonymous — agent_id is empty, "(anon)", or starts with "anon-"
//   signed    — field 5 carries a non-empty signature
//   handle    — bears an agent_id, no signature (lightweight identity)
//
// Slot clearing is surgical: one POST per stale slot at its supernest
// spindle, writing `{_: "", "1": "", "2": "", "3": "", "4": null}`. The
// kernel's readMarks filters empty-underscore slots, so cleared slots
// disappear from the V/L/S view on the next cycle. Per-slot locks are
// honoured by the handler — a slot a user has chosen to lock will not
// wipe; the script logs the rejection and moves on.
//
// The marks block itself stays unlocked (open billboard); the script
// does NOT need the operator passphrase for slot clearing. The
// passphrase is only required if the operator additionally chooses to
// extend this script to update the lighthouse's per-run sweep summary
// (out of scope here — keep the cron narrow).
//
// Required env (or .env.local):
//   BEACH_URL — e.g. https://beach.idiothuman.com (no trailing slash)
//
// Optional env:
//   WIPE_DRY_RUN — "1" to log what would be wiped without actually clearing
//
// Cron-mechanic-agnostic: the operator chooses how to schedule this. Common
// shapes — system cron on the operator's machine pointing at BEACH_URL,
// Vercel Cron Jobs (Pro plan), Cloudflare scheduled triggers, GitHub
// Actions on a schedule with the env in repo secrets. None of those are
// hard-coded here; the script just runs once and exits.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Env loading (.env.local preferred; falls back to process.env) ──

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  try {
    const txt = readFileSync(envPath, 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, rawV] = m;
      let v = rawV;
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    // .env.local absent — rely on process.env alone.
  }
}

function requireEnv(name, hint) {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ ${name} not set${hint ? ` — ${hint}` : ''}`);
    process.exit(1);
  }
  return v;
}

// ── HTTP wrappers ──

async function getBlock(beachUrl, blockName) {
  const url = `${beachUrl}/.well-known/pscale-beach?block=${encodeURIComponent(blockName)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GET ${blockName} → ${res.status}: ${txt.slice(0, 200)}`);
  }
  return await res.json();
}

async function clearSlot(beachUrl, blockName, spindle) {
  const url = `${beachUrl}/.well-known/pscale-beach?block=${encodeURIComponent(blockName)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      spindle,
      content: { _: '', '1': '', '2': '', '3': '', '4': null },
    }),
  });
  const txt = await res.text();
  let parsed;
  try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
  return { ok: res.ok, status: res.status, body: parsed };
}

// ── Tide schedule reader (mirrors xstream-bsp's readTideConfig) ──

function readSecs(node) {
  if (typeof node === 'number') return node;
  if (typeof node === 'object' && node !== null) {
    if (typeof node['1'] === 'number') return node['1'];
    if (typeof node._ === 'number') return node._;
  }
  return null;
}

function readTide(block) {
  const empty = { anonymous_secs: null, handle_secs: null, signed_secs: null };
  if (!block || typeof block !== 'object') return empty;
  return {
    anonymous_secs: readSecs(block['1']),
    handle_secs: readSecs(block['2']),
    signed_secs: readSecs(block['3']),
  };
}

// ── Marks walker (mirrors xstream-bsp's walkMarkTree) ──
//
// Walks the supernest collecting every leaf that has the canonical mark
// shape ({_, 1, 2, 3} as strings). Records the spindle path so we can
// write back to the slot's location. Presence-shaped slots (no field 4)
// are excluded — presence sweeping is a separate concern with its own
// staleness rule (see docs/presence-via-marks.md §"Cleanup of stale slots").

function walkMarks(node, path, out) {
  if (typeof node !== 'object' || node === null) return;
  const obj = node;
  const aid = obj['1'];
  const addr = obj['2'];
  const ts = obj['3'];
  if (typeof aid === 'string' && typeof addr === 'string' && typeof ts === 'string') {
    const u = typeof obj._ === 'string' ? obj._ : '';
    // Field 4 distinguishes a substantive mark (face present, even if null)
    // from a presence ping (no field 4 at all, per block-conventions:4.6).
    const isPresenceShaped = obj['4'] === undefined;
    if (!isPresenceShaped && u.trim()) {
      out.push({
        spindle: path,
        text: u,
        agent_id: aid,
        address: addr,
        timestamp: ts,
        face: obj['4'] ?? null,
        signature: typeof obj['5'] === 'string' ? obj['5'] : null,
      });
    }
  }
  for (let d = 1; d <= 9; d++) {
    const k = String(d);
    const child = obj[k];
    if (typeof child === 'object' && child !== null) {
      walkMarks(child, path ? `${path}${k}` : k, out);
    }
  }
}

// ── Categorisation + staleness ──

function categorise(mark) {
  const aid = mark.agent_id;
  if (!aid || aid === '(anon)' || aid.startsWith('anon-')) return 'anonymous';
  if (mark.signature) return 'signed';
  return 'handle';
}

function limitFor(category, tide) {
  if (category === 'anonymous') return tide.anonymous_secs;
  if (category === 'signed') return tide.signed_secs;
  return tide.handle_secs;
}

function isStale(mark, tide, nowMs) {
  const cat = categorise(mark);
  const limitSecs = limitFor(cat, tide);
  if (limitSecs === null || limitSecs <= 0) return false; // never wipe this category
  const ageMs = nowMs - Date.parse(mark.timestamp);
  if (!Number.isFinite(ageMs)) return false; // bad timestamp; leave alone
  return ageMs / 1000 > limitSecs;
}

// ── Main ──

async function main() {
  loadEnv();
  const beachUrl = requireEnv('BEACH_URL', 'e.g. https://beach.idiothuman.com (no trailing slash)').replace(/\/$/, '');
  const dryRun = process.env.WIPE_DRY_RUN === '1';

  console.log(`\n┌─ wipe-by-tide ──────────────────────────────────────`);
  console.log(`│ Beach: ${beachUrl}`);
  console.log(`│ Mode:  ${dryRun ? 'DRY RUN (no writes)' : 'live'}`);
  console.log(`└─────────────────────────────────────────────────────\n`);

  // 1. Read tide schedule.
  console.log(`  reading tide...`);
  const tideBlock = await getBlock(beachUrl, 'tide');
  if (!tideBlock) {
    console.log(`  tide block not found at this beach — nothing to do.`);
    console.log(`  (operators: seed via 'npm run init' or write a tide block manually.)`);
    return;
  }
  const tide = readTide(tideBlock);
  const fmt = (s) => s === null ? 'never' : `${s}s`;
  console.log(`    anonymous: ${fmt(tide.anonymous_secs)}`);
  console.log(`    handle:    ${fmt(tide.handle_secs)}`);
  console.log(`    signed:    ${fmt(tide.signed_secs)}`);

  if (tide.anonymous_secs === null && tide.handle_secs === null && tide.signed_secs === null) {
    console.log(`  no category has a wipe age configured — nothing to do.`);
    return;
  }

  // 2. Read marks block.
  console.log(`  reading marks...`);
  const marksBlock = await getBlock(beachUrl, 'marks');
  if (!marksBlock) {
    console.log(`  marks block not found — nothing to wipe.`);
    return;
  }
  const marks = [];
  walkMarks(marksBlock, '', marks);
  console.log(`    ${marks.length} substantive mark(s) found.`);

  if (marks.length === 0) {
    console.log(`  nothing to evaluate.`);
    return;
  }

  // 3. Identify and wipe stale marks.
  const now = Date.now();
  let wiped = 0;
  let skipped = 0;
  let errors = 0;
  let lockedRejections = 0;

  for (const mark of marks) {
    if (!mark.spindle) { skipped++; continue; } // root underscore — skip
    if (!isStale(mark, tide, now)) { skipped++; continue; }

    const cat = categorise(mark);
    const ageS = Math.round((now - Date.parse(mark.timestamp)) / 1000);
    const label = `${mark.spindle} [${cat}] ${mark.agent_id || '(anon)'} age=${ageS}s`;

    if (dryRun) {
      console.log(`  • would wipe ${label}`);
      wiped++;
      continue;
    }

    const r = await clearSlot(beachUrl, 'marks', mark.spindle);
    if (r.ok) {
      console.log(`  ✓ wiped  ${label}`);
      wiped++;
    } else if (r.status === 403 && r.body?.code === 'lock_required') {
      console.log(`  ⊘ locked ${label} (slot lock — left untouched)`);
      lockedRejections++;
    } else {
      console.log(`  ✗ error  ${label} (${r.status}: ${r.body?.error ?? 'unknown'})`);
      errors++;
    }
  }

  console.log(`\n┌─ done ─────────────────────────────────────────────`);
  console.log(`│ ${dryRun ? 'would wipe' : 'wiped'}: ${wiped}`);
  console.log(`│ skipped (not stale): ${skipped}`);
  if (lockedRejections > 0) console.log(`│ locked (untouched):  ${lockedRejections}`);
  if (errors > 0)           console.log(`│ errors:              ${errors}`);
  console.log(`└─────────────────────────────────────────────────────\n`);

  if (errors > 0) process.exit(2);
}

main().catch(e => {
  console.error(`\n✗ wipe-by-tide failed: ${e.message}`);
  process.exit(1);
});
