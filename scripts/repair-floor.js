#!/usr/bin/env node
// repair-floor.js — one-shot: add a missing root `_` identity to every floor-0
// block on a beach. Address-preserving — entries keep their addresses; only the
// pscale label snaps from negative to 0. Idempotent. Self-scoping (derives the
// target list from the surface index). Re-runnable.
//
// Over HTTP: uses the deployed handler's whole-block write (confirm:true), so it
// needs NO redis credentials — only the public beach URL. Works on unlocked
// accumulators (every malformed block found is open).
//
// Usage:
//   node scripts/repair-floor.js https://beach.happyseaurchin.com           # DRY RUN (prints, writes nothing)
//   node scripts/repair-floor.js https://beach.happyseaurchin.com --apply   # write, with per-block backups
//
// Flags: --apply            actually write (default is dry run)
//        --backup-dir <dir> backups directory (default ./floor-repair-backups)
// Env:   SECRET=<secret>    only needed if a floor-0 block is locked (none expected)
//
// Repairs well-formedness only (adds the missing floor). It does NOT convert the
// fixed-floor subnest shape to supernest — that is separate, deferred work.

import fs from 'node:fs';
import path from 'node:path';
import { hasFloor, repairFloor } from '../api/floor.js';

const url = process.argv.find(a => /^https?:\/\//.test(a));
const APPLY = process.argv.includes('--apply');
const backupDir = (() => {
  const i = process.argv.indexOf('--backup-dir');
  return i >= 0 ? process.argv[i + 1] : './floor-repair-backups';
})();

if (!url) {
  console.error('usage: node scripts/repair-floor.js <beach-url> [--apply] [--backup-dir <dir>]');
  process.exit(1);
}
const origin = new URL(url).host;
const wk = `${url.replace(/\/$/, '')}/.well-known/pscale-beach`;

async function getJSON(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`GET → ${r.status}`);
  return r.json();
}

async function main() {
  console.log(`repair-floor: ${origin}  (${APPLY ? 'APPLY' : 'DRY RUN — no writes'})`);
  const index = await getJSON(wk);
  const names = index.blocks || [];
  console.log(`  surface has ${names.length} blocks; scanning for floor-0 …`);

  const targets = [];
  for (const name of names) {
    let block;
    try { block = await getJSON(`${wk}?block=${encodeURIComponent(name)}`); }
    catch (e) { console.log(`  ? ${name} — fetch failed (${e.message}); skipping`); continue; }
    if (!hasFloor(block)) targets.push([name, block]);
  }

  if (!targets.length) { console.log('  ✓ nothing to repair — every block has a floor'); return; }
  console.log(`  ${targets.length} floor-0 block(s):`);
  if (APPLY) fs.mkdirSync(backupDir, { recursive: true });

  let done = 0, failed = 0;
  for (const [name, block] of targets) {
    const { block: fixed } = repairFloor(name, origin, block);
    if (!APPLY) {
      console.log(`  [dry] ${name}  →  seed _: ${JSON.stringify(fixed._).slice(0, 90)}`);
      continue;
    }
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    fs.writeFileSync(path.join(backupDir, `${safe}.json`), JSON.stringify(block, null, 2));
    const body = { spindle: '', content: fixed, confirm: true };
    if (process.env.SECRET) body.secret = process.env.SECRET;
    const r = await fetch(`${wk}?block=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (r.ok) { console.log(`  ✓ ${name}`); done++; }
    else { console.log(`  ✗ ${name} → ${r.status} ${txt.slice(0, 140)}`); failed++; }
  }
  if (APPLY) console.log(`\ndone — ${done} repaired, ${failed} failed. backups in ${backupDir}`);
  else console.log(`\ndry run complete — re-run with --apply to write.`);
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
