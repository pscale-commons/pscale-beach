#!/usr/bin/env node
//
// seed-beach.js — one-time init wizard for a fresh beach.
//
// Reads operator config from env (or prompts for missing values), then POSTs
// seed blocks to the deployed /.well-known/pscale-beach endpoint:
//
//   • library/    — reference blocks (reflexive, spore, vision, grit, rpg,
//                   state, systemic-kernel, federation-protocol,
//                   state-block-reflexive-spark, pscale-geometry). Locked at
//                   "_" with operator's passphrase so the operator can curate.
//   • passport:<handle>  — operator's passport (template, locked).
//   • shell:<handle>     — operator's shell (template, locked).
//   • history:<handle>   — empty history scaffold (locked).
//   • marks              — beach surface; welcome mark at slot 1 (open).
//   • pool:<name>        — one named pool (locked at "_" by operator).
//   • sed:<name>         — registrant collective (locked at "_" by operator).
//
// Required env (or .env.local):
//   BEACH_URL        — e.g. https://idiothuman.com
//   BEACH_HANDLE     — operator's handle, e.g. idiothuman
//   BEACH_PASSPHRASE — operator's passphrase (locks passport/shell/history/pool/sed)
//
// Optional env:
//   BEACH_POOL_NAME    — default "visiting"
//   BEACH_POOL_PURPOSE — default "Pool for visitors to introduce themselves"
//   BEACH_SED_NAME     — default "<handle>-commons"
//   LIBRARY_SUBSET     — comma-separated list of library block names to seed.
//                        Default: all. Use "none" to skip.
//   BEACH_NEIGHBOURS   — comma-separated federated URLs to list at the
//                        lighthouse's position 6. Each entry is either
//                        "<URL>" or "<URL>|<description>". Empty by default.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = resolve(__dirname, '..', 'seeds');

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
    console.error(`  Set in .env.local or as a process env var, then retry.`);
    process.exit(1);
  }
  return v;
}

// ── Template substitution ──

function substitute(text, vars) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => {
    if (!(key in vars)) {
      throw new Error(`Template references unknown placeholder: ${key}`);
    }
    return vars[key];
  });
}

function loadTemplate(filename, vars) {
  const path = resolve(SEEDS_DIR, 'templates', filename);
  const raw = readFileSync(path, 'utf8');
  const substituted = substitute(raw, vars);
  return JSON.parse(substituted);
}

function loadLibrary(name) {
  const path = resolve(SEEDS_DIR, 'library', `${name}.json`);
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

function listLibrary() {
  return readdirSync(resolve(SEEDS_DIR, 'library'))
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -5));
}

// ── Lighthouse compilation ──
//
// Walk the underscore ladder to its substantive text (recurses _._) per
// sunstone:1.4. The full underscore lands in the lighthouse — visitors
// reading the lighthouse get the target's authored statement without an
// extra walk. Library underscores are 500-1500 chars; the full lighthouse
// stays under ~10KB which is comfortably small.

function underscoreText(node) {
  if (!node || typeof node !== 'object') return '';
  const u = node._;
  if (typeof u === 'string') return u;
  if (u && typeof u === 'object') return underscoreText(u);
  return '';
}

function parseNeighbours(spec) {
  if (!spec) return [];
  return spec.split(',').map(s => s.trim()).filter(Boolean).map(entry => {
    const pipe = entry.indexOf('|');
    if (pipe < 0) return `${entry} — Federated beach.`;
    const url = entry.slice(0, pipe).trim();
    const desc = entry.slice(pipe + 1).trim();
    return `${url} — ${desc}`;
  });
}

// ── HTTP wrapper ──

async function postBeach(beachUrl, blockName, body) {
  const url = `${beachUrl}/.well-known/pscale-beach?block=${encodeURIComponent(blockName)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  const txt = await res.text();
  let parsed;
  try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }
  if (!res.ok) {
    throw new Error(`POST ${blockName} → ${res.status}: ${parsed?.error ?? txt}`);
  }
  return parsed;
}

// ── Main ──

async function main() {
  loadEnv();

  const beachUrl = requireEnv('BEACH_URL', 'e.g. https://idiothuman.com (no trailing slash)').replace(/\/$/, '');
  const handle = requireEnv('BEACH_HANDLE', 'operator handle, e.g. idiothuman');
  const passphrase = requireEnv('BEACH_PASSPHRASE', 'operator passphrase — locks passport/shell/history/pool/sed');
  const poolName = process.env.BEACH_POOL_NAME || 'visiting';
  const poolPurpose = process.env.BEACH_POOL_PURPOSE || 'Pool for visitors to introduce themselves';
  const sedName = process.env.BEACH_SED_NAME || `${handle}-commons`;

  const subsetSpec = process.env.LIBRARY_SUBSET;
  let librarySubset;
  if (!subsetSpec || subsetSpec === 'all') {
    librarySubset = listLibrary();
  } else if (subsetSpec === 'none') {
    librarySubset = [];
  } else {
    librarySubset = subsetSpec.split(',').map(s => s.trim()).filter(Boolean);
  }

  const neighbours = parseNeighbours(process.env.BEACH_NEIGHBOURS);

  const timestamp = new Date().toISOString();

  const vars = {
    HANDLE: handle,
    BEACH_URL: beachUrl,
    TIMESTAMP: timestamp,
    POOL_NAME: poolName,
    POOL_PURPOSE: poolPurpose,
    SED_NAME: sedName
  };

  console.log(`\n┌─ pscale-beach init ─────────────────────────────────`);
  console.log(`│ Beach: ${beachUrl}`);
  console.log(`│ Handle: ${handle}`);
  console.log(`│ Pool: pool:${poolName} — ${poolPurpose}`);
  console.log(`│ Sed: sed:${sedName}`);
  console.log(`│ Library subset (${librarySubset.length}): ${librarySubset.join(', ') || '(none)'}`);
  console.log(`└─────────────────────────────────────────────────────\n`);

  // Reachability check — handler must be live before we seed.
  const probe = await fetch(`${beachUrl}/.well-known/pscale-beach`).catch(e => {
    throw new Error(`Cannot reach ${beachUrl}/.well-known/pscale-beach — handler not deployed? (${e.message})`);
  });
  if (!probe.ok) {
    throw new Error(`Beach probe returned ${probe.status} — check deploy and env vars.`);
  }

  // Library — locked at "_" so operator can curate later.
  for (const name of librarySubset) {
    const content = loadLibrary(name);
    await postBeach(beachUrl, name, {
      spindle: '', content, confirm: true, new_lock: passphrase
    });
    console.log(`  ✓ library: ${name}`);
  }

  // Operator presence — passport, shell, history. All locked at "_".
  const passport = loadTemplate('passport.template.json', vars);
  await postBeach(beachUrl, `passport:${handle}`, {
    spindle: '', content: passport, confirm: true, new_lock: passphrase
  });
  console.log(`  ✓ passport:${handle}`);

  const shell = loadTemplate('shell.template.json', vars);
  await postBeach(beachUrl, `shell:${handle}`, {
    spindle: '', content: shell, confirm: true, new_lock: passphrase
  });
  console.log(`  ✓ shell:${handle}`);

  const historyBlock = {
    _: `${handle}'s history at ${beachUrl} — initialised at ${timestamp}. Each new entry goes at the next free digit; when 9 fills, supernest by compressing prior entries into the +0 underscore (sunstone:8) and resuming at 1.`
  };
  await postBeach(beachUrl, `history:${handle}`, {
    spindle: '', content: historyBlock, confirm: true, new_lock: passphrase
  });
  console.log(`  ✓ history:${handle}`);

  // Beach surfaces — marks (open), pool (locked at "_"), sed (locked at "_").
  const welcomeMark = loadTemplate('welcome-mark.template.json', vars);
  const marksBlock = {
    _: `marks at ${beachUrl}. Open stigmergy — drop a mark at the next free positive integer composed of digits 1-9. Tide policy not yet declared. See pscale://block-conventions branch 9 for the mark convention.`,
    '1': welcomeMark
  };
  await postBeach(beachUrl, 'marks', {
    spindle: '', content: marksBlock, confirm: true
  });
  console.log(`  ✓ marks (with welcome mark at slot 1)`);

  const pool = loadTemplate('pool.template.json', vars);
  await postBeach(beachUrl, `pool:${poolName}`, {
    spindle: '', content: pool, confirm: true, new_lock: passphrase
  });
  console.log(`  ✓ pool:${poolName}`);

  const sed = loadTemplate('sed-commons.template.json', vars);
  await postBeach(beachUrl, `sed:${sedName}`, {
    spindle: '', content: sed, confirm: true, new_lock: passphrase
  });
  console.log(`  ✓ sed:${sedName}`);

  // Lighthouse — curated navigation. Composed AFTER all other blocks are
  // seeded so the library previews reflect what was actually written.
  const lighthouse = loadTemplate('lighthouse.template.json', vars);

  // Position 5 — library entries. Each is "<name> — <full underscore>".
  // Full underscore (not first sentence) so visitors get the substance
  // the library author put in the underscore without re-walking. Library
  // sub-positions take the supernest pattern (1..9, then 11, 12, ...).
  for (let i = 0; i < librarySubset.length && i < 9; i++) {
    const name = librarySubset[i];
    const content = loadLibrary(name);
    lighthouse['5'][String(i + 1)] = `${name} — ${underscoreText(content)}`;
  }
  for (let i = 9; i < librarySubset.length; i++) {
    const name = librarySubset[i];
    const content = loadLibrary(name);
    // 10th entry lands at slot "11" (slot "10" contains a '0' digit,
    // reserved as the underscore-summary per block-conventions:9).
    const slot = String(i + 2);
    lighthouse['5'][slot] = `${name} — ${underscoreText(content)}`;
  }

  // Position 6 — neighbouring beaches. Static-only at init; operator adds
  // more via direct bsp() writes against position 6.<next-free>.
  for (let i = 0; i < neighbours.length && i < 9; i++) {
    lighthouse['6'][String(i + 1)] = neighbours[i];
  }

  await postBeach(beachUrl, 'lighthouse', {
    spindle: '', content: lighthouse, confirm: true, new_lock: passphrase
  });
  console.log(`  ✓ lighthouse (library entries: ${librarySubset.length}, neighbours: ${neighbours.length})`);

  console.log(`\n┌─ done ─────────────────────────────────────────────`);
  console.log(`│ Beach is seeded and live at ${beachUrl}`);
  console.log(`│ Connect via mcp-remote (or any bsp-mcp client) and walk:`);
  console.log(`│   bsp(agent_id='${beachUrl}', block='lighthouse') — curated welcome`);
  console.log(`│   bsp(agent_id='${beachUrl}')                    — bare index`);
  console.log(`│   bsp(agent_id='${beachUrl}', block='passport:${handle}')   — your card`);
  console.log(`│   bsp(agent_id='${beachUrl}', block='marks')     — drop-by signal`);
  console.log(`│   bsp(agent_id='pscale', block='manifest')        — substrate orientation`);
  console.log(`│ Visitors register via pscale_register at sed:${sedName}.`);
  console.log(`└─────────────────────────────────────────────────────\n`);
}

main().catch(e => {
  console.error(`\n✗ init failed: ${e.message}`);
  process.exit(1);
});
