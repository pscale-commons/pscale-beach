#!/usr/bin/env node
//
// smoke-locks.js — live HTTP battery for the five lock rules, R5 included.
//
//   R1  absent  + new_lock            → create locked (no secret)
//   R2  open    + new_lock            → set lock (no secret; homestead)
//   R3  locked  + secret              → content write proves authority
//   R4  locked  + secret + new_lock   → rotate current → new
//   R5  locked  + secret + new_lock null|'' → RELINQUISH — delete the hash
//       entry; the position returns to its pre-lock state (open, no
//       tombstone). Ordinary blocks only; sed:/grain: refuse with 405.
//
// Runs against ANY beach origin — the local file rig, a Vercel preview, or
// production. Uses only its own scratch blocks (r5:smoke, r5:absent) and
// deletes them at the end; the sed:/grain: refusal cases fire before any
// write, so they leave zero residue.
//
//   BEACH_URL=http://localhost:8787 node scripts/smoke-locks.js
//   (default BEACH_URL: http://localhost:8787 — the local-beach rig)
//
// Run: npm run smoke:locks

const BEACH = (process.env.BEACH_URL || 'http://localhost:8787').replace(/\/+$/, '');
const EP = `${BEACH}/.well-known/pscale-beach`;
const BLOCK = 'r5:smoke';

let pass = 0, fail = 0;
const ok = (c, m, detail = '') => { if (c) pass++; else { fail++; console.error('  ✗', m, detail); } };

// Optional Cookie header — lets the battery run against a protection-gated
// Vercel PREVIEW: harvest the _vercel_jwt via the share link, pass it as
// BEACH_COOKIE='_vercel_jwt=...'. Unset for the rig and production.
const COOKIE = process.env.BEACH_COOKIE || '';

async function call(method, body, qs = '') {
  const r = await fetch(`${EP}${qs}`, {
    method,
    headers: { 'content-type': 'application/json', Accept: 'application/json', ...(COOKIE ? { Cookie: COOKIE } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j = {};
  try { j = JSON.parse(await r.text()); } catch { /* non-JSON */ }
  return { status: r.status, body: j };
}
const post = (body) => call('POST', body);
const del = (block, secret) => call('DELETE', secret ? { block, confirm: true, secret } : { block, confirm: true });
const read = (block, spindle) => call('GET', undefined, `?block=${encodeURIComponent(block)}${spindle ? `&spindle=${spindle}` : ''}`);

async function main() {
  console.log(`smoke-locks against ${BEACH}`);

  // fresh start — tolerate 404/403 from earlier runs (403 means a prior run
  // died before relinquishing '_'; alpha is this battery's own root key)
  await del(BLOCK, 'alpha');
  await del(BLOCK);
  // Homesteading a digit is only meaningful on a block with NO root lock —
  // since lock inheritance (proposal 2026-07-26) a root-locked block's digits
  // are governed by that root. R2-R5 therefore run on an OPEN block; the
  // root-locked block carries R1, independence, and the inheritance battery.
  const OPEN = `${BLOCK}-open`;
  await del(OPEN, 'delta'); await del(OPEN, 'gamma'); await del(OPEN, 'eps'); await del(OPEN);
  await post({ block: OPEN, content: { _: 'open scratch — no root lock' }, confirm: true });

  // R1 — create locked at '_' (whole-block, no secret needed on absent)
  let r = await post({ block: BLOCK, content: { _: 'r5 smoke scratch' }, new_lock: 'alpha', confirm: true });
  ok(r.status === 200, 'R1 create-locked', JSON.stringify(r.body));
  r = await post({ block: BLOCK, content: { _: 'clobber' }, confirm: true });
  ok(r.status === 403 && r.body.code === 'lock_required', 'R1: keyless whole-block replace refused', JSON.stringify(r.body));

  // R2 — homestead an open position ('1'), no secret needed
  r = await post({ block: OPEN, spindle: '1', new_lock: 'beta' });
  ok(r.status === 200, 'R2 set lock on open position', JSON.stringify(r.body));

  // R3 — content write proves authority
  r = await post({ block: OPEN, spindle: '1', content: 'guarded' });
  ok(r.status === 403, 'R3: keyless write to locked position refused');
  r = await post({ block: OPEN, spindle: '1', content: 'guarded', secret: 'wrong' });
  ok(r.status === 403, 'R3: wrong secret refused');
  r = await post({ block: OPEN, spindle: '1', content: 'guarded', secret: 'beta' });
  ok(r.status === 200, 'R3: correct secret writes', JSON.stringify(r.body));

  // R4 — rotate beta → gamma
  r = await post({ block: OPEN, spindle: '1', new_lock: 'gamma', secret: 'beta' });
  ok(r.status === 200, 'R4 rotate', JSON.stringify(r.body));
  r = await post({ block: OPEN, spindle: '1', content: 'x', secret: 'beta' });
  ok(r.status === 403, 'R4: old secret dead after rotate');
  r = await post({ block: OPEN, spindle: '1', content: 'rotated', secret: 'gamma' });
  ok(r.status === 200, 'R4: new secret lives');

  // R5 — authority: relinquish demands the CURRENT secret
  r = await post({ block: OPEN, spindle: '1', new_lock: null, secret: 'beta' });
  ok(r.status === 403, 'R5: relinquish with stale secret refused');
  r = await post({ block: OPEN, spindle: '1', new_lock: '' });
  ok(r.status === 403, 'R5: relinquish with no secret refused on a locked position');

  // R5 — the act itself (null form), and the crux: the position is OPEN after
  r = await post({ block: OPEN, spindle: '1', new_lock: null, secret: 'gamma' });
  ok(r.status === 200, 'R5 relinquish (null)', JSON.stringify(r.body));
  r = await post({ block: OPEN, spindle: '1', content: 'freely written' });
  ok(r.status === 200, 'R5: position open — keyless write lands (pre-lock state restored)', JSON.stringify(r.body));

  // R2 again — anyone may homestead the reopened position; then R5 via ''
  r = await post({ block: OPEN, spindle: '1', new_lock: 'delta' });
  ok(r.status === 200, 'R2 re-homestead after relinquish');
  r = await post({ block: OPEN, spindle: '1', new_lock: '', secret: 'delta' });
  ok(r.status === 200, "R5 relinquish ('' form)", JSON.stringify(r.body));
  r = await post({ block: OPEN, spindle: '1', content: 'open again' });
  ok(r.status === 200, "R5: '' form reopens too");

  // Idempotence — relinquish on an already-open position is a clean no-op
  r = await post({ block: OPEN, spindle: '1', new_lock: '' });
  ok(r.status === 200, 'R5: relinquish on open position is a no-op (no brick, ever)');
  r = await post({ block: OPEN, spindle: '1', new_lock: null });
  ok(r.status === 200, 'R5: idempotent repeat');

  // Position independence — '_' (alpha) untouched by all of the above
  r = await post({ block: BLOCK, content: { _: 'clobber2' }, confirm: true });
  ok(r.status === 403, "independence: '_' of the locked block is untouched by the open block's battery");
  r = await post({ block: BLOCK, new_lock: null, secret: 'alpha' });
  ok(r.status === 200, "R5 relinquish at '_' (root)", JSON.stringify(r.body));
  r = await post({ block: BLOCK, content: { _: 'r5 smoke scratch, reopened' }, confirm: true });
  ok(r.status === 200, "independence: whole-block open after '_' relinquish");

  // ── INHERITANCE — the coarse binds the fine (proposal 2026-07-26) ──
  // A root lock now governs every position that carries no lock of its own.
  // This is the change that collapses ~20 lock writes per authored bubble to
  // one per block, and closes the gap that left every minted bubble's scene
  // text and Author hold writable by any hand.
  const INH = `${BLOCK}-inherit`;
  await del(INH, 'root'); await del(INH, 'deleg'); await del(INH);
  r = await post({ block: INH, content: { _: 'inheritance scratch' }, new_lock: 'root', confirm: true });
  ok(r.status === 200, 'INH setup: create locked at root', JSON.stringify(r.body));

  r = await post({ block: INH, spindle: '1', content: 'hijack' });
  ok(r.status === 403 && r.body.code === 'lock_required',
     'INH: keyless write to an UNLOCKED digit is refused — the root binds it', JSON.stringify(r.body));
  r = await post({ block: INH, spindle: '12', content: 'hijack deeper' });
  ok(r.status === 403, 'INH: inheritance reaches the whole subtree');
  r = await post({ block: INH, spindle: '1', content: 'authored', secret: 'root' });
  ok(r.status === 200, 'INH: the ROOT secret writes any position it governs', JSON.stringify(r.body));

  // A digit may still be delegated to a different holder — its own lock wins.
  r = await post({ block: INH, spindle: '2', new_lock: 'deleg', secret: 'root' });
  ok(r.status === 200, 'INH: root delegates position 2 to another holder', JSON.stringify(r.body));
  r = await post({ block: INH, spindle: '2', content: 'theirs', secret: 'deleg' });
  ok(r.status === 200, "INH: the delegate's secret writes position 2");
  r = await post({ block: INH, spindle: '2', content: 'not yours', secret: 'root' });
  ok(r.status === 403, 'INH: a delegated position is NOT reachable by the root secret — its own lock wins');

  // Opening ONE position under a root lock would need a tombstone, and this
  // substrate stores none. Say so rather than return a hollow success.
  r = await post({ block: INH, spindle: '1', new_lock: null, secret: 'root' });
  ok(r.status === 409 && r.body.code === 'inherited_lock',
     'INH: relinquish of an inherited-only position is refused, with the reason', JSON.stringify(r.body));

  // Relinquishing the ROOT opens the whole block again.
  r = await post({ block: INH, new_lock: null, secret: 'root' });
  ok(r.status === 200, 'INH: relinquish the root', JSON.stringify(r.body));
  r = await post({ block: INH, spindle: '1', content: 'open now' });
  ok(r.status === 200, 'INH: with the root open, an unlocked digit is writable again');
  r = await post({ block: INH, spindle: '2', content: 'still theirs', secret: 'deleg' });
  ok(r.status === 200, "INH: the delegate's own lock survives the root's relinquish");

  // Combo — content + relinquish in one call (write final state and open it)
  r = await post({ block: OPEN, spindle: '2', content: 'combo', new_lock: 'eps' });
  ok(r.status === 200, 'combo setup: write + lock in one call');
  r = await post({ block: OPEN, spindle: '2', content: 'final', secret: 'eps', new_lock: null });
  ok(r.status === 200, 'combo: content + relinquish in one call');
  r = await read(OPEN, '2');
  ok(r.status === 200 && r.body === 'final', 'combo: final content landed', JSON.stringify(r.body));
  r = await post({ block: OPEN, spindle: '2', content: 'anyone' });
  ok(r.status === 200, 'combo: and the position is open');

  // Substrate-prefixed refusal — fires before any write; zero residue
  r = await post({ block: 'sed:r5-smoke-nonexistent', spindle: '1', new_lock: '' });
  ok(r.status === 405 && r.body.code === 'invalid_shape', 'sed: relinquish refused (405)', JSON.stringify(r.body));
  r = await post({ block: 'grain:deadbeefdeadbeef', spindle: '1', new_lock: null });
  ok(r.status === 405 && r.body.code === 'invalid_shape', 'grain: relinquish refused (405)', JSON.stringify(r.body));

  // Absent block — relinquish is a no-op 200, and mints no stray lock entry
  r = await post({ block: 'r5:absent', spindle: '1', new_lock: null });
  ok(r.status === 200, 'absent block: relinquish is a clean no-op', JSON.stringify(r.body));

  // cleanup — root is open now, so confirm-only DELETE suffices
  r = await del(BLOCK);
  ok(r.status === 200, 'cleanup: scratch block wiped', JSON.stringify(r.body));
  await del('r5:absent'); // 404 expected — nothing was ever created

  console.log(`smoke-locks: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
