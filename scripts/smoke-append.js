#!/usr/bin/env node
// smoke-append.js — unit proof that append-with-supernest actually supernests.
// Run: npm run smoke:append
import { appendWithSupernest, floorDepth, zeroFreePath, rawWalk, owedSummaries } from '../api/floor.js';

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


// ── zero-slot dues ──────────────────────────────────────────────────────────
// N0 voices the PREVIOUS completed nine (+0 inductive, block-conventions:3.5),
// and falls due the moment the NEXT span opens. Getting this backwards — voicing
// the nine INSIDE N — is the live error these cases exist to pin: it was made on
// 2026-08-09 across ten wrappers before David caught it, and the giveaway is
// that the very first due is 10 over 1-9, entries that live under the root
// underscore after the wrap and are easy to forget entirely.
let d = { _: 'a fresh accumulator' };
for (let i = 1; i <= 9; i++) d = appendWithSupernest('marks', 'b.com', d, `m${i}`).block;
ok(owedSummaries(d).length === 0, 'nine entries at floor 1 owe nothing — no span has closed');

d = appendWithSupernest('marks', 'b.com', d, 'm10').block;   // opens span 1 at slot 11
let due = owedSummaries(d);
ok(due.length === 1 && due[0].slot === '10' && due[0].over === '1-9',
   'the tenth entry makes 10 owed over 1-9 — the due falls as the next span OPENS');

// paying it clears the due; paying the WRONG slot does not
d._['_'] = d._['_'];                                          // (no-op, keeps shape explicit)
d['1']._ = 'summary of 1-9';
ok(owedSummaries(d).length === 0, 'a scalar at 10 clears the due');
ok(rawWalk(d, '11') === 'm10', 'and leaves the container entries untouched');

// fill span 1 and open span 2 → 20 falls due over 11-19, never over 21-29
for (let i = 11; i <= 19; i++) d = appendWithSupernest('marks', 'b.com', d, `m${i}`).block;
due = owedSummaries(d);
ok(due.length === 1 && due[0].slot === '20' && due[0].over === '11-19',
   '20 voices 11-19 — the previous nine, NOT the nine inside container 2');

// dues accumulate and report oldest first
for (let i = 20; i <= 28; i++) d = appendWithSupernest('marks', 'b.com', d, `n${i}`).block;
due = owedSummaries(d);
ok(due.length === 2 && due[0].slot === '20' && due[1].slot === '30',
   'unpaid dues accumulate and report oldest first (20 before 30)');

// the real board: 82 entries across nine closed spans owes exactly nine
let board = { _: 'marks' };
for (let i = 1; i <= 82; i++) board = appendWithSupernest('marks', 'b.com', board, `x${i}`).block;
const boardDue = owedSummaries(board);
ok(boardDue.length === 9 && boardDue[0].slot === '10' && boardDue[8].slot === '90',
   '82 entries owe nine summaries, 10 through 90 — the live marks board as found');
ok(boardDue[8].over === '81-89', 'the newest due voices 81-89, the span the 82nd entry closed behind it');

console.log(`\nsmoke:append — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
