#!/usr/bin/env node
// smoke-due.js — unit proof that an append names the zero-slot it just made due.
//
// The accumulation law reserves every zero-carrying number as a summary slot
// voicing the PREVIOUS completed nine (block-conventions:3.5). The debt falls
// due as the next span opens; until now nothing said so, and the law was
// re-derived by hand at each rollover — wrongly, on the record. These cases pin
// the arithmetic at both scales: the block root, and one node down.
//
// Run: npm run smoke:due
import { appendWithSupernest, appendAtNode, zeroSlotDue, zeroFreeIndex, rawWalk } from '../api/floor.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}`);

// the counting line, both directions
ok(zeroFreeIndex('11') === 0 && zeroFreeIndex('19') === 8 && zeroFreeIndex('21') === 9, 'zeroFreeIndex inverts zeroFreePath');

// ── the block root ──
let block = null, r = null, dues = [];
for (let i = 1; i <= 9; i++) { r = appendWithSupernest('history', 'b.com', block, `e${i}`); block = r.block; dues.push(r.due); }
ok(dues.every(d => d === null), 'first nine close nothing — no completed span behind them');

r = appendWithSupernest('history', 'b.com', block, 'e10'); block = r.block;
ok(r.slot === '11' && r.supernested, '10th supernests to slot 11');
eq(r.due, { slot: '10', first: '01', last: '09' }, '…and makes 10 due over 01-09');

r = appendWithSupernest('history', 'b.com', block, 'e11'); block = r.block;
ok(r.due === null, 'mid-span append closes nothing');

for (let i = 12; i <= 18; i++) { r = appendWithSupernest('history', 'b.com', block, `e${i}`); block = r.block; }
ok(r.slot === '19' && r.due === null, 'the ninth of a span closes nothing — the next one does');
r = appendWithSupernest('history', 'b.com', block, 'e19'); block = r.block;
eq(r.due, { slot: '20', first: '11', last: '19' }, 'opening span 2 makes 20 due over 11-19 (never over 21-29)');

// roll the whole floor: the 91st entry supernests to floor 3
for (let i = 20; i <= 90; i++) { r = appendWithSupernest('history', 'b.com', block, `e${i}`); block = r.block; }
r = appendWithSupernest('history', 'b.com', block, 'e91'); block = r.block;
ok(r.slot === '111' && r.floor === 3, '91st supernests to floor 3, slot 111');
eq(r.due, { slot: '110', first: '091', last: '099' }, '…and makes 110 due over 091-099, one zero deeper');

// ── one node down: the grain side (ways:grain 5) ──
// A side is an ordinary accumulator hung below the floor. Every address in the
// law simply takes the side's digit as prefix; nothing about it is exempt.
const grain = { _: 'a bilateral connection', 2: { _: 'the reach text, never rewritten' } };
for (let i = 1; i <= 9; i++) { r = appendAtNode(grain, ['2'], `m${i}`); }
ok(r.slot === '9' && r.due === null, 'nine entries fill the side at 2.1-2.9');

r = appendAtNode(grain, ['2'], 'm10');
ok(r.slot === '11' && r.supernested && r.node_floor === 2, 'the tenth supernests THE SIDE — slot 11, node floor 2');
eq(r.due, { slot: '10', first: '01', last: '09' }, '…and makes the side-relative 10 due over 01-09 (block-relative: 2.10 over 2.01-2.09)');

ok(rawWalk(grain['2'], '11') === 'm10', 'm10 lands at 2.11');
ok(rawWalk(grain['2']._, '5') === 'm5', 'm5 absorbed to 2.05 — the entry number never moves, the address gains a zero');
ok(grain['2']._._ === 'the reach text, never rewritten', 'the reach rides one level deeper, untouched, at 2.00');
ok(grain['2']['1']._ === undefined, 'the due zero-slot 2.10 is EMPTY — paying it destroys nothing');

r = appendAtNode(grain, ['2'], 'm11');
ok(r.slot === '12' && r.due === null, 'the side then continues mid-span, closing nothing');

// the guard: a slot not ending in 1 never claims a debt
ok(zeroSlotDue('45', false, 2) === null && zeroSlotDue('1', false, 1) === null, 'no debt mid-span, none on the very first entry');

console.log(`\nsmoke:due — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
