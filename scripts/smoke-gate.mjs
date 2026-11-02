#!/usr/bin/env node
// smoke-gate.mjs — the members' gate (docs/protocol-pscale-beach-v2.md 2.8 in bsp-mcp), end to
// end against two freshly-spawned local beaches: one with BEACH_GATE=members, one without.
//
//   node scripts/smoke-gate.mjs
//
// Proves: the gate is OFF until the deploy's settings block is root-latched; a stranger sees
// the index as the beyond subset and gets one refusal for everything else, the same whether a
// block exists or not; a member proves their passport once for a pass and reads everything;
// forged and expired passes are nobody; writes need a pass save the proof and a passport
// founded with a member's invite; sed registration and DELETE need a pass; and an ungated
// beach is byte-for-byte unchanged — the proof shape there is an ordinary write.

import http from 'node:http';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const beachScript = fileURLToPath(new URL('./local-beach.mjs', import.meta.url));
const GATE_SECRET = 'test-gate-secret';

function client(port, base) {
  return (method, path, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: '127.0.0.1', port, method, path,
      headers: { Host: base, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers },
    }, (resp) => {
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
const ok = (c, m, detail) => { console.log((c ? '  ok   ' : '  FAIL ') + m + (!c && detail !== undefined ? '  ← ' + JSON.stringify(detail).slice(0, 200) : '')); if (!c) fails++; };

async function ready(req) {
  for (let i = 0; i < 80; i++) {
    try { const r = await req('GET', '/.well-known/pscale-beach'); if (r.status < 500) return true; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
function spawnBeach(dir, port, base, env) {
  return spawn('node', [beachScript, '--dir', dir, '--port', String(port), '--origin', base], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...env } });
}

const W = '/.well-known/pscale-beach';
const dirG = await fs.mkdtemp(join(os.tmpdir(), 'gate-'));
const dirO = await fs.mkdtemp(join(os.tmpdir(), 'open-'));
const baseG = 'gated.test', baseO = 'open.test';
const gated = spawnBeach(dirG, 8831, baseG, { BEACH_GATE: 'members', BEACH_GATE_SECRET: GATE_SECRET, BEACH_KEEPERS: 'keeper' });
const open = spawnBeach(dirO, 8832, baseO, { BEACH_GATE: '', BEACH_GATE_SECRET: '', BEACH_KEEPERS: '' });
const g = client(8831, baseG), o = client(8832, baseO);
try {
  if (!await ready(g) || !await ready(o)) { console.error('a local beach did not start'); process.exit(2); }

  console.log('\n— before the settings latch: the gate is off —');
  ok((await g('POST', `${W}?block=passport:keeper`, { spindle: '', content: { _: 'KEEPER' }, new_lock: 'K1' })).status === 200, 'keeper founds their passport');
  ok((await g('POST', `${W}?block=passport:ada`, { spindle: '', content: { _: 'ADA' }, new_lock: 'A1' })).status === 200, 'ada founds her passport');
  ok((await g('POST', `${W}?block=lighthouse`, { spindle: '', content: { _: 'LIGHT' } })).status === 200, 'the lighthouse, open');
  ok((await g('POST', `${W}?block=spine:constitution`, { spindle: '', content: { _: 'CONST' }, new_lock: 'K1' })).status === 200, 'the constitution, latched by the keeper');
  ok((await g('POST', `${W}?block=index:keeper`, { spindle: '', new_lock: 'K1', content: { _: "the keepers' index — what this beach holds, and what is beyond",
    '1': { _: 'lighthouse', '4': 'organ', '5': 'beyond', '9': 'the front door' },
    '2': { _: 'spine:constitution — the constitution', '4': 'spine', '5': 'beyond' },
    '3': { _: 'passport:keeper', '4': 'organ', '5': 'beach' },
    '4': { _: 'index:keeper', '4': 'index', '5': 'beach' },
    '5': { _: 'settings', '4': 'organ', '5': 'beach' } } })).status === 200, "the keeper's index");
  ok((await g('POST', `${W}?block=days:ada`, { spindle: '', content: { _: 'a sealed day' }, new_lock: 'A1' })).status === 200, "ada's days, under her key");
  ok((await g('POST', `${W}?block=poems:ada`, { spindle: '', content: { _: 'POEMS' }, new_lock: 'A1' })).status === 200, "ada's poems, under her key");
  ok((await g('POST', `${W}?block=index:ada`, { spindle: '', new_lock: 'A1', content: { _: "ada's index",
    '1': { _: 'passport:ada', '5': 'beach' }, '2': { _: 'days:ada', '5': 'self' }, '3': { _: 'poems:ada — what I share with anyone', '5': 'beyond' } } })).status === 200, "ada's index");
  let idx = await g('GET', W);
  ok(idx.status === 200 && idx.body.blocks.includes('passport:ada') && idx.body.blocks.includes('days:ada'), 'the index is whole: settings is not latched, so the gate is off', idx.body?.blocks);
  ok((await g('GET', `${W}?block=days:ada`)).status === 200, "a stranger reads ada's days while the gate is off");

  console.log('\n— the keeper latches settings: the gate comes up —');
  ok((await g('POST', `${W}?block=settings`, { spindle: '', content: { _: 'the beach settings' }, new_lock: 'OP' })).status === 200, 'settings latched at its root');
  idx = await g('GET', W);
  ok(idx.status === 200 && JSON.stringify(idx.body.blocks) === JSON.stringify(['lighthouse', 'poems:ada', 'spine:constitution']), 'a stranger sees only what is marked beyond', idx.body?.blocks);
  ok(/members' beach/.test(idx.body?._ || ''), 'the index says whose beach it is');
  ok((await g('GET', `${W}?block=lighthouse`)).body?._ === 'LIGHT', 'the lighthouse is served (keeper marks it beyond)');
  ok((await g('GET', `${W}?block=spine:constitution`)).body?._ === 'CONST', 'the constitution is served (beyond)');
  ok((await g('GET', `${W}?block=poems:ada`)).body?._ === 'POEMS', "ada's poems are served (her index marks them beyond)");
  let r = await g('GET', `${W}?block=days:ada`);
  ok(r.status === 401 && r.body?.code === 'members_only', "ada's days are refused (self)", r.body);
  r = await g('GET', `${W}?block=passport:ada`);
  ok(r.status === 401 && r.body?.code === 'members_only', "ada's passport is refused (beach)", r.body);
  const missing = await g('GET', `${W}?block=nothing:here`);
  ok(missing.status === 401 && missing.body?.code === 'members_only' && missing.body.error === r.body.error, 'a block that does not exist gets the SAME refusal', missing.body);
  ok((await g('GET', `${W}?block=index:keeper`)).status === 401, "the keeper's index itself is members-only (it says beach of itself)");
  ok((await g('GET', `${W}?tables`)).status === 401, '?tables is members-only');
  ok((await g('GET', `${W}?block=days:ada&spindle=1&pscale=0`)).status === 401, 'a shaped read of a refused block is refused too');

  console.log('\n— the proof: a pass for a member —');
  r = await g('POST', `${W}?block=passport:ada`, { secret: 'WRONG' });
  ok(r.status === 403 && r.body?.code === 'lock_required', 'a wrong secret is refused', r.body);
  r = await g('POST', `${W}?block=passport:nobody`, { secret: 'x' });
  ok(r.status === 404, 'no such passport: 404', r.body);
  r = await g('POST', `${W}?block=passport:ada`, { secret: 'A1' });
  ok(r.status === 200 && typeof r.body?.pass === 'string' && r.body.handle === 'ada', "ada's secret mints a pass", r.body);
  const ada = r.body?.pass || '';
  ok((await g('GET', `${W}?block=days:ada`, null, bearer(ada))).body?._ === 'a sealed day', 'with the pass, ada reads her days');
  ok((await g('GET', `${W}?block=passport:keeper`, null, bearer(ada))).body?._ === 'KEEPER', "with the pass, ada reads the keeper's passport (a member reads everything)");
  idx = await g('GET', W, null, bearer(ada));
  ok(idx.body?.blocks?.includes('days:ada') && idx.body.blocks.includes('index:keeper'), 'with the pass, the index is whole', idx.body?.blocks);
  ok((await g('GET', `${W}?tables`, null, bearer(ada))).status === 200, 'with the pass, ?tables answers');

  console.log('\n— forged and expired passes are nobody —');
  const b64u = (t) => Buffer.from(t, 'utf8').toString('base64url');
  const forged = `m.${b64u('ada')}.${Date.now() + 100000}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
  ok((await g('GET', `${W}?block=days:ada`, null, bearer(forged))).status === 401, 'a forged pass is refused');
  const expAt = Date.now() - 1000;
  const expired = `m.${b64u('ada')}.${expAt}.${createHmac('sha256', GATE_SECRET).update(`m|ada|${expAt}`).digest('base64url')}`;
  ok((await g('GET', `${W}?block=days:ada`, null, bearer(expired))).status === 401, 'an expired pass is refused');
  ok((await g('GET', `${W}?block=days:ada`, null, bearer('m.x'))).status === 401, 'a malformed pass is refused');

  console.log('\n— writes —');
  r = await g('POST', `${W}?block=poems:ada`, { spindle: '1', content: 'a new poem', secret: 'A1' });
  ok(r.status === 401 && r.body?.code === 'members_only', 'a stranger cannot write, even with the right latch', r.body);
  r = await g('POST', `${W}?block=poems:ada`, { spindle: '1', content: 'a new poem', secret: 'A1' }, bearer(ada));
  ok(r.status === 200, 'ada writes her poems with her pass and her latch', r.body);
  r = await g('POST', `${W}?block=poems:ada`, { spindle: '2', content: 'x', secret: 'WRONG' }, bearer(ada));
  ok(r.status === 403, 'the latch rules stand behind the gate: a wrong secret is still refused', r.body);
  ok((await g('POST', `${W}?block=marks`, { append: true, content: { _: 'hello', '1': 'ada' } }, bearer(ada))).status === 200, 'a member appends to an open board');
  ok((await g('POST', `${W}?block=marks`, { append: true, content: { _: 'hello', '1': 'nobody' } })).status === 401, 'a stranger cannot append to it');
  ok((await g('POST', `${W}?block=sed:circle`, { action: 'register', secret: 's', handle: 'ada' })).status === 401, 'a stranger cannot register in a sed');

  console.log('\n— the invite: a newcomer founds a passport with it —');
  r = await g('POST', `${W}?block=passport:ada`, { invite: true });
  ok(r.status === 401, 'a stranger cannot mint an invite');
  r = await g('POST', `${W}?block=passport:ada`, { invite: true }, bearer(ada));
  ok(r.status === 200 && typeof r.body?.invite === 'string' && r.body.by === 'ada', 'ada mints an invite', r.body);
  const invite = r.body?.invite || '';
  ok((await g('POST', `${W}?block=passport:newbie`, { spindle: '', content: { _: 'NEWBIE' }, new_lock: 'N1' })).status === 401, 'founding a passport without an invite is refused');
  ok((await g('POST', `${W}?block=poems:newbie`, { spindle: '', content: { _: 'x' }, new_lock: 'N1' }, bearer(invite))).status === 401, 'an invite founds a passport and nothing else');
  ok((await g('POST', `${W}?block=passport:ada`, { spindle: '', content: { _: 'TAKEOVER' }, new_lock: 'N1', confirm: true }, bearer(invite))).status === 401, 'an invite cannot touch a passport that stands');
  ok((await g('POST', `${W}?block=passport:newbie`, { spindle: '', content: { _: 'NEWBIE' } }, bearer(invite))).status === 401, 'an invite founds a passport only LOCKED (new_lock)');
  r = await g('POST', `${W}?block=passport:newbie`, { spindle: '', content: { _: 'NEWBIE' }, new_lock: 'N1' }, bearer(invite));
  ok(r.status === 200, 'with the invite, newbie founds their passport locked', r.body);
  ok((await g('GET', `${W}?block=passport:newbie`, null, bearer(invite))).status === 401, 'an invite is not a pass: it reads nothing');
  r = await g('POST', `${W}?block=passport:newbie`, { secret: 'N1' });
  ok(r.status === 200 && r.body?.handle === 'newbie', 'newbie proves the new passport for a pass', r.body);
  ok((await g('GET', `${W}?block=days:ada`, null, bearer(r.body?.pass || ''))).status === 200, 'and reads as a member');

  console.log('\n— DELETE —');
  ok((await g('DELETE', `${W}?block=lighthouse`, { confirm: true })).status === 401, 'a stranger cannot wipe');
  ok((await g('DELETE', `${W}?block=lighthouse`, { confirm: true }, bearer(ada))).status === 200, 'a member wipes an open block, as ever');

  console.log('\n— an ungated beach is unchanged —');
  ok((await o('POST', `${W}?block=passport:ada`, { spindle: '', content: { _: 'ADA' }, new_lock: 'A1' })).status === 200, 'ada founds her passport on the open beach');
  r = await o('POST', `${W}?block=passport:ada`, { secret: 'A1' });
  ok(r.body?.pass === undefined, 'the proof shape mints nothing there (an ordinary write, as before)', r.body);
  ok((await o('GET', `${W}?block=passport:ada`)).body?._ === 'ADA', 'anyone reads anything there');
  ok((await o('GET', `${W}?block=nothing:here`)).status === 404, 'and a missing block is 404, as before');
  ok((await o('POST', `${W}?block=settings`, { spindle: '', content: { _: 'the beach settings' }, new_lock: 'OP' })).status === 200, 'latching settings on an ungated beach…');
  ok((await o('GET', W)).body?.blocks?.includes('passport:ada'), '…changes nothing: no BEACH_GATE, no gate');

  console.log(fails ? `\n${fails} FAILED` : '\nthe members\' gate: all pass ✓');
} finally {
  gated.kill(); open.kill();
  await fs.rm(dirG, { recursive: true, force: true }).catch(() => {});
  await fs.rm(dirO, { recursive: true, force: true }).catch(() => {});
}
process.exit(fails ? 1 : 0);
