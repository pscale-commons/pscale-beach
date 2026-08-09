#!/usr/bin/env node
//
// smoke-grain-integrity.js — a formed grain cannot be replaced whole.
//
// THE HOLE THIS PINS SHUT (found live 2026-08-09). A reach locks the sides and
// only the sides — hashes['1'], hashes['2'], never hashes['_']. A whole-block
// write carries no spindle, so it resolves to the '_' lock, finds none, and
// proceeds. The side locks were not broken but BYPASSED: the write never
// addressed a side. Any stranger could POST {block, content, confirm:true} with
// no secret at all and replace both reaches, both sides, and the position-9
// record of who holds which — and grain ids are published in the surface index,
// so there was nothing to guess.
//
// confirm:true was never protection. It is a field the caller writes in their
// own body — a seatbelt against a buggy client, with nobody to confirm to.
//
// Runs the REAL handler in-process against a temp-dir FileRedis. No server, no
// network, zero residue.
//
// Run: npm run smoke:grain-integrity

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0, fail = 0;
const ok = (c, m, detail = '') => { if (c) pass++; else { fail++; console.error('  ✗', m, detail); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const dir = await fs.mkdtemp(join(tmpdir(), 'pscale-grain-integrity-'));
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
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(o) { out = o; }, end() {} };
  await handler(req, res);
  return { status, body: out };
}
const post = (b) => call('POST', b);
const read = (block) => call('GET', undefined, { block });

async function main() {
  // A formed grain, through the real reach/accept state machine.
  await post({ block: 'grain:feed', action: 'reach', side: '1', agent_id: 'julie', partner_agent_id: 'david', description: 'integrity grain', my_side_content: 'reach from side one', my_passphrase: 'key-one' });
  await post({ block: 'grain:feed', action: 'reach', side: '2', agent_id: 'david', my_side_content: 'reach from side two', my_passphrase: 'key-two' });
  const before = (await read('grain:feed')).body;
  ok(before['1']._ === 'reach from side one' && before['2']._ === 'reach from side two', 'setup: grain formed, both reaches stand');

  // ── The attack, exactly as it worked ──
  let r = await post({ block: 'grain:feed', content: { _: 'owned' }, confirm: true });
  ok(r.status === 405 && r.body.code === 'whole_block_replace_unsupported',
    'keyless whole-block replace REFUSED (this is the hole)', JSON.stringify(r.body));
  ok(eq((await read('grain:feed')).body, before), '…and the grain is byte-unchanged');

  // A side key does not buy the whole block either — one secret cannot stand
  // for two sides, so no key makes this legitimate.
  r = await post({ block: 'grain:feed', content: { _: 'owned' }, confirm: true, secret: 'key-two' });
  ok(r.status === 405 && r.body.code === 'whole_block_replace_unsupported', 'a side key does not authorise a whole-block replace', JSON.stringify(r.body));
  r = await post({ block: 'grain:feed', content: { _: 'owned' }, secret: 'key-two' });
  ok(r.status === 405, 'refused with or without confirm — confirm was never the gate', JSON.stringify(r.body));
  ok(eq((await read('grain:feed')).body, before), 'grain still byte-unchanged after all three attempts');

  // ── Everything legitimate still works ──
  r = await post({ block: 'grain:feed', spindle: '2', content: { _: 'reach from side two', '1': 'a message' }, secret: 'key-two' });
  ok(r.status === 200, 'a side write under its own key still lands', JSON.stringify(r.body));
  r = await post({ block: 'grain:feed', spindle: '2', content: { _: 'reach from side two' }, secret: 'key-two' });
  ok(r.status === 200 && (await read('grain:feed')).body['2']['1'] === undefined,
    'CLEARING A SIDE still works — {_: the reach} at its own spindle', JSON.stringify(r.body));
  r = await post({ block: 'grain:feed', spindle: '1', content: { _: 'x' }, secret: 'key-two' });
  ok(r.status === 403, 'cross-side write still refused by the side lock', JSON.stringify(r.body));
  r = await post({ block: 'grain:feed', append: true, spindle: '2', content: 'appended', secret: 'key-two' });
  ok(r.status === 200 && r.body.address === '2.1', 'append at a side still works', JSON.stringify(r.body));

  // Creating a grain is untouched — the gate only fires on an EXISTING block.
  r = await post({ block: 'grain:fresh', action: 'reach', side: '1', agent_id: 'a', partner_agent_id: 'b', description: 'new', my_side_content: 'one', my_passphrase: 'p1' });
  ok(r.status === 200, 'a new grain can still be reached into existence', JSON.stringify(r.body));

  // ── Scoped to grain: only — no collateral ──
  await post({ block: 'note:ordinary', content: { _: 'first' }, new_lock: 'ord-key' });
  r = await post({ block: 'note:ordinary', content: { _: 'replaced' }, confirm: true, secret: 'ord-key' });
  ok(r.status === 200 && (await read('note:ordinary')).body._ === 'replaced',
    'an ORDINARY block is still replaceable whole under its own `_` lock', JSON.stringify(r.body));
  r = await post({ block: 'note:ordinary', content: { _: 'nope' }, confirm: true });
  ok(r.status === 403, '…and still protected by that lock against a keyless replace', JSON.stringify(r.body));

  // sed: keeps its admin capability — a sed: root DOES carry a '_' lock from
  // founding, so there the lock genuinely protects and refusing would remove
  // something real.
  await post({ block: 'sed:crew', content: { _: 'the conventions' }, new_lock: 'admin-key' });
  r = await post({ block: 'sed:crew', content: { _: 'revised conventions' }, confirm: true, secret: 'admin-key' });
  ok(r.status === 200 && (await read('sed:crew')).body._ === 'revised conventions',
    'a sed: collective is still admin-replaceable whole — untouched by this fix', JSON.stringify(r.body));
  r = await post({ block: 'sed:crew', content: { _: 'hijack' }, confirm: true });
  ok(r.status === 403, '…and its `_` lock still refuses a keyless replace', JSON.stringify(r.body));

  console.log(`\nsmoke:grain-integrity — ${pass} passed, ${fail} failed`);
  await fs.rm(dir, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await fs.rm(dir, { recursive: true, force: true }); process.exit(1); });
