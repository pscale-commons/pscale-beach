#!/usr/bin/env node
//
// smoke-append-spindle.js — append AT A SPINDLE: the accumulator law,
// node-scoped (ways:grain 5). Runs the REAL handler in-process against a
// temp-dir FileRedis — no server, no network, zero residue.
//
// The battery:
//   (a) grain side append allocates 2.1 then 2.2 (side-holder's key)
//   (b) a cross-side key is refused — the general lock resolution, no
//       grain-specific code
//   (c) the tenth entry supernests the SIDE only: the node wraps {_: old
//       side}, the reach text rides one level deeper untouched, root keys
//       byte-unchanged, no spill to root position 3, ladder continues at 2.12
//   (d) append under a missing node and under a string leaf both refuse
//       cleanly (404 / 409) — never an auto-wrap of someone's prose
//   (e) root append (no spindle) byte-unchanged — same slots, same ack shape
//   (f) concurrent appends beneath one side land distinct slots (the
//       per-accumulator mutex covers the node path)
// plus: ordinary-block root-lock inheritance governs node appends; delegated
// digit lock wins; star / resolve_window / multi-dot refusals; pure-function
// unit checks on appendAtNode.
//
// Run: npm run smoke:append-spindle

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendAtNode, floorDepth, rawWalk } from '../api/floor.js';

let pass = 0, fail = 0;
const ok = (c, m, detail = '') => { if (c) pass++; else { fail++; console.error('  ✗', m, detail); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Pure-function unit checks (appendAtNode) ──

{
  // The side ladder: 1..9 beneath the node, then the NODE wraps.
  const block = { _: 'grain', '2': { _: 'reach' } };
  for (let i = 1; i <= 9; i++) {
    const r = appendAtNode(block, ['2'], `m${i}`);
    ok(r.slot === String(i) && !r.supernested, `unit: entry ${i} → slot ${i}, no wrap`);
  }
  const r10 = appendAtNode(block, ['2'], 'm10');
  ok(r10.supernested === true && r10.slot === '11', 'unit: tenth wraps the node → slot 11');
  ok(block['2']._._ === 'reach', 'unit: reach text rides one level deeper untouched');
  ok(rawWalk(block['2']._, '1') === 'm1' && rawWalk(block['2']._, '9') === 'm9', 'unit: m1..m9 absorbed under the node underscore');
  ok(rawWalk(block['2'], '11') === 'm10', 'unit: m10 at node[1][1]');
  ok(block._ === 'grain' && floorDepth(block) === 1, 'unit: block root and floor untouched by the node wrap');
  const r11 = appendAtNode(block, ['2'], 'm11');
  ok(r11.slot === '12' && !r11.supernested, 'unit: ladder continues within — 12');
  // Refusals.
  ok(appendAtNode(block, ['5'], 'x').missing === true, 'unit: missing node → missing');
  ok(appendAtNode(block, ['2', '1', '1'], 'x').leaf === true, 'unit: string leaf → leaf');
  ok(appendAtNode(block, [], 'x').missing === true, 'unit: empty walk is the root append’s job');
  // A bare container (no underscore) ladders at depth 1 — no phantom wrap,
  // no seeded identity.
  const bare = { _: 'b', '3': { '1': 'kept' } };
  const rb = appendAtNode(bare, ['3'], 'new');
  ok(rb.slot === '2' && !rb.supernested && bare['3']['1'] === 'kept', 'unit: bare container node → next slot 2, nothing invented');
}

// ── In-process rig — the REAL handler over a temp-dir FileRedis ──

const dir = await fs.mkdtemp(join(tmpdir(), 'pscale-append-spindle-'));
const ORIGIN = 'smoke.invalid';
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';
process.env.BEACH_ORIGIN = ORIGIN;

const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
const { FileRedis } = await import('./file-redis.mjs');
__setRedis(new FileRedis(dir));

async function call(method, body, query = {}) {
  let status = 200, out = null;
  const req = { method, query, body: body ?? {}, headers: { host: ORIGIN }, url: '/.well-known/pscale-beach' };
  const res = {
    setHeader() {},
    status(c) { status = c; return this; },
    json(o) { out = o; },
    end() {},
  };
  await handler(req, res);
  return { status, body: out };
}
const post = (body) => call('POST', body);
const read = (block, spindle) => call('GET', undefined, spindle ? { block, spindle } : { block });

async function main() {
  // ── Grain setup — the REAL reach/accept state machine, per-side locks ──
  let r = await post({ block: 'grain:cafe', action: 'reach', side: '1', agent_id: 'julie', partner_agent_id: 'david', description: 'smoke grain', my_side_content: 'reach from side one', my_passphrase: 'key-one' });
  ok(r.status === 200 && r.body.state === 'established', 'setup: grain established', JSON.stringify(r.body));
  r = await post({ block: 'grain:cafe', action: 'reach', side: '2', agent_id: 'david', my_side_content: 'reach from side two', my_passphrase: 'key-two' });
  ok(r.status === 200 && r.body.state === 'completed', 'setup: grain completed', JSON.stringify(r.body));
  const rootBefore = (await read('grain:cafe')).body;

  // (a) side append allocates 2.1 then 2.2
  r = await post({ block: 'grain:cafe', append: true, spindle: '2', content: 'first message', secret: 'key-two' });
  ok(r.status === 200 && r.body.slot === '1' && r.body.address === '2.1' && r.body.node === '2' && r.body.supernested === false,
    '(a) first side append → slot 1, address 2.1', JSON.stringify(r.body));
  r = await post({ block: 'grain:cafe', append: true, spindle: '2', content: 'second message', secret: 'key-two' });
  ok(r.status === 200 && r.body.address === '2.2', '(a) second side append → address 2.2', JSON.stringify(r.body));
  r = await read('grain:cafe', '2.1');
  ok(r.status === 200 && r.body === 'first message', '(a) message readable at 2.1', JSON.stringify(r.body));

  // (b) cross-side key refused — side 1's key cannot append beneath side 2
  r = await post({ block: 'grain:cafe', append: true, spindle: '2', content: 'intrusion', secret: 'key-one' });
  ok(r.status === 403 && r.body.code === 'lock_required', '(b) cross-side key refused', JSON.stringify(r.body));
  r = await post({ block: 'grain:cafe', append: true, spindle: '2', content: 'keyless' });
  ok(r.status === 403 && r.body.code === 'lock_required', '(b) keyless side append refused', JSON.stringify(r.body));

  // (c) the tenth supernests the SIDE only
  for (let i = 3; i <= 9; i++) {
    r = await post({ block: 'grain:cafe', append: true, spindle: '2', content: `message ${i}`, secret: 'key-two' });
    ok(r.status === 200 && r.body.slot === String(i) && r.body.supernested === false, `(c) fill: slot ${i}`, JSON.stringify(r.body));
  }
  r = await post({ block: 'grain:cafe', append: true, spindle: '2', content: 'tenth message', secret: 'key-two' });
  ok(r.status === 200 && r.body.supernested === true && r.body.slot === '11' && r.body.address === '2.11',
    '(c) tenth supernests the side → address 2.11', JSON.stringify(r.body));
  const after = (await read('grain:cafe')).body;
  ok(after['3'] === undefined, '(c) NO spill to root position 3');
  ok(eq(after['1'], rootBefore['1']) && eq(after['9'], rootBefore['9']) && after._ === rootBefore._,
    '(c) root keys byte-unchanged (side 1, position 9, root underscore)');
  ok(after['2']._._ === 'reach from side two', '(c) reach text at the wrapped underscore, untouched');
  ok(after['2']._['1'] === 'first message' && after['2']._['9'] === 'message 9', '(c) messages 1..9 absorbed under the side underscore');
  ok(after['2']['1']['1'] === 'tenth message', '(c) tenth at side[1][1] (address 2.11)');
  r = await post({ block: 'grain:cafe', append: true, spindle: '2', content: 'eleventh message', secret: 'key-two' });
  ok(r.status === 200 && r.body.address === '2.12' && r.body.supernested === false, '(c) ladder continues within — 2.12', JSON.stringify(r.body));

  // (d) missing node / string leaf / missing block refuse cleanly
  r = await post({ block: 'grain:cafe', append: true, spindle: '5', content: 'x', secret: 'key-two' });
  ok(r.status === 404 && r.body.code === 'not_found', '(d) append under a missing node → 404', JSON.stringify(r.body));
  r = await post({ block: 'grain:cafe', append: true, spindle: '2.12', content: 'x', secret: 'key-two' });
  ok(r.status === 409 && r.body.code === 'append_at_leaf', '(d) append under a string leaf → 409, prose never auto-wrapped', JSON.stringify(r.body));
  r = await post({ block: 'no-such-block', append: true, spindle: '1', content: 'x' });
  ok(r.status === 404 && r.body.code === 'not_found', '(d) append at a spindle never creates the block', JSON.stringify(r.body));

  // shape of the act: star, resolve_window, multi-dot all refuse
  r = await post({ block: 'grain:cafe', append: true, spindle: '2*', content: 'x', secret: 'key-two' });
  ok(r.status === 400 && r.body.code === 'invalid_address', 'star spindle refused', JSON.stringify(r.body));
  r = await post({ block: 'grain:cafe', append: true, spindle: '2', content: 'x', secret: 'key-two', resolve_window: '2026-08-03T00:00:00Z' });
  ok(r.status === 400 && r.body.code === 'invalid_shape', 'resolve_window does not compose with spindle', JSON.stringify(r.body));
  r = await post({ block: 'grain:cafe', append: true, spindle: '1.2.3', content: 'x', secret: 'key-two' });
  ok(r.status === 400 && r.body.code === 'invalid_address', 'multi-dot spindle refused', JSON.stringify(r.body));

  // (e) root append (no spindle) byte-unchanged — same slots, same ack shape
  r = await post({ block: 'marks-smoke', append: true, content: { _: 'first mark', '1': 'someone' } });
  ok(r.status === 200 && r.body.slot === '1' && r.body.floor === 1 && r.body.address === undefined && r.body.node === undefined,
    '(e) root append → slot 1, ack shape unchanged (no address field)', JSON.stringify(r.body));
  r = await post({ block: 'marks-smoke', append: true, content: { _: 'second mark', '1': 'someone' } });
  ok(r.status === 200 && r.body.slot === '2', '(e) root append → slot 2', JSON.stringify(r.body));

  // recency law rides along: an undated OBJECT entry gets position 3 stamped
  r = await post({ block: 'grain:cafe', append: true, spindle: '1', content: { _: 'structured entry', '1': 'julie' }, secret: 'key-one' });
  ok(r.status === 200 && r.body.address === '1.1', 'side 1 appends beneath side 1 with its own key', JSON.stringify(r.body));
  r = await read('grain:cafe', '1.1');
  ok(r.status === 200 && typeof r.body['3'] === 'string' && !Number.isNaN(Date.parse(r.body['3'])),
    'undated object entry stamped at position 3', JSON.stringify(r.body));

  // ordinary blocks: the root lock GOVERNS a node append (inheritance), and a
  // delegated digit lock wins — the same resolution as ordinary writes.
  r = await post({ block: 'note:inh', content: { _: 'inheritance scratch', '1': { _: 'branch one' }, '2': { _: 'branch two' } }, new_lock: 'rootkey' });
  ok(r.status === 200, 'setup: ordinary block created locked at root', JSON.stringify(r.body));
  r = await post({ block: 'note:inh', append: true, spindle: '1', content: 'hijack' });
  ok(r.status === 403 && r.body.code === 'lock_required', 'ordinary: keyless node append refused — the root binds it', JSON.stringify(r.body));
  r = await post({ block: 'note:inh', append: true, spindle: '1', content: 'authored', secret: 'rootkey' });
  ok(r.status === 200 && r.body.address === '1.1', 'ordinary: root secret appends beneath the node', JSON.stringify(r.body));
  r = await post({ block: 'note:inh', spindle: '2', new_lock: 'delegkey', secret: 'rootkey' });
  ok(r.status === 200, 'setup: position 2 delegated to another holder', JSON.stringify(r.body));
  r = await post({ block: 'note:inh', append: true, spindle: '2', content: 'not yours', secret: 'rootkey' });
  ok(r.status === 403, 'ordinary: a delegated position is NOT appendable by the root secret — its own lock wins');
  r = await post({ block: 'note:inh', append: true, spindle: '2', content: 'theirs', secret: 'delegkey' });
  ok(r.status === 200 && r.body.address === '2.1', "ordinary: the delegate's secret appends", JSON.stringify(r.body));

  // (f) concurrent appends beneath one side land distinct slots
  r = await post({ block: 'grain:beef', action: 'reach', side: '1', agent_id: 'a', partner_agent_id: 'b', description: 'concurrency grain', my_side_content: 'side one reach', my_passphrase: 'p-one' });
  ok(r.status === 200, 'setup: concurrency grain established');
  r = await post({ block: 'grain:beef', action: 'reach', side: '2', agent_id: 'b', my_side_content: 'side two reach', my_passphrase: 'p-two' });
  ok(r.status === 200, 'setup: concurrency grain completed');
  const six = await Promise.all([1, 2, 3, 4, 5, 6].map((n) =>
    post({ block: 'grain:beef', append: true, spindle: '2', content: `parallel ${n}`, secret: 'p-two' })));
  ok(six.every((x) => x.status === 200), '(f) all six concurrent side appends land', JSON.stringify(six.map((x) => x.status)));
  const addrs = six.map((x) => x.body.address);
  ok(new Set(addrs).size === 6, '(f) six DISTINCT addresses — no slot raced', JSON.stringify(addrs));
  const beef = (await read('grain:beef')).body;
  const landed = [1, 2, 3, 4, 5, 6].map((n) => beef['2'][String(n)]).filter((v) => typeof v === 'string' && v.startsWith('parallel'));
  ok(landed.length === 6, '(f) all six entries present in the stored side — none erased', JSON.stringify(beef['2']));

  console.log(`\nsmoke:append-spindle — ${pass} passed, ${fail} failed`);
  await fs.rm(dir, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await fs.rm(dir, { recursive: true, force: true }); process.exit(1); });
