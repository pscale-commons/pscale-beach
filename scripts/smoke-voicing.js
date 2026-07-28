#!/usr/bin/env node
//
// smoke-voicing.js — live HTTP battery for voicing-at-the-terminus.
//
// A scalar written at an address whose target is an existing container sets
// that container's UNDERSCORE; it does not flatten the container. This is the
// mirror of subnest-on-growth (a string moves down into `_` when a position
// gains children) applied at the last key instead of the intermediate ones,
// and the rule bsp-mcp's applyWrite has always carried at its point-write path.
//
// Two addresses hit it in ordinary use, both on any accumulator that has
// supernested:
//
//   N0  — the zero-slot summary. Trailing-zero canonicalisation (block-
//         conventions:3.4) makes N0 the container's own address, so paying a
//         summary there used to replace the container and its nine entries.
//   0   — the block's identity on a supernested block, where the root `_` is
//         the wrapped past rather than a string. Re-voicing used to replace
//         the entire past with one sentence.
//
// Both returned ok:true. Neither warned.
//
// Runs against ANY beach origin. Uses only its own scratch blocks (voicing:sum,
// voicing:id) and deletes them at the end.
//
//   BEACH_URL=http://localhost:8787 node scripts/smoke-voicing.js
//
// Run: npm run smoke:voicing

const BEACH = (process.env.BEACH_URL || 'http://localhost:8787').replace(/\/+$/, '');
const EP = `${BEACH}/.well-known/pscale-beach`;
const COOKIE = process.env.BEACH_COOKIE || '';

let pass = 0, fail = 0;
const ok = (c, m, detail = '') => { if (c) pass++; else { fail++; console.error('  ✗', m, detail); } };

async function call(method, body, qs = '') {
  const r = await fetch(`${EP}${qs}`, {
    method,
    headers: { 'content-type': 'application/json', Accept: 'application/json', ...(COOKIE ? { Cookie: COOKIE } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed = null;
  try { parsed = await r.json(); } catch { /* empty body */ }
  return { status: r.status, body: parsed };
}
const post = (b) => call('POST', b);
const get = (name, qs = '') => call('GET', undefined, `?block=${encodeURIComponent(name)}${qs}`);
const del = (name) => call('DELETE', { confirm: true }, `?block=${encodeURIComponent(name)}`);

// Append n entries — 10 or more takes the block past the all-nines boundary,
// so it supernests and grows a container at digit 1.
async function fill(block, n) {
  for (let i = 1; i <= n; i++) await post({ block, append: true, content: `e${i}` });
}

async function main() {
  console.log(`smoke-voicing → ${BEACH}`);

  // ── The zero-slot summary ──
  await fill('voicing:sum', 12);
  let r = await get('voicing:sum');
  ok(r.body && typeof r.body['1'] === 'object', 'setup: block supernested, container at digit 1',
    JSON.stringify(r.body));
  const before = Object.keys(r.body['1']).filter(k => k !== '_').sort().join(',');

  r = await post({ block: 'voicing:sum', spindle: '10', content: 'SUMMARY over 01-09' });
  ok(r.status === 200, 'N0: a bare string is accepted', JSON.stringify(r.body));

  r = await get('voicing:sum');
  ok(typeof r.body['1'] === 'object', 'N0: the container SURVIVES (was flattened before the guard)',
    JSON.stringify(r.body['1']));
  ok(r.body['1'] && r.body['1']._ === 'SUMMARY over 01-09', 'N0: the summary lands at the container voicing',
    JSON.stringify(r.body['1']));
  ok(Object.keys(r.body['1']).filter(k => k !== '_').sort().join(',') === before,
    'N0: every entry under the container is untouched', JSON.stringify(r.body['1']));

  r = await post({ block: 'voicing:sum', append: true, content: 'next' });
  ok(r.body && r.body.slot === '14', 'N0: append still allocates correctly afterwards', JSON.stringify(r.body));

  // Replacing a container stays possible — it just has to be explicit.
  r = await post({ block: 'voicing:sum', spindle: '10', content: { _: 'REBUILT', 1: 'only-child' } });
  r = await get('voicing:sum');
  ok(r.body['1'] && r.body['1']._ === 'REBUILT' && r.body['1']['1'] === 'only-child',
    'object payload still replaces the container outright', JSON.stringify(r.body['1']));

  // No regression: a string over a string still replaces.
  await post({ block: 'voicing:sum', spindle: '11', content: 'REPLACED' });
  r = await get('voicing:sum');
  ok(r.body['1']['1'] === 'REPLACED', 'string over a string still replaces', JSON.stringify(r.body['1']));

  // ── The identity on a supernested block ──
  await fill('voicing:id', 11);
  r = await get('voicing:id');
  ok(r.body && typeof r.body._ === 'object', 'setup: root underscore is the wrapped past',
    JSON.stringify(Object.keys(r.body)));

  r = await post({ block: 'voicing:id', spindle: '0', content: 'voicing:id — re-voiced' });
  ok(r.status === 200, 'identity: the re-voice is accepted', JSON.stringify(r.body));

  r = await get('voicing:id');
  ok(typeof r.body._ === 'object', 'identity: the wrapped past SURVIVES (was replaced before the guard)',
    JSON.stringify(r.body._).slice(0, 120));
  ok(r.body._ && Object.keys(r.body._).filter(k => k !== '_').length === 9,
    'identity: all nine wrapped entries are intact', JSON.stringify(Object.keys(r.body._ || {})));
  ok(r.body._ && r.body._._ === 'voicing:id — re-voiced', 'identity: the new sentence is the floor identity',
    JSON.stringify(r.body._ && r.body._._));

  // cleanup
  await del('voicing:sum');
  await del('voicing:id');

  console.log(`smoke-voicing: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
