#!/usr/bin/env node
// smoke-floor.js — unit tests for the floor-invariant helpers (no redis, no
// network). This is the gate before deploying the floor-seed handler change.
// Run: npm run smoke:floor
import { floorDepth, hasFloor, defaultIdentity, repairFloor } from '../api/floor.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('  ✗', msg); } };

// floorDepth
ok(floorDepth({ 1: 'a' }) === 0, 'floorDepth: bare digit map → 0 (the bug shape)');
ok(floorDepth({ _: 'id', 1: 'a' }) === 1, 'floorDepth: floored → 1');
ok(floorDepth({ _: { _: 'id' } }) === 2, 'floorDepth: floor-2 → 2');

// hasFloor — the well-formedness test
ok(hasFloor({ 1: 'a' }) === false, 'hasFloor: floor-0 → false');
ok(hasFloor({ _: 'id', 1: 'a' }) === true, 'hasFloor: floored → true');
ok(hasFloor({ _: { 1: 'x' } }) === false, 'hasFloor: _ chain without string terminus → false');
ok(hasFloor('bare string') === false, 'hasFloor: non-object → false');

// defaultIdentity
ok(defaultIdentity('marks', 'b.com').startsWith('Marks at b.com.'), 'identity: marks');
ok(defaultIdentity('presence', 'b.com').startsWith('Presence at b.com.'), 'identity: presence');
ok(defaultIdentity('liquid:pool:rpg', 'b.com').startsWith('Liquid composition buffer at b.com.'), 'identity: liquid:pool:*');
ok(defaultIdentity('beach-log:waer', 'b.com') === 'beach-log:waer at b.com.', 'identity: generic');

// repairFloor — the migration transform (address-preserving, idempotent)
const flat = { 1: { _: 'first', 1: 'alice' }, 2: { _: 'second' }, 9: { _: 'ninth' } };
const r = repairFloor('marks', 'b.com', flat);
ok(r.changed === true, 'repair: floor-0 marks → changed');
ok(floorDepth(r.block) === 1, 'repair: result is floor 1');
ok(r.block['1'] === flat['1'], 'repair: entry 1 preserved (same object, same address)');
ok(JSON.stringify(r.block['9']) === JSON.stringify(flat['9']), 'repair: entry 9 preserved');
ok(r.block['_'] === defaultIdentity('marks', 'b.com'), 'repair: seeded the marks identity');
const r2 = repairFloor('marks', 'b.com', r.block);
ok(r2.changed === false && r2.block === r.block, 'repair: idempotent — already floored is untouched');
ok(repairFloor('marks', 'b.com', { _: 'marks at x', 1: { _: 'm' } }).changed === false, 'repair: well-formed block untouched');

console.log(`\nsmoke:floor — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
