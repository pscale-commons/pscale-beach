#!/usr/bin/env node
// pack-dump.mjs — snapshot a beach's blocks into a cartridge directory.
//   node pack-dump.mjs --beach <url> --out <dir> [--blocks a,b,c] [--rewrite-beach <host>]
//
// Each block lands as <encoded-name>.json = {name, content}. With
// --rewrite-beach <url>, absolute star-tag refs to that exact beach URL become
// the {{BEACH}} placeholder, so the cartridge is portable to any beach (the
// substitution is reversed at seed). Lock policy is NOT dumped (lock hashes
// aren't exposed over HTTP) — author it into each block file's `lock` field by
// hand, or via the MANIFEST.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const A = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const beach = A('beach');
const out = A('out');
const blocksArg = A('blocks');
const rewrite = A('rewrite-beach');
if (!beach || !out) { console.error('usage: pack-dump --beach <url> --out <dir> [--blocks a,b,c] [--rewrite-beach <host>]'); process.exit(1); }

const ep = `${beach.replace(/\/$/, '')}/.well-known/pscale-beach`;

let names;
if (blocksArg) {
  names = blocksArg.split(',').map((s) => s.trim()).filter(Boolean);
} else {
  const idx = await (await fetch(ep)).json();
  names = idx.blocks || [];
}

await fs.mkdir(out, { recursive: true });
let n = 0;
for (const name of names) {
  const r = await fetch(`${ep}?block=${encodeURIComponent(name)}`);
  if (!r.ok) { console.error(`skip ${name}: HTTP ${r.status}`); continue; }
  let content = await r.json();
  if (rewrite) {
    const s = JSON.stringify(content).replaceAll(rewrite.replace(/\/$/, ''), '{{BEACH}}');
    content = JSON.parse(s);
  }
  await fs.writeFile(join(out, `${encodeURIComponent(name)}.json`), JSON.stringify({ name, content }, null, 2) + '\n');
  n++;
  console.error(`dumped ${name}`);
}
console.error(`\n${n} block(s) → ${out}`);
