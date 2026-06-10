#!/usr/bin/env node
// pack-seed.mjs — seed a cartridge into a beach.
//   node pack-seed.mjs --beach <url> --pack <dir> [--subdir definition|initial|both]
//
// For each block file ({name, lock?, content}) under the chosen subdir(s):
//   - substitute {{BEACH}} → the target beach URL (portability),
//   - create the block (whole-block write),
//   - if the file has a `lock` ({position:"_", secret_env}), lock it with the
//     secret read from that env var (R1 create-locked; assumes a clean target,
//     i.e. run pack-reset first when re-seeding).

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import https from 'node:https';

const A = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const beach = A('beach');
const pack = A('pack');
const subdir = A('subdir', 'both');
if (!beach || !pack) { console.error('usage: pack-seed --beach <url> --pack <dir> [--subdir definition|initial|both]'); process.exit(1); }

const beachUrl = beach.replace(/\/$/, '');
const dirs = subdir === 'both' ? ['definition', 'initial'] : [subdir];

// --via: connect to a DIFFERENT origin than --beach, sending Host=<beach host>.
// Lets you seed a sub-beach (--beach https://sub.host) through the apex's valid
// cert (--via https://host) before the wildcard cert is issued. Default: connect
// straight to --beach. Uses node http(s) because global fetch pins the Host header.
const via = A('via', beachUrl).replace(/\/$/, '');
const beachHost = new URL(beachUrl).host;
function post(blockName, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${via}/.well-known/pscale-beach?block=${encodeURIComponent(blockName)}`);
    const data = JSON.stringify(bodyObj);
    const lib = u.protocol === 'https:' ? https : http;
    const r = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      servername: u.hostname, // SNI = the connect host (valid cert); Host header routes the sub-beach
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Host: beachHost },
    }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : {} }));
    });
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

async function readPackFiles(d) {
  const p = join(pack, d);
  let files;
  try { files = await fs.readdir(p); } catch { return []; }
  const out = [];
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    out.push(JSON.parse(await fs.readFile(join(p, f), 'utf8')));
  }
  return out;
}

let n = 0;
for (const d of dirs) {
  for (const blk of await readPackFiles(d)) {
    const content = JSON.parse(JSON.stringify(blk.content).replaceAll('{{BEACH}}', beachUrl));
    const body = { spindle: '', content, confirm: true };
    if (blk.lock) {
      const secret = process.env[blk.lock.secret_env];
      if (!secret) console.error(`! ${blk.name}: lock needs env ${blk.lock.secret_env} (unset) — seeding UNLOCKED`);
      else body.new_lock = secret;
    }
    const { status, body: j } = await post(blk.name, body);
    if (status < 200 || status >= 300) { console.error(`FAIL ${blk.name}: HTTP ${status} ${JSON.stringify(j)}`); process.exit(1); }
    n++;
    console.error(`seeded ${blk.name}${blk.lock ? ` (locked ${blk.lock.position})` : ''}`);
  }
}
console.error(`\n${n} block(s) seeded → ${beachUrl}`);
