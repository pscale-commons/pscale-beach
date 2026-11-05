#!/usr/bin/env node
// smoke-key-guard.mjs — the key guard at the door (whetstone 9.1; the security schematic's 1.21;
// bsp-mcp proposals/2026-10-24-security-in-the-core.md, "the next door").
//
//   node scripts/smoke-key-guard.mjs
//
// The router refuses a write that carries, as a whole word, a key the same call presents. The
// handler now does the same for every door at once (lib/key-guard.js, ported from the router's
// refuseKeyInPayload): a request's secret, new_lock, passphrase or my_passphrase, six characters
// or more, found in what the write would land refuses the write before anything is stored. A gray
// envelope passes, being sealed before it arrives, and the refusal never repeats the key.
//
// First the router's own 21 cases (bsp-mcp scripts/smoke-key-guard.ts) against the port; then the
// rule end to end against two freshly-spawned local beaches running the real handler, one open and
// one behind the members' gate: every write path (a write, a founding, a rotation, an append at the
// root and beneath a node, a settle, a grain reach), what passes, and that nothing refused lands.
//
// Every key below is made up for this battery; none latches anything outside it.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refuseKeyInPayload } from '../lib/key-guard.js';

let fails = 0, n = 0;
const ok = (c, m, detail) => { n++; console.log((c ? '  ok   ' : '  FAIL ') + m + (!c && detail !== undefined ? '  ← ' + JSON.stringify(detail).slice(0, 240) : '')); if (!c) fails++; };

/** The refusal's words, or null when the payload passes. */
function verdict(payload, keys) {
  const r = refuseKeyInPayload(payload, keys);
  return r ? String(r.body.error) : null;
}
// A gray envelope as every sealing door leaves one (bsp-mcp src/keys.ts, button/seal.js): a note, the
// ciphertext, the nonce, the mode at 9. The guard is blind to the cipher, so node's own stands in here.
function grayEnvelope(text) {
  const key = randomBytes(32), iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final(), c.getAuthTag()]);
  return { _: 'Encrypted (gray); readable only with the author secret.', 1: ct.toString('base64'), 2: iv.toString('base64'), 9: { _: 'gray', 1: 'self' } };
}

const KEY = 'tidepool-lantern-417';

console.log('\nthe port: the router\'s 21 cases\n\npasses');
ok(verdict('a plain note', []) === null, 'no keys presented');
ok(verdict('a plain note', [undefined, null, '']) === null, 'absent and empty keys');
ok(verdict(undefined, [KEY]) === null, 'no payload (a lock-only save)');
ok(verdict('wrote with the shared project lock, kept in vault:weft', [KEY]) === null, 'a pointer to a key, not its value');
ok(verdict('shell 42 taken', ['shell']) === null, 'a key under six characters is not checked');
ok(verdict('tidepool-lantern-4170 is a different word', [KEY]) === null, 'the key inside a longer word');
ok(verdict({ _: 'a block', 1: { _: 'a branch', 2: 'a leaf' } }, [KEY]) === null, 'a nested block without the key');
ok(verdict('TIDEPOOL-LANTERN-417', [KEY]) === null, 'case differs, so not the key');

console.log('refuses');
ok(verdict(`latched with ${KEY}.`, [KEY]) !== null, 'the secret in a sentence');
ok(verdict(KEY, [KEY]) !== null, 'the secret as the whole text');
ok(verdict({ _: 'history', 3: { _: 'an entry', 1: `key: ${KEY}` } }, [KEY]) !== null, 'the secret at a deep leaf');
ok(verdict({ _: `rotated to ${KEY}` }, [undefined, KEY]) !== null, 'the new_lock in the text');
ok(verdict({ declaration: `I am here (passphrase ${KEY})`, shell_ref: undefined }, [KEY]) !== null, 'a settle declaration');
ok(verdict({ description: 'a grain', my_side_content: `${KEY}` }, [KEY]) !== null, 'a grain side');
const phrase = 'quiet harbour paper kite';
ok(verdict(`the words were ${phrase}, said once`, [phrase]) !== null, 'a passphrase of several words');
const special = 'a.b*c+(d)?[e]';
ok(verdict(`key ${special} here`, [special]) !== null, 'a key with regex characters, matched literally');
ok(verdict('key aXbXc+(d)?[e] here', [special]) === null, 'and those characters are not wildcards');

console.log('the refusal');
const msg = verdict(`latched with ${KEY}`, [KEY]) ?? '';
ok(msg.length > 0 && !msg.includes(KEY), 'never repeats the key');
ok(/pointer, never a value/.test(msg), 'names the rule');
ok(/https:\/\/happyseaurchin\.com\/beach-security#practice/.test(msg) && /block="whetstone", spindle="9"/.test(msg), 'points at the security page, and at the law');

console.log('sealed writes pass');
ok(verdict(grayEnvelope(`the vault keeps ${KEY}`), [KEY]) === null, 'a gray envelope carrying the key inside its ciphertext');

// ── at the door ──────────────────────────────────────────────────────────────────────────
const beachScript = fileURLToPath(new URL('./local-beach.mjs', import.meta.url));
const W = '/.well-known/pscale-beach';
function client(port, base) {
  return (method, path, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: '127.0.0.1', port, method, path,
      headers: { Host: base, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers },
    }, (resp) => {
      let b = '';
      resp.on('data', (c) => (b += c));
      resp.on('end', () => { let j = null; try { j = b ? JSON.parse(b) : null; } catch { j = { raw: b }; } resolve({ status: resp.statusCode, body: j, raw: b }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
async function ready(req) {
  for (let i = 0; i < 80; i++) {
    try { const r = await req('GET', W); if (r.status < 500) return true; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
const spawnBeach = (dir, port, base, env) => spawn('node', [beachScript, '--dir', dir, '--port', String(port), '--origin', base], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...env } });
const refused = (r) => r.status === 422 && r.body?.code === 'key_in_payload';
const quiet = (r) => !r.raw.includes(KEY);

const dirO = await fs.mkdtemp(join(os.tmpdir(), 'keyguard-open-')), dirG = await fs.mkdtemp(join(os.tmpdir(), 'keyguard-gate-'));
const open = spawnBeach(dirO, 8871, 'open.test', { BEACH_GATE: '', BEACH_GATE_SECRET: '', BEACH_KEEPERS: '' });
const gated = spawnBeach(dirG, 8872, 'gated.test', { BEACH_GATE: 'members', BEACH_GATE_SECRET: 'test-gate-secret', BEACH_KEEPERS: 'keeper' });
const o = client(8871, 'open.test'), g = client(8872, 'gated.test');
try {
  if (!await ready(o) || !await ready(g)) { console.error('a local beach did not start'); process.exit(2); }

  console.log('\nat an open beach: every write path');
  let r = await o('POST', `${W}?block=notes:ada`, { content: { _: "ada's notes", 1: 'a first line' }, new_lock: KEY });
  ok(r.status === 200, 'ada founds notes:ada under her key (no key in the words)', r.body);
  r = await o('POST', `${W}?block=notes:ada`, { spindle: '2', content: `my key is ${KEY}, for safe keeping`, secret: KEY });
  ok(refused(r), 'a line carrying the secret the same write presents is refused, 422 key_in_payload', r.body);
  ok(quiet(r) && /pointer, never a value/.test(r.body.error) && /beach-security#practice/.test(r.body.error), '…the refusal never repeats the key, and points at the security page', r.body);
  const after = await o('GET', `${W}?block=notes:ada`);
  ok(after.body && after.body['2'] === undefined && !after.raw.includes(KEY), '…and nothing landed', after.body);
  r = await o('POST', `${W}?block=notes:ada`, { spindle: '', content: { _: "ada's notes", 1: { _: 'deep', 3: `key: ${KEY}` } }, secret: KEY, confirm: true });
  ok(refused(r), 'a whole-block replace carrying it at a deep leaf is refused', r.body);
  r = await o('POST', `${W}?block=diary:bob`, { content: { _: `bob's diary, latched with ${KEY}` }, new_lock: KEY });
  ok(refused(r), 'a founding carrying its own new_lock is refused…', r.body);
  ok((await o('GET', `${W}?block=diary:bob`)).status === 404, '…and nothing was born');
  const NEXT = 'kelp-forest-lighthouse-88';
  r = await o('POST', `${W}?block=notes:ada`, { spindle: '3', content: `rolled to ${NEXT}`, secret: KEY, new_lock: NEXT });
  ok(refused(r) && quiet(r) && !r.raw.includes(NEXT), 'a rotation whose words carry the new lock is refused, neither key repeated', r.body);
  ok((await o('POST', `${W}?block=notes:ada`, { spindle: '3', content: 'x', secret: NEXT })).status === 403, '…and the lock did not turn: the new key opens nothing');
  ok((await o('POST', `${W}?block=board`, { content: { _: 'an open board' } })).status === 200, 'an open board stands');
  r = await o('POST', `${W}?block=board`, { append: true, content: { _: `pinned: ${KEY}`, 1: 'ada' }, secret: KEY });
  ok(refused(r), 'an append at the root carrying the secret is refused', r.body);
  ok((await o('POST', `${W}?block=board`, { spindle: '', content: { _: 'an open board', 1: { _: 'a thread' } }, confirm: true })).status === 200, 'a thread opens on the board');
  r = await o('POST', `${W}?block=board`, { append: true, spindle: '1', content: `reply, keyed ${KEY}`, secret: KEY });
  ok(refused(r), 'an append beneath a node carrying it is refused', r.body);
  ok(!(await o('GET', `${W}?block=board`)).raw.includes(KEY), '…and the board holds neither');
  r = await o('POST', `${W}?block=sed:circle`, { action: 'register', declaration: `ada, here (my passphrase is ${KEY})`, passphrase: KEY });
  ok(refused(r), 'a settle whose declaration carries its passphrase is refused…', r.body);
  ok((await o('GET', `${W}?block=sed:circle`)).status === 404, '…and no collective was born');
  r = await o('POST', `${W}?block=sed:circle`, { action: 'register', declaration: 'ada, here', shell_ref: `shell:ada — ${KEY}`, passphrase: KEY });
  ok(refused(r), 'so is one whose shell reference carries it', r.body);
  r = await o('POST', `${W}?block=grain:ada-bob`, { action: 'reach', side: '1', agent_id: 'ada', partner_agent_id: 'bob', description: 'a grain', my_side_content: `side one, ${KEY}`, my_passphrase: KEY });
  ok(refused(r), 'a grain reach whose side carries its passphrase is refused…', r.body);
  r = await o('POST', `${W}?block=grain:ada-bob`, { action: 'reach', side: '1', agent_id: 'ada', partner_agent_id: 'bob', description: `ours, ${KEY}`, my_side_content: 'side one', my_passphrase: KEY });
  ok(refused(r), '…as is one whose description carries it', r.body);
  ok((await o('GET', `${W}?block=grain:ada-bob`)).status === 404, '…and no grain was born');

  console.log('\nwhat passes');
  r = await o('POST', `${W}?block=notes:ada`, { spindle: '4', content: grayEnvelope(`the vault keeps ${KEY}`), secret: KEY });
  ok(r.status === 200, 'a gray envelope carrying the key inside its ciphertext lands: it was sealed before it arrived', r.body);
  ok((await o('GET', `${W}?block=notes:ada&spindle=4`)).body?.['9']?._ === 'gray', '…and stands as the envelope');
  ok((await o('POST', `${W}?block=notes:ada`, { spindle: '5', content: 'written with my everyday key, kept in vault:ada', secret: KEY })).status === 200, 'a pointer to the key, never its value, lands');
  ok((await o('POST', `${W}?block=notes:ada`, { spindle: '6', content: 'tidepool-lantern-4170 is another word', secret: KEY })).status === 200, 'the key inside a longer word lands');
  ok((await o('POST', `${W}?block=notes:ada`, { spindle: '7', content: 'TIDEPOOL-LANTERN-417 differs in case', secret: KEY })).status === 200, 'a case variant lands');
  ok((await o('POST', `${W}?block=short:ada`, { content: { _: 'latched with A1, a short word' }, new_lock: 'A1' })).status === 200, 'a key under six characters is not checked');
  ok((await o('POST', `${W}?block=sed:circle`, { action: 'register', declaration: 'ada, here', passphrase: KEY })).status === 200, 'a settle without the key lands');
  ok((await o('POST', `${W}?block=grain:ada-bob`, { action: 'reach', side: '1', agent_id: 'ada', partner_agent_id: 'bob', description: 'a grain', my_side_content: 'side one', my_passphrase: KEY })).status === 200, 'a grain reach without it lands');
  ok((await o('POST', `${W}?block=notes:ada`, { spindle: '8', content: `bob's key ${NEXT} is not one this write presents`, secret: KEY })).status === 200, 'a key the request does not present is not the guard\'s to know (it never guesses)');

  console.log('\nbehind the members\' gate');
  await g('POST', `${W}?block=passport:ada`, { content: { _: 'ADA' }, new_lock: KEY });
  await g('POST', `${W}?block=settings`, { content: { _: 'settings' }, new_lock: 'OP-settings' });
  const pass = (await g('POST', `${W}?block=passport:ada`, { secret: KEY })).body?.pass;
  ok(typeof pass === 'string', 'ada proves her passport for a pass (the proof carries no words to guard)');
  r = await g('POST', `${W}?block=passport:ada`, { spindle: '1', content: `Location: here. Key: ${KEY}`, secret: KEY }, { Authorization: `Bearer ${pass}` });
  ok(refused(r) && quiet(r), 'a member writing her own key into her passport is refused there too', r.body);
  r = await g('POST', `${W}?block=passport:ada`, { invite: true }, { Authorization: `Bearer ${pass}` });
  const invite = r.body?.invite;
  r = await g('POST', `${W}?block=passport:newbie`, { content: { _: 'NEWBIE — key quill-ink-pot-42' }, new_lock: 'quill-ink-pot-42' }, { Authorization: `Bearer ${invite}` });
  ok(refused(r), "a newcomer's founding carrying the new key is refused before the invitation is spent…", r.body);
  ok((await g('POST', `${W}?block=passport:newbie`, { content: { _: 'NEWBIE' }, new_lock: 'quill-ink-pot-42' }, { Authorization: `Bearer ${invite}` })).status === 200, '…so the same invitation then founds the passport without it');

  console.log(fails ? `\n${fails} of ${n} FAILED` : `\nthe key guard at the door: ${n} checks, all pass ✓`);
} finally {
  open.kill(); gated.kill();
  await fs.rm(dirO, { recursive: true, force: true }).catch(() => {});
  await fs.rm(dirG, { recursive: true, force: true }).catch(() => {});
}
process.exit(fails ? 1 : 0);
