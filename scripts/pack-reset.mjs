#!/usr/bin/env node
// pack-reset.mjs — total rollback. Wipe every block the cartridge owns, then
// reseed from definition/ + initial/.
//   node pack-reset.mjs --beach <url> --pack <dir>
//
// Deletes each block in the pack's file set (passing its `_` secret when
// locked), then runs pack-seed. Blocks outside the cartridge's file set are
// never touched — the cartridge's block-list IS the reset boundary. On a
// dedicated (sub-)beach there is nothing outside it, so the rollback is total.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const A = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const beach = A('beach');
const pack = A('pack');
if (!beach || !pack) { console.error('usage: pack-reset --beach <url> --pack <dir>'); process.exit(1); }

const ep = `${beach.replace(/\/$/, '')}/.well-known/pscale-beach`;

async function packFiles() {
  const out = [];
  for (const d of ['definition', 'initial']) {
    const p = join(pack, d);
    let files;
    try { files = await fs.readdir(p); } catch { continue; }
    for (const f of files.filter((x) => x.endsWith('.json'))) {
      out.push(JSON.parse(await fs.readFile(join(p, f), 'utf8')));
    }
  }
  return out;
}

for (const blk of await packFiles()) {
  const body = { confirm: true };
  if (blk.lock) { const s = process.env[blk.lock.secret_env]; if (s) body.secret = s; }
  const r = await fetch(`${ep}?block=${encodeURIComponent(blk.name)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  console.error(`wipe ${blk.name}: HTTP ${r.status}`);
}

console.error('— reseeding —');
const seed = spawnSync('node', [join(import.meta.dirname, 'pack-seed.mjs'), '--beach', beach, '--pack', pack], { stdio: 'inherit' });
process.exit(seed.status || 0);
