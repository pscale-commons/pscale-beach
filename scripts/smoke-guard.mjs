#!/usr/bin/env node
// smoke-guard.mjs — the guard in the handler (who-answers 1.1112; bsp-mcp #564 §4.4 item 2), end to
// end against four freshly-spawned local beaches: three behind the members' gate, whose `notice`
// blocks say people_keeping=<prefixes>, people_keeping=* and nothing heard (not latched), and one
// open beach.
//
//   node scripts/smoke-guard.mjs
//
// Proves: behind the gate, a plain write into a people-keeping place carrying a phone number, an
// email address, a National Insurance number or an NHS number is refused with the kind named and
// the value never echoed, by any door (a position write, a whole-block write, an append); a
// pscale address, a sundial address, an ISO instant, an unspaced ten-digit run and a number that
// fails the NHS check pass; a gray envelope passes and the request's own gray flag is no seal; a
// block outside the line passes; `*` is every block; a notice not behind its root latch is not
// heard; and an open beach is byte-for-byte unchanged.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const beachScript = fileURLToPath(new URL('./local-beach.mjs', import.meta.url));
const GATE_SECRET = 'test-gate-secret';
const W = '/.well-known/pscale-beach';

function client(port, base) {
  return (method, path, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, method, path, headers: { Host: base, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (resp) => {
      let b = '';
      resp.on('data', (c) => (b += c));
      resp.on('end', () => { let j = null; try { j = b ? JSON.parse(b) : null; } catch { j = { raw: b }; } resolve({ status: resp.statusCode, body: j }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
let fails = 0;
const ok = (c, m, detail) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (!c && detail !== undefined ? '  ← ' + JSON.stringify(detail).slice(0, 220) : '')); if (!c) fails++; };
async function ready(req) {
  for (let i = 0; i < 80; i++) {
    try { const r = await req('GET', W); if (r.status < 500) return true; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
function spawnBeach(dir, port, base, env) {
  return spawn('node', [beachScript, '--dir', dir, '--port', String(port), '--origin', base], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...env } });
}
const gatedEnv = { BEACH_GATE: 'members', BEACH_GATE_SECRET: GATE_SECRET, BEACH_KEEPERS: 'keeper' };
const PHONE = '07700 900123';

/** A gated beach with its keeper, a notice (latched or not), settings latched, and the keeper's pass. */
async function stand(req, notice, latchNotice) {
  await req('POST', `${W}?block=passport:keeper`, { spindle: '', content: { _: 'KEEPER' }, new_lock: 'K1' });
  await req('POST', `${W}?block=notice`, latchNotice ? { content: notice, new_lock: 'OP' } : { content: notice });
  await req('POST', `${W}?block=settings`, { spindle: '', content: { _: 'the beach settings' }, new_lock: 'OP' });
  const r = await req('POST', `${W}?block=passport:keeper`, { secret: 'K1' });
  return bearer(r.body.pass);
}

const dirs = await Promise.all(['pk', 'all', 'mute', 'open'].map((n) => fs.mkdtemp(join(os.tmpdir(), `guard-${n}-`))));
const procs = [
  spawnBeach(dirs[0], 8841, 'pk.test', gatedEnv),
  spawnBeach(dirs[1], 8842, 'all.test', gatedEnv),
  spawnBeach(dirs[2], 8843, 'mute.test', gatedEnv),
  spawnBeach(dirs[3], 8844, 'open.test', { BEACH_GATE: '', BEACH_GATE_SECRET: '', BEACH_KEEPERS: '' }),
];
const [pk, all, mute, open] = [client(8841, 'pk.test'), client(8842, 'all.test'), client(8843, 'mute.test'), client(8844, 'open.test')];
try {
  for (const c of [pk, all, mute, open]) if (!await ready(c)) { console.error('a local beach did not start'); process.exit(2); }

  console.log('\n— a beach whose notice names its people-keeping places —');
  const NOTICE = { _: 'NOTICE — this is a members\' beach.', 1: 'people_keeping=passport:,now:,pool:,arrivals  the places where a person\'s own words are kept: no contact details or ID numbers in plain words there.' };
  const k = await stand(pk, NOTICE, true);
  let r = await pk('POST', `${W}?block=now:keeper`, { spindle: '1', content: `ring me on ${PHONE}` }, k);
  ok(r.status === 422 && r.body.code === 'people_keeping' && r.body.found === 'a phone number', 'a phone number in a position write is refused, and the kind named', r.body);
  ok(!JSON.stringify(r.body).includes('900123'), 'the value is never echoed back');
  ok(/seal it, or leave it out/.test(r.body.error) && /\?block=notice/.test(r.body.error), 'the refusal says what to do and where the rule stands');
  ok((await pk('GET', `${W}?block=now:keeper`, null, k)).status === 401 || (await pk('GET', `${W}?block=now:keeper`, null, k)).status === 404, 'nothing was written');
  for (const [text, kind] of [
    [`+44 (0) 7700 900123`, 'a phone number'],
    [`write to someone@example.org`, 'an email address'],
    [`my NI is AB 12 34 56 C`, 'a National Insurance number'],
    [`number 943 476 5919 on the card`, 'an NHS number'],
    [`NHS number 9434765919`, 'an NHS number'],
  ]) {
    r = await pk('POST', `${W}?block=now:keeper`, { spindle: '1', content: text }, k);
    ok(r.status === 422 && r.body.found === kind, `${kind} is refused`, r.body);
  }
  for (const text of ['spine:pocket-beach 1.1111787199 at 2026421346, 2026-11-03T09:39:07Z', 'ten digits unspaced 9434765919 are an address as often as not', 'number 943 476 5918 fails the check digit', 'a £10,000,000,000 question in 0s']) {
    r = await pk('POST', `${W}?block=now:keeper`, { spindle: '1', content: text }, k);
    ok(r.status === 200, `passes: ${text.slice(0, 40)}…`, r.body);
  }
  r = await pk('POST', `${W}?block=now:keeper`, { content: { _: 'MIRROR', 2: { _: 'deep', 1: `call ${PHONE}` } }, confirm: true }, k);
  ok(r.status === 422 && r.body.found === 'a phone number', 'a whole-block write is screened to its leaves', r.body);
  ok((await pk('POST', `${W}?block=pool:room`, { content: { _: 'THE ROOM' } }, k)).status === 200, 'the room is founded');
  r = await pk('POST', `${W}?block=pool:room`, { append: true, content: { _: `call ${PHONE}` } }, k);
  ok(r.status === 422 && r.body.found === 'a phone number', 'an append is screened', r.body);
  ok((await pk('POST', `${W}?block=pool:room`, { append: true, content: { _: 'a clean word' } }, k)).status === 200, 'a clean append lands');
  r = await pk('POST', `${W}?block=arrivals`, { content: { _: 'ARRIVALS', 1: `${PHONE}` } }, k);
  ok(r.status === 422, 'a bare name on the line (arrivals, without its colon) is a people-keeping place', r.body);
  ok((await pk('POST', `${W}?block=spine:constitution`, { content: { _: `THE LAW — the hall is on ${PHONE}` } }, k)).status === 200, 'a block the line does not name passes (the hall\'s number stands in the law)');
  r = await pk('POST', `${W}?block=now:keeper`, { spindle: '2', content: { 1: `${PHONE} as ciphertext would never look`, 2: 'nonce', 9: { _: 'gray', 1: 'self' } } }, k);
  ok(r.status === 200, 'a gray envelope passes: ciphertext carries no words', r.body);
  r = await pk('POST', `${W}?block=now:keeper`, { spindle: '3', content: `ring ${PHONE}`, gray: true }, k);
  ok(r.status === 422, 'the request\'s own gray flag is a claim, not a seal', r.body);
  ok((await pk('POST', `${W}?block=now:keeper`, { new_lock: 'K1' }, k)).status === 200, 'a latch-only write carries no words and is not screened');
  r = await pk('POST', `${W}?block=now:keeper`, { spindle: '4', content: `ring ${PHONE}` });
  ok(r.status === 401, 'a stranger meets the gate before the guard', r.body);

  console.log('\n— a beach whose notice says every block —');
  const ka = await stand(all, { _: 'NOTICE', 1: 'people_keeping=*' }, true);
  r = await all('POST', `${W}?block=spine:anything`, { content: { _: `the hall is on ${PHONE}` } }, ka);
  ok(r.status === 422, '* makes every block a people-keeping place', r.body);
  ok((await all('POST', `${W}?block=spine:anything`, { content: { _: 'the hall is by the river' } }, ka)).status === 200, 'clean words land');

  console.log('\n— a notice not behind its root latch is not heard —');
  const km = await stand(mute, { _: 'NOTICE', 1: 'people_keeping=*' }, false);
  ok((await mute('POST', `${W}?block=now:keeper`, { spindle: '1', content: `ring ${PHONE}` }, km)).status === 200, 'the line is ignored, as an unlatched settings line is');

  console.log('\n— an open beach is unchanged —');
  await open('POST', `${W}?block=notice`, { content: { _: 'NOTICE', 1: 'people_keeping=*' }, new_lock: 'OP' });
  await open('POST', `${W}?block=settings`, { spindle: '', content: { _: 'the beach settings' }, new_lock: 'OP' });
  ok((await open('POST', `${W}?block=now:anyone`, { spindle: '1', content: `ring ${PHONE}` })).status === 200, 'no gate, no guard: the write lands as ever');

  console.log(fails ? `\n${fails} FAILED` : '\nthe guard: all pass ✓');
} finally {
  for (const p of procs) p.kill();
  for (const d of dirs) await fs.rm(d, { recursive: true, force: true }).catch(() => {});
}
process.exit(fails ? 1 : 0);
