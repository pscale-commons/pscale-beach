#!/usr/bin/env node
// smoke-letterbox.mjs — THE LETTERBOX (api/pscale-beach.js) and its daily backstop (api/letterboxes.js), end to end
// against the REAL handler on a temp folder, with letters sealed by the beach's own seal (button/seal.js and the
// vendored nacl, run as a page runs them). Self-contained: no Upstash, no browser.
//
//   node scripts/smoke-letterbox.mjs
//
// Proves, on a members' beach: a box is opened by one card in the keepers' index (a holder's own index opens none, nor
// does a card on a passport); a stranger who reads it is shown its door (the colour, the colour's CURRENT turn and that
// turn's public half, the size and the ceiling) and nothing of what is in it, nor who holds the colour, nor the box's
// line or code, and the index a stranger sees does not list it; a stranger drops one letter sealed for that turn with
// no key, and the answer says nothing of where it landed; a member reads it stamped when it came, the turn's key opens
// it and the old turn's does not; the box takes nothing else (an old turn, another colour, anything more in the letter,
// a date of its own, a note not the seal's, plain words, past the size, beneath a node, with a latch, a whole write, a
// stranger bringing a key); a letter for a block that is no letterbox is refused as ever; a box whose colour holds no
// key takes nothing; a member's keyless letter is the same drop and a member's keyless plain append meets the latch;
// a drop clears what stood past forty days and keeps what did not; the ceiling holds, two drops at the last place
// landing one; the whole box has a size; the daily tending clears every letter past forty days, keeps the box's line
// and code, and tends once a day; the route answers with no box named; and off the gate there is no letterbox at all.

import vm from 'node:vm';
import { promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
process.env.BEACH_ORIGIN = 'cr.test';
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';
process.env.BEACH_GATE = 'members';
process.env.BEACH_GATE_SECRET = 'gate-secret';
process.env.BEACH_KEEPERS = 'keeper';
process.env.BEACH_CAPS = '';

const { FileRedis } = await import('./file-redis.mjs');

// The beach's own seal and the vendored nacl, run as a page runs them.
const page = { console, TextEncoder, TextDecoder, btoa, atob, Uint8Array, crypto: globalThis.crypto };
page.self = page;
vm.createContext(page);
vm.runInContext(readFileSync(join(ROOT, 'button/vendor/nacl-fast.min.js'), 'utf8'), page);
page.hashwasm = { argon2id: async () => { throw new Error('this smoke derives no pair'); } };
vm.runInContext(readFileSync(join(ROOT, 'button/seal.js'), 'utf8'), page);
const S = page.beachSeal, nacl = page.nacl;

let failed = 0;
const ok = (c, label, detail) => {
  console.log(`${c ? '  ✓' : '  ✗'} ${label}` + (!c && detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 300)}` : ''));
  if (!c) failed++;
};

let fresh = 0;
const dirs = [];
async function beach(env = {}) {
  Object.assign(process.env, env);
  const dir = await fs.mkdtemp(join(os.tmpdir(), 'smoke-letterbox-'));
  dirs.push(dir);
  const mod = await import(`../api/pscale-beach.js?fresh=${++fresh}`);
  mod.__setRedis(new FileRedis(dir));
  const door = async (method, block, body = {}, pass) => {
    let status = 200, payload = null;
    const req = {
      method, url: '/.well-known/pscale-beach', query: block ? { block } : {},
      body: method === 'GET' ? undefined : { ...body, ...(block ? { block } : {}) },
      headers: { host: 'cr.test', ...(pass ? { authorization: `Bearer ${pass}` } : {}) },
    };
    const res = { headersSent: false, setHeader() {}, status(c) { status = c; return this; }, json(o) { payload = o; this.headersSent = true; }, end() { this.headersSent = true; } };
    await mod.default(req, res);
    return { status, body: payload };
  };
  return { dir, door, mod };
}
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();

// The colour: two turns, the second current, each with a copy for matthew.
const K1 = nacl.randomBytes(32), K2 = nacl.randomBytes(32);
const matthew = S.b64(nacl.box.keyPair().publicKey);
const turn1 = await S.colour.turn(K1, [await S.group.wrap(K1, 'matthew', matthew)]);
const turn2 = await S.colour.turn(K2, [await S.group.wrap(K2, 'matthew', matthew)]);
const half1 = turn1['2'], half2 = turn2['2'];
const letter = (text, turn = '2', half = half2, colour = 'colour:leadership') => S.colour.letter(text, colour, turn, half);
const LINE = "LETTERBOX — I'm coming along: one letter for colour:leadership, 3 letters a day, cleared after a month.";
const BOXKEY = 'the-box-code';
const code = await letter(BOXKEY);   // the box's own latch, kept sealed for its colour at its line's 9

console.log('a members\' beach: the keeper founds the place, then latches settings');
const { door, mod, dir } = await beach();
const founded = [
  await door('POST', 'passport:keeper', { content: { _: 'KEEPER' }, new_lock: 'K' }),
  await door('POST', 'passport:ada', { content: { _: 'ADA' }, new_lock: 'A' }),
  await door('POST', 'colour:leadership', { content: { _: 'colour:leadership — the Leadership Team', 1: turn1, 2: turn2 }, new_lock: 'K' }),
  await door('POST', 'letterbox', { content: { _: { _: LINE, 9: code } }, new_lock: BOXKEY }),
  await door('POST', 'letterbox:quiet', { content: { _: 'LETTERBOX — for colour:nobody, which holds no key' }, new_lock: 'K' }),
  await door('POST', 'letterbox:one', { content: { _: 'LETTERBOX — for colour:leadership, 1 letter a day' }, new_lock: 'K' }),
  await door('POST', 'letterbox:big', { content: { _: 'LETTERBOX — for colour:leadership', 9: { _: 'x'.repeat(499_800) } }, new_lock: 'K' }),
  await door('POST', 'notes:ada', { content: { _: 'NOTES' }, new_lock: 'A' }),
  await door('POST', 'index:ada', { content: { _: "ada's index", 1: { _: 'notes:ada', 5: 'letterbox' } }, new_lock: 'A' }),
  await door('POST', 'lighthouse', { content: { _: 'LIGHT' } }),
  await door('POST', 'pool:keeper', { content: { _: "the keeper's room" } }),
  await door('POST', 'index:keeper', { new_lock: 'K', content: { _: "the keepers' index",
    1: { _: 'lighthouse', 5: 'beyond' },
    2: { _: "letterbox — I'm coming along, for the Leadership Team", 5: 'letterbox' },
    3: { _: 'letterbox:quiet', 5: 'letterbox' },
    4: { _: 'letterbox:one', 5: 'letterbox' },
    5: { _: 'letterbox:big', 5: 'letterbox' },
    6: { _: 'colour:leadership', 5: 'beach' },
    7: { _: 'passport:ada', 5: 'letterbox' } } }),
  await door('POST', 'settings', { content: { _: 'settings' }, new_lock: 'K' }),
];
ok(founded.every((r) => r.status === 200), 'every block founded, the box latched under its own code with that code sealed at its line\'s 9', founded.map((r) => r.status));
const pass = (await door('POST', 'passport:ada', { secret: 'A' })).body?.pass;
ok(typeof pass === 'string', 'ada, a member, proves her passport for a pass');

console.log('the door: a stranger is shown what the box takes, never what is in it');
let r = await door('GET', 'letterbox');
ok(r.status === 200 && r.body.colour === 'colour:leadership' && r.body.turn === '2' && r.body.half === half2 && r.body.per_day === 3 && r.body.bytes === 6000,
  "the door names the colour, its current turn and that turn's public half, the size a letter may be and the ceiling", r.body);
const shown = JSON.stringify(r.body);
ok(!shown.includes('matthew') && !shown.includes('coming along') && !shown.includes(code['1']), "and nothing more: not who holds the colour, not the box's line, not its code", r.body);
ok((await door('GET', 'colour:leadership')).status === 401, 'the colour block itself stays members-only');
r = await door('GET', null);
ok(r.status === 200 && r.body.blocks.includes('lighthouse') && !r.body.blocks.some((b) => b.startsWith('letterbox')), 'the index a stranger sees lists no letterbox', r.body?.blocks);
r = await door('GET', 'letterbox:quiet');
ok(r.status === 200 && r.body.turn === null && r.body.half === null && /taking nothing/.test(r.body._), 'a box whose colour holds no key says it takes nothing yet', r.body);
ok((await door('GET', 'notes:ada')).status === 401, "a holder's own index opens no letterbox: ada's notes stay members-only");

console.log('the drop');
const l1 = await letter('I would like to come along on Thursday. Sam, over 18.');
r = await door('POST', 'letterbox', { append: true, content: l1 });
ok(r.status === 200 && r.body.ok === true && r.body.slot === undefined && r.body.address === undefined && r.body.floor === undefined,
  "a stranger drops a letter sealed for the colour's current turn, with no key; the answer says nothing of where it landed", r.body);
let box = (await door('GET', 'letterbox', {}, pass)).body;
const first = box['1'] && box['1']['1'];
ok(first && first['1'] === l1['1'] && Date.now() - Date.parse(first['3']) < 60_000, 'a member reads the box: the letter at its first slot, stamped when it came', box);
ok((await S.colour.open(first, K2)) === 'I would like to come along on Thursday. Sam, over 18.', "the current turn's key opens it");
ok((await S.colour.open(first, K1)) === null, "and the old turn's key does not");
ok(box._ && box._._ === LINE && box._['9'] && box._['9']['1'] === code['1'], "the box's line and its code stand untouched");

console.log('the box takes nothing else');
const refused = async (body, want, label, who) => { const x = await door('POST', 'letterbox', body, who); ok(x.status !== 200 && x.body?.code === want, label, x); };
await refused({ append: true, content: await letter('old', '1', half1) }, 'letterbox_letter', 'not a letter sealed for an earlier turn');
await refused({ append: true, content: await letter('elsewhere', '2', half2, 'colour:other') }, 'letterbox_letter', 'not a letter sealed for another colour');
await refused({ append: true, content: { ...(await letter('x')), 4: 'and a line in plain words' } }, 'letterbox_letter', 'not a letter carrying anything more');
await refused({ append: true, content: { ...(await letter('x')), 3: ago(-30) } }, 'letterbox_letter', 'not a letter that dates itself (the beach stamps when it came)');
await refused({ append: true, content: { ...(await letter('x')), _: 'Hello, I am Sam' } }, 'letterbox_letter', "not a letter whose note is not the seal's own");
await refused({ append: true, content: { _: 'I would like to come along' } }, 'letterbox_letter', 'not words in plain sight');
await refused({ append: true, content: await letter('x'.repeat(5000)) }, 'letterbox_size', 'not a letter past the size');
await refused({ append: true, spindle: '1', content: await letter('x') }, 'letterbox_only', 'not a drop beneath a node');
await refused({ append: true, new_lock: 'mine', content: await letter('x') }, 'letterbox_only', 'not a drop that would set a latch');
await refused({ content: { _: 'replaced' }, confirm: true }, 'members_only', "a stranger's write that is no drop is refused as ever");
await refused({ append: true, secret: 'a guess', content: await letter('x') }, 'members_only', 'a stranger who brings a key is not dropping: refused as ever');
for (const name of ['pool:keeper', 'notes:ada', 'passport:ada']) {
  r = await door('POST', name, { append: true, content: await letter('x') });
  ok(r.status === 401 && r.body?.code === 'members_only', `a letter for ${name}, which is no letterbox, is refused as ever`, r);
}
r = await door('POST', 'letterbox:quiet', { append: true, content: await letter('x') });
ok(r.status === 409 && r.body?.code === 'letterbox_closed', 'a box whose colour holds no key takes nothing', r.body);
box = (await door('GET', 'letterbox', {}, pass)).body;
ok(Object.keys(box['1']).filter((k) => k !== '_').length === 1, 'and none of them landed', box['1']);

console.log("a member's keyless letter is a drop; the box's key writes as ever; a drop clears what stood past forty days");
r = await door('POST', 'letterbox', { append: true, content: { _: 'a plain line' } }, pass);
ok(r.status === 403 && r.body?.code === 'lock_required', "a member's keyless append of plain words meets the box's latch", r.body);
const old41 = { ...(await letter('long ago')), 3: ago(41) }, old39 = { ...(await letter('a while ago')), 3: ago(39) };
r = await door('POST', 'letterbox', { spindle: '21', content: old41, secret: BOXKEY }, pass);
ok(r.status === 200, "a member holding the box's code (a leader's phone) writes in a letter that came forty-one days ago", r);
ok((await door('POST', 'letterbox', { spindle: '22', content: old39, secret: BOXKEY }, pass)).status === 200, '…and one that came thirty-nine days ago');
r = await door('POST', 'letterbox', { append: true, content: await letter('from a member, keyless') }, pass);
ok(r.status === 200, "a member's keyless letter is a drop like any other", r.body);
box = (await door('GET', 'letterbox', {}, pass)).body;
ok(box['2'] && box['2']['1'] === undefined && box['2']['2'] && box['2']['2']['3'] === old39['3'], 'the drop cleared the letter past forty days and kept the one inside them', box['2']);

console.log('the ceiling');
r = await door('POST', 'letterbox', { append: true, content: await letter('the third today') });
ok(r.status === 200, 'a third letter today lands (three a day, the box\'s line says)', r.body);
r = await door('POST', 'letterbox', { append: true, content: await letter('the fourth today') });
ok(r.status === 429 && r.body?.code === 'letterbox_full' && /full for today/.test(r.body.error) && /email/.test(r.body.error), 'a fourth: the box is full for today, try tomorrow or email instead', r.body);
const both = await Promise.all([door('POST', 'letterbox:one', { append: true, content: await letter('one') }), door('POST', 'letterbox:one', { append: true, content: await letter('two') })]);
ok(both.map((x) => x.status).sort().join() === '200,429', 'two drops at the last place: one lands, one is told the box is full', both.map((x) => x.status));
r = await door('POST', 'letterbox:big', { append: true, content: await letter('one more') });
ok(r.status === 429 && r.body?.code === 'letterbox_full' && /until its letters are cleared/.test(r.body.error), 'a box at its whole size is full until its letters are cleared', r.body);

console.log('the backstop, once a day');
const later = new Date(Date.now() + 41 * 864e5);
let t = await mod.clearLetterboxes(later);
ok(t.tended === true && t.boxes === 4 && t.cleared === 5, 'forty-one days on, the daily tending clears every letter: the four in the box and the one in its sister', t);
box = (await door('GET', 'letterbox', {}, pass)).body;
ok(JSON.stringify(Object.keys(box)) === '["_"]' && box._._ === LINE && box._['9']['1'] === code['1'], "the box keeps its line and its code, and nothing else: emptied containers taken up", box);
t = await mod.clearLetterboxes(later);
ok(t.tended === false, 'a second call the same day tends nothing', t);
// the route, over the same store: one answer for the day, no box named
const plain = await import('../api/pscale-beach.js');
plain.__setRedis(new FileRedis(dir));
const { default: route } = await import('../api/letterboxes.js');
const call = async () => { let status = 0, body = null; await route({ method: 'GET', headers: {} }, { setHeader() {}, status(c) { status = c; return this; }, json(o) { body = o; } }); return { status, body }; };
const c1 = await call(), c2 = await call();
ok(c1.status === 200 && c1.body.tended === true && c2.body.tended === false && !JSON.stringify(c1.body).includes('letterbox:'), 'the route tends once a day whoever calls, and names no box', [c1, c2]);

console.log('off the gate there is no letterbox');
const open = await beach({ BEACH_GATE: '' });
await open.door('POST', 'colour:leadership', { content: { _: 'colour:leadership', 1: turn2 }, new_lock: 'K' });
await open.door('POST', 'letterbox', { content: { _: LINE }, new_lock: BOXKEY });
await open.door('POST', 'index:keeper', { content: { _: 'index', 1: { _: 'letterbox', 5: 'letterbox' } }, new_lock: 'K' });
r = await open.door('POST', 'letterbox', { append: true, content: await letter('x') });
ok(r.status === 403 && r.body?.code === 'lock_required', 'a keyless letter meets the latch as any append does', r.body);
r = await open.door('GET', 'letterbox');
ok(r.status === 200 && r.body._ === LINE, 'and a read is the block itself, as on any open beach', r.body);
t = await open.mod.clearLetterboxes(later);
ok(t.tended === false, 'and nothing is tended', t);

for (const d of dirs) await fs.rm(d, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
