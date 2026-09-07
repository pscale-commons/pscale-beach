#!/usr/bin/env node
// smoke-temporal.js — the sundial on the wire.
//
// Two proofs. First, lib/temporal.js is a faithful port of bsp-mcp's
// src/temporal.ts: the momentToAddress / voiceAddress cases of that repo's
// scripts/smoke-temporal.ts are carried here verbatim, so the two arithmetics
// cannot drift unnoticed (re-port, never fork). Second, the REAL handler over a
// temp-dir FileRedis carries the stamp — X-Pscale-Now on every response served,
// `now` in the derived index, and never a key inside a block.
//
// No redis, no network. Run: npm run smoke:temporal

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { momentToAddress, addressToSpan, voiceAddress, renderNow, nowHeader, NOW_HEADER } from '../lib/temporal.js';

let pass = 0, fail = 0;
const ok = (c, m, detail = '') => { if (c) pass++; else { fail++; console.error('  ✗', m, detail); } };
const eq = (m, got, want) => ok(Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want), m,
  `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const section = (name) => { console.log(`\n${name}`); };

// ── The port — bsp-mcp scripts/smoke-temporal.ts, momentToAddress and voice cases ──

section('THE GREGORIAN YEAR IS THE ADDRESS — no epoch');
const t = new Date('2026-07-15T18:30:00Z');
const addr = momentToAddress(t);
eq('2026-07-15 18:30 UTC → 2026313179', addr, '2026313179');
eq('the first four digits ARE the year', addr.slice(0, 4), '2026');
eq('floor 10 — ten rungs, ten digits', addr.length, 10);
eq('and it voices itself', voiceAddress(addr), 'Wednesday 15 July 2026, late afternoon (beat 9)');

section('ROUND TRIP — the address names a span that contains its moment');
for (const iso of ['2026-07-15T18:30:00Z', '2026-01-01T00:00:00Z', '2026-12-31T23:59:59Z',
  '2020-02-29T12:00:00Z', '1999-12-31T23:59:00Z', '2100-06-15T06:00:00Z']) {
  const d = new Date(iso);
  const a = momentToAddress(d);
  const { start, end } = addressToSpan(a);
  ok(d >= start && d < end, `${iso} → ${a} → span contains it`, `span ${start.toISOString()}..${end.toISOString()}`);
}

section('COARSE FORMS — trailing zeros are floor-width padding');
eq('2026000000 is the year 2026 (pscale 6)', addressToSpan('2026000000').pscale, 6);
eq('  …and voices as the year', voiceAddress('2026000000'), '2026');
eq('2026310000 is July 2026 (pscale 4)', addressToSpan('2026310000').pscale, 4);
eq('  …and voices as the month', voiceAddress('2026310000'), 'July 2026');
eq('2000000000 is the millennium (pscale 9)', addressToSpan('2000000000').pscale, 9);
eq('  …and voices as the 2000s', voiceAddress('2000000000'), 'the 2000s');
eq('2100000000 is the century (pscale 8)', addressToSpan('2100000000').pscale, 8);
eq('2020000000 is the decade (pscale 7)', addressToSpan('2020000000').pscale, 7);

section('THE WART — a year ending in 0 has no distinct coarse address');
ok(addressToSpan('2020000000').pscale === 7,
  '2020000000 reads as the DECADE, not the year 2020 (0-rung: the container speaks)');
ok(/^2020[1-9]{6}$/.test(momentToAddress(new Date('2020-02-29T12:00:00Z'))),
  '…but a full-precision moment in 2020 is unambiguous (analogue rungs never emit 0)',
  momentToAddress(new Date('2020-02-29T12:00:00Z')));

section('FULL WIDTH IS THE CANONICAL FORM (the earth lesson)');
ok((() => { try { addressToSpan('2026'); return false; } catch { return true; } })(),
  'a short dotless form is refused — it would left-pad into the root underscore chain');

section('THE ANALOGUE RUNGS NEVER EMIT ZERO (sundial:1.1) — the two ends of a year');
eq('midnight, New Year: season 1, month 1, band 1, day 1, gathering 1, beat 1',
  momentToAddress(new Date('2026-01-01T00:00:00Z')), '2026111111');
eq('the last second of the year: season 4, month 3, band 5, day 3, gathering 9, beat 9',
  momentToAddress(new Date('2026-12-31T23:59:59Z')), '2026435399');
ok((() => { try { momentToAddress(new Date('0999-12-31T00:00:00Z')); return false; } catch (e) { return e instanceof RangeError; } })(),
  'a year outside 1000..9999 is outside the floor-10 form — RangeError, never a padded lie');

// ── The stamp — renderNow's shape, and the header line ──

section('THE STAMP');
const stamp = renderNow(t);
eq('the stamp carries ISO, address, and voicing (the TS stamp case, as parts)', stamp,
  { iso: '2026-07-15T18:30:00Z', address: '2026313179', voicing: 'Wednesday 15 July 2026, late afternoon (beat 9)' });
eq('shape: exactly {iso, address, voicing}, in that order', Object.keys(stamp), ['iso', 'address', 'voicing']);
eq('shape: the ISO is whole seconds — milliseconds never ride the stamp',
  renderNow(new Date('2026-07-15T18:30:00.789Z')).iso, '2026-07-15T18:30:00Z');
const live = renderNow();
ok(Math.abs(Date.parse(live.iso) - Date.now()) < 2000
  && live.address === momentToAddress(new Date(live.iso))
  && live.voicing === voiceAddress(live.address),
  'shape: no argument reads the clock — and the three parts agree with one another', JSON.stringify(live));
eq('the header line is the same stamp, pipe-joined', nowHeader(t),
  '2026-07-15T18:30:00Z | 2026313179 | Wednesday 15 July 2026, late afternoon (beat 9)');
ok(/^[\x20-\x7e]+$/.test(nowHeader(t)),
  'the header line is printable ASCII throughout (a header value has no encoding — a middle dot arrives as "Â·")');
console.log(`  ${NOW_HEADER}: ${nowHeader()}`);

// ── The wire — the REAL handler over a temp-dir FileRedis ──

section('THE WIRE — every response served carries the clock');
const dir = await fs.mkdtemp(join(tmpdir(), 'pscale-temporal-'));
const ORIGIN = 'smoke.invalid';
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';
process.env.BEACH_ORIGIN = ORIGIN;

const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
const { FileRedis } = await import('./file-redis.mjs');
__setRedis(new FileRedis(dir));

async function call(method, body, query = {}) {
  let status = 200, out = null;
  const headers = {};
  const req = { method, query, body: body ?? {}, headers: { host: ORIGIN }, url: '/.well-known/pscale-beach' };
  const res = {
    setHeader(k, v) { headers[String(k).toLowerCase()] = v; },
    status(c) { status = c; return this; },
    json(o) { out = o; },
    end() {},
  };
  await handler(req, res);
  return { status, body: out, headers };
}
const HDR = NOW_HEADER.toLowerCase();
const LINE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) \| (\d{10}) \| (.+)$/;
const carries = (r) => LINE.test(r.headers[HDR] || '');

// The derived index — an envelope, so it carries `now` as a field too.
let r = await call('GET');
ok(r.status === 200 && Array.isArray(r.body.blocks), 'index: served', JSON.stringify(r.body));
ok(r.body.now && typeof r.body.now === 'object', 'index: carries `now`', JSON.stringify(r.body));
eq('index: now is {iso, address, voicing}', Object.keys(r.body.now || {}), ['iso', 'address', 'voicing']);
ok(carries(r), 'index: X-Pscale-Now rides the response', r.headers[HDR]);
const m = (r.headers[HDR] || '').match(LINE) || [];
ok(m[1] === r.body.now.iso && m[2] === r.body.now.address && m[3] === r.body.now.voicing,
  'index: header and `now` are one instant, one stamp', `${r.headers[HDR]} vs ${JSON.stringify(r.body.now)}`);
ok(/^\d{4}[1-9]{6}$/.test(r.body.now.address), 'index: the address is full-width and zero-free below the year', r.body.now.address);
ok(/^[\x20-\x7e]+$/.test(r.headers[HDR] || ''), 'index: the header value is ASCII');
ok(String(r.headers['access-control-expose-headers'] || '').split(/\s*,\s*/).includes(NOW_HEADER),
  'index: the header is exposed, so a browser fetch can read it', r.headers['access-control-expose-headers']);
ok(typeof r.body._ === 'string' && /\bnow\b/.test(r.body._) && /X-Pscale-Now/.test(r.body._),
  'index: the underscore names the field and the header', r.body._);

// A block — the payload is the block itself; the clock rides the header only.
r = await call('POST', { block: 'sundial-smoke', content: { _: 'a block at smoke.invalid', '1': 'one' } });
ok(r.status === 200, 'setup: a block written', JSON.stringify(r.body));
ok(carries(r), 'write ack: X-Pscale-Now rides a POST too — one boundary, every door', r.headers[HDR]);
r = await call('GET', undefined, { block: 'sundial-smoke' });
ok(r.status === 200 && carries(r), 'block read: X-Pscale-Now rides it', r.headers[HDR]);
eq('block read: the payload is the block itself — keys `_` and digits only, no `now` inside',
  Object.keys(r.body).sort(), ['1', '_']);
r = await call('GET', undefined, { block: 'sundial-smoke', spindle: '1' });
ok(r.status === 200 && r.body === 'one' && carries(r), 'point read: a string leaf, and the header still rides', JSON.stringify(r.body));
r = await call('GET', undefined, { block: 'sundial-smoke', pscale: '0' });
ok(r.status === 200 && carries(r), 'shaped read (?pscale=): the header rides', r.headers[HDR]);
ok(r.body == null || r.body.now === undefined, 'shaped read: the canonical result gains no `now` key — the header is the carrier under ?block=');
r = await call('GET', undefined, { block: 'no-such-block' });
ok(r.status === 404 && carries(r), 'a refusal is served, so it carries the clock too (404)', r.headers[HDR]);
r = await call('OPTIONS');
ok(r.status === 204 && r.headers[HDR] === undefined, 'preflight carries no clock — nothing is served');

await fs.rm(dir, { recursive: true, force: true });
console.log(`\nsmoke:temporal — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
