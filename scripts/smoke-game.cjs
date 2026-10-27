// The plug (button/game.js) on a game's page, as a maker would use it beside the voice (the arcade's steps
// 4 and 5; the recipe at ways:arcade).
//
// A game is founded on a mock beach as the recipe says (spine:wire ten deep on the clock, function:wire with
// its board line, pool:wire the room); a result is kept at the day's address, the proof in the room and the
// line in the player's own mirror naming its slot; the board is folded from three players' mirrors, through
// a fold (/api/mirrors) and straight from the beach, a proof that fails the page's verify dropped; a newcomer
// with no name keeps a result in one tap, named and keyed by the voice, and the key is said once; the room,
// presence and the wave read; the two ready-made elements draw and leave a line.
//
// Runs offline in headless Chromium (Playwright). CommonJS (.cjs), as this package is ESM:
//   NODE_PATH=$(npm root -g) npm run smoke:game
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('smoke:game needs Playwright — npm i -g playwright && npx playwright install chromium, then NODE_PATH=$(npm root -g) npm run smoke:game'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const SITE = 8785, BEACH = 8786;
const SECRET = 'correct horse battery';
const NOW = { iso: '2026-10-26T20:30:00Z', address: '2026414588', voicing: 'Monday 26 October 2026, evening (beat 8)' };
const DAY = '2026414500';
const LONG = 'gw1.' + DAY + '.143.' + 'AAAJCgYeFBwSIAwmDB4KEgYQChIKDgQSCg4GDAgKCAoECAQMBg4CEgQUBBYGFAQUBBYGFAYSBhQGEAQMAhYIDAQWDA4GFA4SChYOEgwSDg4MEBAQ'.repeat(30);   // past the 2,000 of a said line

let pass = true;
const check = (label, ok, detail) => {
  if (!ok) pass = false;
  console.log(`  ${ok ? '✓' : '✗'} ${label}` + (ok || detail === undefined ? '' : `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// a game's page, as a maker's would be: the two tags and nothing else of the beach's; with ?fold the plug
// reads the family through a fold, as it does on happyseaurchin.com, else straight from the beach
const page = (fold) => `<!doctype html><html><head><meta charset="utf-8"><title>a game</title></head>
<body><h1>Wire</h1>
<script src="http://127.0.0.1:${SITE}/button/voice.js" data-beach="http://127.0.0.1:${BEACH}"></script>
<script src="http://127.0.0.1:${SITE}/button/game.js" data-game="wire" data-beach="http://127.0.0.1:${BEACH}"${fold ? ` data-fold="http://127.0.0.1:${SITE}/api/mirrors"` : ''}></script>
<script>window.okOnly = function (p) { return p.proof.indexOf('bad') < 0; };</script>
<beach-board n="3" verify="okOnly"></beach-board>
<beach-room n="3"></beach-room>
</body></html>`;
let folds = 0;
function site(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__test/page.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page(url.searchParams.has('fold'))); }
  if (url.pathname === '/api/mirrors') {
    // the fold, as mirrors.js answers it: every mirror of the family, with when each was born and touched
    folds++;
    const family = url.searchParams.get('family'), out = { family, mirrors: {}, born: {}, touched: {}, fold: null, now: NOW };
    Object.keys(BLOCKS).forEach((n) => { if (n.startsWith(family + ':')) { const h = n.slice(family.length + 1); out.mirrors[h] = BLOCKS[n]; if (BORN[n]) out.born[h] = BORN[n]; if (TOUCHED[n]) out.touched[h] = TOUCHED[n]; } });
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); return res.end(JSON.stringify(out));
  }
  const file = path.join(ROOT, url.pathname);
  if (!url.pathname.startsWith('/button/') || !file.startsWith(path.join(ROOT, 'button')) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)] || 'text/plain' });
  res.end(fs.readFileSync(file, 'utf8'));
}

// ── the mock beach ──
const BLOCKS = {}, LOCKS = {}, BORN = {}, TOUCHED = {};
const log = [];
let tick = 0;
const START = Date.now();
// the beach's clock moves with the real one from NOW, so the plug's stamps run in order
const beachNow = () => new Date(Date.parse(NOW.iso) + (Date.now() - START)).toISOString();
const when = () => new Date(Date.parse(NOW.iso) + 60000 * ++tick).toISOString();
function floorOf(b) { let d = 0; while (b && typeof b === 'object' && '_' in b) { d++; b = b._; if (typeof b === 'string') return d; } return d; }
const nested = (line, floor) => { let n = line; for (let i = 0; i < floor; i++) n = { _: n }; return n; };
function seed() {
  [BLOCKS, LOCKS, BORN, TOUCHED].forEach((o) => Object.keys(o).forEach((k) => { delete o[k]; }));
  BLOCKS['passport:tester'] = { _: 'tester — a person testing the plug' }; LOCKS['passport:tester'] = SECRET;
  // the game, founded as the recipe says, under its maker's key
  BLOCKS['spine:wire'] = nested('SPINE — wire, one wire a day on the beach\'s clock: the day\'s address draws it.', 10);
  BLOCKS['function:wire'] = {
    _: 'THE LAW of wire — trace the wire without touching the walls.',
    1: 'mode: game',
    2: 'briefing: Touch your dot at START and drag it to FINISH. Don\'t touch the walls. The clock starts when you touch.',
    3: 'room: pool:wire',
    4: 'board: FINISHED, lowest first, best per player',
    5: 'proof: gw1.<address>.<steps>.<moves>, re-run on the page; a time counts only if its inputs reproduce it',
    6: 'page: https://example.org/wire.html'
  };
  LOCKS['spine:wire'] = LOCKS['function:wire'] = 'the-makers-key';
  BLOCKS['pool:wire'] = { _: 'The room of wire: runs and notes.' };
  BLOCKS['presence'] = { _: 'Presence.', 1: { 1: 'ann', 2: 'pool:wire', 3: NOW.iso, _: 'ann — at pool:wire' }, 2: { 1: 'zed', 2: 'pool:other', 3: NOW.iso, _: 'zed' }, 3: { 1: 'old', 2: 'pool:wire', 3: '2026-10-26T19:00:00Z', _: 'old' } };
  log.length = 0; folds = 0; tick = 0;
}
function setAt(tree, spindle, value) {
  const s = String(spindle), p = (s.indexOf('.') < 0 ? s.replace(/0+$/, '') : s.replace('.', '')).split('').map((d) => (d === '0' ? '_' : d));
  let n = tree;
  p.slice(0, -1).forEach((d) => { if (typeof n[d] === 'string') n[d] = { _: n[d] }; else if (!n[d] || typeof n[d] !== 'object') n[d] = {}; n = n[d]; });
  const last = p[p.length - 1];
  if (n[last] && typeof n[last] === 'object' && (value === null || typeof value !== 'object')) n[last]._ = value; else n[last] = value;
}
function append(block, entry) {
  for (let i = 1; i <= 9; i++) if (!(String(i) in block)) { block[String(i)] = entry; return String(i); }
  throw new Error('the mock room is full');
}
function beach(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', 'Content-Type, Accept');
  res.setHeader('access-control-expose-headers', 'X-Pscale-Now');
  res.setHeader('x-pscale-now', `${beachNow()} | ${NOW.address} | ${NOW.voicing}`);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x'), body = raw ? JSON.parse(raw) : {};
    const name = url.searchParams.get('block') || body.block;
    const say = (status, d) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(d)); };
    log.push({ method: req.method, block: name, body });
    if (req.method === 'GET' && !name) return say(200, { blocks: Object.keys(BLOCKS), touched: TOUCHED, born: BORN, now: NOW });
    if (req.method === 'GET') {
      const b = BLOCKS[name];
      if (!b) return say(404, { error: 'not found', code: 'not_found' });
      return say(200, url.searchParams.has('pscale') ? { floor: floorOf(b), shape: 'disc', entries: [{ address: '0', content: '' }] } : b);
    }
    const hand = /:([^:]+)$/.exec(name || ''), bound = hand && BLOCKS['passport:' + hand[1]] && name !== 'passport:' + hand[1] ? LOCKS['passport:' + hand[1]] : null;
    if (req.method === 'DELETE') {
      if (!BLOCKS[name]) return say(404, { error: 'not found', code: 'not_found' });
      if (body.secret !== LOCKS[name]) return say(403, { error: 'secret does not match', code: 'lock_required' });
      delete BLOCKS[name]; delete LOCKS[name]; return say(200, { ok: true });
    }
    if (!BLOCKS[name]) {
      if (body.spindle || body.append) return say(404, { error: 'not found', code: 'not_found' });
      if (bound && (body.secret !== bound || body.new_lock !== bound)) return say(403, { error: 'this name has a passport; prove its key', code: 'handle_bound' });
      BLOCKS[name] = body.content; if (body.new_lock) LOCKS[name] = body.new_lock;
      BORN[name] = TOUCHED[name] = when();
      return say(200, { ok: true, born: true });
    }
    if (LOCKS[name] && body.secret !== LOCKS[name]) return say(403, { error: 'secret does not match', code: 'lock_required' });
    TOUCHED[name] = when();
    if (body.append) {
      const entry = body.content && typeof body.content === 'object' ? { ...body.content } : body.content;
      if (entry && typeof entry === 'object' && typeof entry['3'] !== 'string') entry['3'] = when();
      try { return say(200, { ok: true, slot: append(BLOCKS[name], entry) }); } catch (e) { return say(409, { error: e.message }); }
    }
    if (body.spindle) { setAt(BLOCKS[name], body.spindle, body.content); return say(200, { ok: true }); }
    if (body.confirm !== true) return say(400, { error: 'whole-block replace requires {confirm: true}', code: 'confirm_required' });
    BLOCKS[name] = body.content; return say(200, { ok: true });
  });
}
const listen = (fn, port) => new Promise((ok) => { const s = http.createServer(fn); s.listen(port, () => ok(s)); });
const writes = (block) => log.filter((x) => x.method !== 'GET' && (!block || x.block === block));
const reads = (block) => log.filter((x) => x.method === 'GET' && (block === undefined || x.block === block));
const dayLine = (m) => { let n = m; '2_264145'.split('').forEach((d) => { n = n && typeof n === 'object' ? n[d === '0' ? '_' : d] : undefined; }); return n && typeof n === 'object' ? n._ : n; };

(async () => {
  const servers = [await listen(site, SITE), await listen(beach, BEACH)];
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const errors = [], asked = [];
  async function device(store, fold) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 760 } });
    context.setDefaultTimeout(15000);
    const p = await context.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', async (d) => { asked.push(d.message()); const a = (p.__answers || []).shift(); if (a == null) await d.dismiss(); else await d.accept(a); });
    await p.goto(`http://localhost:${SITE}/__test/page.html${fold ? '?fold' : ''}`);
    if (store) { await p.evaluate((s) => Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)), store); await p.reload(); }
    await sleep(600);
    return { context, p };
  }
  seed();

  console.log('\nthe game founded, the plug reads its law and the clock');
  let { context, p } = await device(null, true);
  check('the plug names the game, the beach and the fold from its tag', await p.evaluate(() => [beachGame.game, beachGame.beach, beachGame.fold].join(' ')) === `wire http://127.0.0.1:${BEACH} http://127.0.0.1:${SITE}/api/mirrors`);
  let r = await p.evaluate(() => beachGame.law());
  check('the law is read from function:wire: its board word, order and best per player, its room, its page', r.ok !== false && r.board.word === 'FINISHED' && r.board.lowest && r.board.best && r.room === 'pool:wire' && r.page === 'https://example.org/wire.html' && r.mode === 'game' && /START/.test(r.briefing), r);
  check('today is the beach\'s day, from the clock the beach stamps on every reply: the first eight digits, then 00', (await p.evaluate(() => beachGame.today())) === DAY);
  check('…and a date asked for gives its own day', (await p.evaluate(() => beachGame.today(new Date('2026-10-21T12:00:00Z')))) === '2026413700');

  console.log('\na result kept: the proof in the room, the line in the player\'s own mirror');
  p.__answers = [SECRET];
  r = await p.evaluate((proof) => beachGame.result({ line: 'FINISHED 2.38s', proof, name: 'tester', tries: 5 }), LONG);
  let m = BLOCKS['wire:tester'], room = BLOCKS['pool:wire'];
  check('the browser asked once for tester\'s key, and the mirror was founded ten deep under the passport\'s key', asked.length === 1 && r.ok && r.name === 'tester' && m && floorOf(m) === 10 && LOCKS['wire:tester'] === SECRET, { r, asked, floor: m && floorOf(m) });
  check('the proof, past the cap of a said line, stands in the room as Ghost Wire keeps a run', room['1'] && room['1']['7'] === LONG && room['1']['2'] === DAY && room['1']['1'] === 'tester, a visitor' && room['1']['8'] === '5' && room['1']._ === 'FINISHED 2.38s' && r.slot === '1', room['1']);
  check('…and the line stands in the mirror at the day\'s digits, naming the proof\'s slot', dayLine(m) === 'FINISHED 2.38s · proof pool:wire 1' && r.said && r.address === DAY, { line: dayLine(m), r });
  asked.length = 0;
  r = await p.evaluate(() => beachGame.result({ line: 'FINISHED 4.10s', proof: 'gw1.slow' }));
  check('a slower run goes into the room and leaves the player\'s best standing (best per player), asking nothing', r.ok && !r.said && room['2'] && room['2']['7'] === 'gw1.slow' && dayLine(BLOCKS['wire:tester']) === 'FINISHED 2.38s · proof pool:wire 1' && asked.length === 0, r);
  r = await p.evaluate(() => beachGame.result({ line: 'FINISHED 2.01s', proof: 'gw1.fast' }));
  check('a faster run replaces the line, naming its own slot', r.ok && r.said && r.slot === '3' && dayLine(BLOCKS['wire:tester']) === 'FINISHED 2.01s · proof pool:wire 3', r);
  r = await p.evaluate(() => beachGame.result({ line: 'CAUGHT 14 bats', proof: 'x' }));
  check('a line that does not open with the board\'s word is refused before anything is written', !r.ok && /FINISHED/.test(r.error) && Object.keys(room).length === 4, r);
  r = await p.evaluate(() => beachGame.result({ line: 'FINISHED 9s', proof: 'x', at: 'today-ish' }));
  check('…as is a result at something that is not an address', !r.ok && /not an address/.test(r.error), r);

  console.log('\nthe board: the fold of the players\' mirrors, proofs re-run by the page');
  // two more players, their results as the plug would have kept them
  BLOCKS['wire:ann'] = nested('MIRROR — ann’s readings on the wire family.', 10); LOCKS['wire:ann'] = 'anns-key';
  setAt(BLOCKS['wire:ann'], DAY, 'FINISHED 1.90s · proof pool:wire 4'); room['4'] = { _: 'FINISHED 1.90s', 1: 'ann, a visitor', 2: DAY, 3: '2026-10-26T20:29:00Z', 7: 'gw1.ann' };
  BLOCKS['wire:bob'] = nested('MIRROR — bob’s readings on the wire family.', 10); LOCKS['wire:bob'] = 'bobs-key';
  setAt(BLOCKS['wire:bob'], DAY, 'FINISHED 0.50s · proof pool:wire 5'); room['5'] = { _: 'FINISHED 0.50s', 1: 'bob, a visitor', 2: DAY, 3: '2026-10-26T20:29:30Z', 7: 'gw1.bad' };
  BORN['wire:ann'] = '2026-10-26T08:00:00Z'; BORN['wire:bob'] = '2026-10-26T08:05:00Z'; TOUCHED['wire:ann'] = TOUCHED['wire:bob'] = when();
  folds = 0; const before = reads().length, roomReads = reads('pool:wire').length;
  r = await p.evaluate(() => beachGame.top({ fresh: true }));
  check('without a verify, every player\'s best stands as a claim, lowest first', r.ok && r.top.map((x) => x.name + ' ' + x.score).join(', ') === 'bob 0.5, ann 1.9, tester 2.01' && r.top.every((x) => x.checked === null) && !r.checked, r);
  check('…read through the fold once, with one read of the room for the proofs, and no mirror read straight', folds === 1 && reads('pool:wire').length - roomReads <= 1 && reads('wire:ann').length === 0 && r.through === `http://127.0.0.1:${SITE}/api/mirrors`, { folds, reads: reads().length - before });
  r = await p.evaluate(() => beachGame.top({ verify: (x) => x.proof.indexOf('bad') < 0 }));
  check('with the page\'s verify, bob\'s proof fails and his claim is dropped; the rest are checked', r.ok && r.top.map((x) => x.name).join(',') === 'ann,tester' && r.top.every((x) => x.checked === true) && r.checked && r.top[0].proof.text === 'gw1.ann', r);
  check('…and the fold was not read again within its window', folds === 1, folds);
  r = await p.evaluate(() => beachGame.top({ at: '2026414000', n: 2 }));
  check('the week\'s board gathers the lines beneath its address, cut at n', r.ok && r.at === '2026414000' && r.top.map((x) => x.name).join(',') === 'bob,ann' && r.players === 3, r);
  r = await p.evaluate(() => beachGame.wave());
  check('the wave: each player at the moment they first came, in order, ranking nobody', r.ok && r.players.map((x) => x.name).join(',') === 'ann,bob,tester' && r.count === 3 && r.parts.spark.length + r.parts.tinder.length + r.parts.flame.length === 3, r);
  r = await p.evaluate(() => beachGame.here());
  check('here: who is at the room now by the beach\'s clock, the stale and the elsewhere left out', r.ok && r.here.join(',') === 'ann' && r.room === 'pool:wire', r);
  r = await p.evaluate(() => beachGame.present(true));
  const pres = BLOCKS['presence'];
  check('present: this player takes a slot in presence at the room, as block-conventions 4.6 keeps it', r.ok && pres['4'] && pres['4']['1'] === 'tester' && pres['4']['2'] === 'pool:wire' && typeof pres['4']['3'] === 'string', { r, pres });
  r = await p.evaluate(() => beachGame.present(true));
  check('…overwritten, never doubled, on the next pulse', r.ok && Object.keys(pres).filter((k) => /^[1-9]$/.test(k)).length === 4, pres);
  await p.evaluate(() => beachGame.present(false));

  console.log('\nthe room: its last lines, and a line left in it');
  r = await p.evaluate(() => beachGame.room({ n: 2 }));
  check('the room\'s last lines, newest last, each with its name, words, address and proof', r.ok && r.count === 5 && r.lines.length === 2 && r.lines[0].proof === 'gw1.slow' && r.lines[1].proof === 'gw1.fast' && r.lines[1].name === 'tester' && r.lines[1].at === DAY && r.lines[1].text === 'FINISHED 2.01s', r);
  r = await p.evaluate(() => beachGame.note({ text: 'The wire was kind today.' }));
  check('a note goes into the room under the name this device signs with, about the day', r.ok && r.slot === '6' && room['6']._ === 'The wire was kind today.' && room['6']['1'] === 'tester, a visitor' && room['6']['2'] === DAY && !('7' in room['6']), r);

  console.log('\nthe ready-made elements');
  await p.evaluate(() => Promise.all([document.querySelector('beach-board').refresh(), document.querySelector('beach-room').refresh()]));
  let rows = await p.evaluate(() => Array.from(document.querySelectorAll('beach-board li')).map((li) => li.querySelector('.who').textContent + ' ' + li.querySelector('.score').textContent));
  check('<beach-board> draws the board, verified by the page\'s own function named in its tag, cut at n, the proof\'s slot left off', rows.join('|') === 'ann FINISHED 1.90s|tester FINISHED 2.01s', rows);
  rows = await p.evaluate(() => Array.from(document.querySelectorAll('beach-room li')).map((li) => li.textContent));
  check('<beach-room> draws the room\'s last lines, newest first', rows.length === 3 && /^tester The wire was kind today\./.test(rows[0]) && /^tester FINISHED 2\.01s/.test(rows[1]), rows);
  await p.fill('beach-room textarea', 'From the element.');
  await p.click('beach-room button');
  await sleep(600);
  check('…and its form leaves a line in the room', room['7'] && room['7']._ === 'From the element.' && room['7']['1'] === 'tester, a visitor' && /Thank you/.test(await p.textContent('beach-room .status')), room['7']);
  await context.close();

  console.log('\na newcomer: no name, one tap');
  const fresh = await device(null, false);
  asked.length = 0;
  r = await fresh.p.evaluate(() => beachGame.result({ line: 'FINISHED 3.10s', proof: 'gw1.new' }));
  const born = r.name, key = BLOCKS['wire:' + born] && LOCKS['wire:' + born];
  check('a device that knows no name keeps a result as a starling and four digits, its mirror founded under a key made here, asking nothing', r.ok && r.said && r.made && r.born && /^starling-\d{4}$/.test(born) && /^[a-z]+-[a-z]+-[a-z]+-\d\d$/.test(key || '') && asked.length === 0, { r, key });
  check('…the line at the day\'s digits naming the proof in the room', dayLine(BLOCKS['wire:' + born]) === 'FINISHED 3.10s · proof pool:wire 8' && room['8']['1'] === born + ', a visitor', { line: dayLine(BLOCKS['wire:' + born]) });
  let made = await fresh.p.evaluate(() => beachGame.made());
  check('made hands the page the name and the key once, to be said at the end', made && made.name === born && made.key === key, made);
  check('…and never again', (await fresh.p.evaluate(() => beachGame.made())) === null);
  r = await fresh.p.evaluate(() => beachGame.top({ fresh: true }));
  check('with no fold, the board is read straight from the beach: the index and each mirror', r.ok && r.through === 'beach' && r.top.map((x) => x.name).join(',') === 'bob,ann,tester,' + born && reads('wire:ann').length >= 1 && log.some((x) => x.method === 'GET' && !x.block), r);
  r = await fresh.p.evaluate(() => beachGame.result({ line: 'FINISHED 1.50s', proof: 'gw1.again', name: 'tester' }));
  check('a typed name that is on the beach is a claim: the browser asks its key, and without it the line never lands in tester\'s mirror', !r.ok && r.quiet && asked.length === 1 && dayLine(BLOCKS['wire:tester']) === 'FINISHED 2.01s · proof pool:wire 3', { r, asked: asked.length });
  check('…though the run stands in the open room as a visitor\'s, as Ghost Wire keeps one', room['9'] && room['9']['1'] === 'tester, a visitor' && room['9']['7'] === 'gw1.again', room['9']);
  await fresh.context.close();

  console.log('\nthe law, where it stands');
  seed();
  delete BLOCKS['function:wire'];
  const miss = await device(null, false);
  r = await miss.p.evaluate(() => beachGame.result({ line: 'FINISHED 1s', proof: 'x', name: 'tester' }));
  check('a result for a game with no law on the beach is refused and writes nothing', !r.ok && /no law for wire/.test(r.error) && writes().length === 0, r);
  BLOCKS['game:wire'] = { _: 'GAME:WIRE — Matthew\'s way: a law at game:<name>. Played at https://example.org/gw.html; runs live in pool:wire.', 4: 'board: FINISHED, lowest first, best per player' };
  r = await miss.p.evaluate(() => beachGame.law(true));
  check('a law kept at game:<name>, as Matthew\'s Arcade keeps one, is read the same: its page from its words, its room pool:<game>', r.ok !== false && r.block === 'game:wire' && r.page === 'https://example.org/gw.html' && r.room === 'pool:wire' && r.board.word === 'FINISHED', r);
  await miss.context.close();

  check('no page threw', errors.length === 0, errors);
  await browser.close();
  servers.forEach((x) => x.close());
  console.log(pass ? '\nsmoke:game passed' : '\nsmoke:game FAILED');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
