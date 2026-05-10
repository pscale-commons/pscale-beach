#!/usr/bin/env node
//
// smoke-lighthouse.js — exercise the lighthouse compilation flow without HTTP.
//
// Substitutes placeholders into seeds/templates/lighthouse.template.json,
// walks seeds/library/, compiles first-sentence previews into position 5,
// and validates the resulting block against the shape declared at
// pscale://block-conventions branch 11 (underscore plus positions 1, 2,
// 3._/3.1, 4._/4.1, 5._, 6._, 9._/9.1/9.2).
//
// Run with `node scripts/smoke-lighthouse.js` from the repo root.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEDS_DIR = resolve(__dirname, '..', 'seeds');

// ── Helpers (mirror seed-beach.js) ──

function substitute(text, vars) {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => {
    if (!(key in vars)) throw new Error(`Template references unknown placeholder: ${key}`);
    return vars[key];
  });
}

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

// ── Compile ──

const vars = {
  HANDLE: 'smoke',
  BEACH_URL: 'https://smoke.example',
  TIMESTAMP: '2026-05-10T00:00:00Z',
  POOL_NAME: 'visiting',
  POOL_PURPOSE: 'Pool for visitors to introduce themselves at smoke',
  SED_NAME: 'smoke-commons'
};

const tplRaw = readFileSync(resolve(SEEDS_DIR, 'templates', 'lighthouse.template.json'), 'utf8');
const lighthouse = JSON.parse(substitute(tplRaw, vars));

const libraryNames = readdirSync(resolve(SEEDS_DIR, 'library'))
  .filter(f => f.endsWith('.json'))
  .map(f => f.slice(0, -5));

for (let i = 0; i < libraryNames.length && i < 9; i++) {
  const name = libraryNames[i];
  const content = JSON.parse(readFileSync(resolve(SEEDS_DIR, 'library', `${name}.json`), 'utf8'));
  lighthouse['5'][String(i + 1)] = `${name} — ${underscoreText(content)}`;
}
for (let i = 9; i < libraryNames.length; i++) {
  const name = libraryNames[i];
  const content = JSON.parse(readFileSync(resolve(SEEDS_DIR, 'library', `${name}.json`), 'utf8'));
  lighthouse['5'][String(i + 2)] = `${name} — ${underscoreText(content)}`;
}

const neighbours = parseNeighbours('https://happyseaurchin.com|David\'s reference deployment,https://beach.idiothuman.com');
for (let i = 0; i < neighbours.length && i < 9; i++) {
  lighthouse['6'][String(i + 1)] = neighbours[i];
}

// ── Validate shape ──

let pass = 0, fail = 0;
function expect(cond, label) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log('--- Lighthouse shape validation ---');
expect(typeof lighthouse._ === 'string' && lighthouse._.length > 100, 'underscore is a substantive sentence');
expect(typeof lighthouse._ === 'string' && !lighthouse._.includes('{{'), 'all placeholders substituted');
expect(typeof lighthouse['1'] === 'string' && lighthouse['1'].startsWith('passport:smoke'), 'position 1 is passport entry');
expect(typeof lighthouse['2'] === 'string' && lighthouse['2'].startsWith('marks'), 'position 2 is marks entry');
expect(typeof lighthouse['3'] === 'object' && typeof lighthouse['3']._ === 'string', 'position 3 is pools sub-block with underscore');
expect(typeof lighthouse['3']['1'] === 'string' && lighthouse['3']['1'].startsWith('pool:visiting'), 'pool entry at 3.1');
expect(typeof lighthouse['4']._ === 'string' && typeof lighthouse['4']['1'] === 'string', 'sed sub-block at 4');
expect(typeof lighthouse['5']._ === 'string', 'library sub-block underscore at 5');
expect(typeof lighthouse['5']['1'] === 'string' && lighthouse['5']['1'].includes(' — '), 'library entry at 5.1 has the address-preview shape');
expect(libraryNames.length === Object.keys(lighthouse['5']).filter(k => k !== '_').length, `position 5 has ${libraryNames.length} entries (matches library count)`);
expect(typeof lighthouse['6']._ === 'string', 'neighbours sub-block underscore at 6');
expect(typeof lighthouse['6']['1'] === 'string' && lighthouse['6']['1'].includes('happyseaurchin'), 'neighbour at 6.1 picked up from spec');
expect(typeof lighthouse['6']['2'] === 'string' && lighthouse['6']['2'].includes('idiothuman'), 'neighbour at 6.2');
expect(lighthouse['9']?.['1'] === 'v1', 'lighthouse version at 9.1');
expect(typeof lighthouse['9']?.['2'] === 'string' && lighthouse['9']['2'].includes('2026'), 'init timestamp at 9.2');

// Spine discipline — no _word sibling keys, no JSON-stringified objects.
function checkSpine(node, path) {
  if (!node || typeof node !== 'object') return;
  for (const k of Object.keys(node)) {
    if (k !== '_' && !/^[1-9][0-9]*$/.test(k)) {
      fail++;
      console.log(`  ✗ spine violation at ${path}: key "${k}" (only "_" and digits allowed)`);
    }
    if (typeof node[k] === 'string') {
      const v = node[k].trim();
      if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) {
        try {
          JSON.parse(v);
          fail++;
          console.log(`  ✗ JSON-stringified value at ${path}.${k} (handler will reject)`);
        } catch { /* not actually JSON — fine */ }
      }
    }
    if (typeof node[k] === 'object') checkSpine(node[k], `${path}.${k}`);
  }
}
const beforeSpineFails = fail;
checkSpine(lighthouse, 'root');
if (fail === beforeSpineFails) { pass++; console.log('  ✓ spine discipline (only "_" and digit keys; no JSON-stringified subtrees)'); }

console.log(`\n--- Size + preview snapshot ---`);
const totalBytes = JSON.stringify(lighthouse).length;
console.log('lighthouse JSON bytes:', totalBytes);
console.log('5.1 first 100 chars:', lighthouse['5']['1'].slice(0, 100), '...');
console.log('5.2 first 100 chars:', lighthouse['5']['2'].slice(0, 100), '...');
console.log('5.3 first 100 chars:', lighthouse['5']['3'].slice(0, 100), '...');
console.log('5.1 full length:', lighthouse['5']['1'].length, 'chars');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
