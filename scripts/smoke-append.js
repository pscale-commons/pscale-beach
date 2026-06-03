#!/usr/bin/env node
// smoke-append.js — unit proof that append-with-supernest actually supernests.
// Run: npm run smoke:append
import { appendWithSupernest, floorDepth, zeroFreePath, rawWalk } from '../api/floor.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

// slot enumeration
ok(zeroFreePath(0, 1) === '1' && zeroFreePath(8, 1) === '9', 'floor1 slots: 1..9');
ok(zeroFreePath(0, 2) === '11' && zeroFreePath(9, 2) === '21' && zeroFreePath(80, 2) === '99', 'floor2 slots: 11,…,21,…,99 (no zeros)');

// append the first 9 from empty — floor 1, no wrap
let block = null; const slots = [];
for (let i = 1; i <= 9; i++) { const r = appendWithSupernest('marks', 'b.com', block, `e${i}`); block = r.block; slots.push(r.slot); ok(!r.supernested, `e${i}: no supernest`); }
ok(slots.join(',') === '1,2,3,4,5,6,7,8,9', 'first 9 land at slots 1..9');
ok(floorDepth(block) === 1, 'floor 1 after 9 entries');

// the 10th forces a supernest to floor 2
let r = appendWithSupernest('marks', 'b.com', block, 'e10'); block = r.block;
ok(r.supernested === true && r.floor === 2 && r.slot === '11', '10th supernests → floor 2, slot 11');
ok(rawWalk(block, '11') === 'e10', 'e10 lands at block[1][1] (address 11)');
ok(rawWalk(block._, '1') === 'e1' && rawWalk(block._, '9') === 'e9', 'e1..e9 absorbed under _ (addresses 01..09)');

// fill the rest of floor 2 (slots 12..99), then the 91st supernests to floor 3
for (let i = 11; i <= 90; i++) { r = appendWithSupernest('marks', 'b.com', block, `e${i}`); block = r.block; }
ok(floorDepth(block) === 2 && rawWalk(block, '99') === 'e90', 'floor 2 holds e10..e90 at slots 11..99');
r = appendWithSupernest('marks', 'b.com', block, 'e91'); block = r.block;
ok(r.supernested === true && r.floor === 3 && r.slot === '111', '91st supernests → floor 3, slot 111');
ok(rawWalk(block, '111') === 'e91', 'e91 lands at block[1][1][1] (address 111)');

// dated-address preservation: e1 is now two wraps deep, reachable at _._[1]
ok(rawWalk(block._._, '1') === 'e1', 'e1 still present after two wraps (dated address 1 → 001)');

console.log(`\nsmoke:append — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
