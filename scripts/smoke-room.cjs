// The room plug (button/room.js) and the ping page (button/ping.html): two pages in one headless Chromium,
// introduced over a mock beach's liquid, joined by real WebRTC data channels over loopback, pinging each
// other direct and relayed, racing a stub Ghost Wire with one page's moves re-run as the other's ghost; a
// page with the direct path off carried by the wire; a leave blanking its slot; and the same again over a
// mock vapour in the Phoenix shape, as the beach would name it at settings 1.3 and 1.4.
//
// Runs offline in headless Chromium (Playwright). CommonJS (.cjs), as this package is ESM:
//   NODE_PATH=$(npm root -g) npm run smoke:room
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('smoke:room needs Playwright — npm i -g playwright && npx playwright install chromium, then NODE_PATH=$(npm root -g) npm run smoke:room'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const SITE = 8795, BEACH = 8796, VAPOUR = 8797;
const NOW = { iso: '2026-10-27T12:00:00Z', address: '2026414654', voicing: 'Tuesday 27 October 2026, midday (beat 4)' };

let pass = true;
const check = (label, ok, detail) => {
  if (!ok) pass = false;
  console.log(`  ${ok ? '✓' : '✗'} ${label}` + (ok || detail === undefined ? '' : `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function until(fn, ms, every) { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(every || 150); } return v; }

// ── the site: the button's files and the stub engine ──
function site(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__test/gw.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(fs.readFileSync(path.join(ROOT, 'scripts/fixtures/ghost-wire-stub.js'), 'utf8')); }
  const file = path.join(ROOT, url.pathname);
  if (!url.pathname.startsWith('/button/') || !file.startsWith(path.join(ROOT, 'button')) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)] || 'text/plain' });
  res.end(fs.readFileSync(file, 'utf8'));
}

// ── the mock beach ──
const BLOCKS = {}, LOCKS = {};
const log = [];
let vapourNamed = false;
const START = Date.now();
const beachNow = () => new Date(Date.parse(NOW.iso) + (Date.now() - START)).toISOString();
function seed() {
  Object.keys(BLOCKS).forEach((k) => { delete BLOCKS[k]; });
  BLOCKS['settings'] = { _: 'Per-beach settings.', 1: { _: 'Vapour subsystem — realtime co-presence transport.', 1: { _: 'vapour_staleness_ms' }, 2: { _: 'vapour_debounce_ms' } } };
  if (vapourNamed) { BLOCKS['settings']['1']['3'] = `vapour_url=ws://127.0.0.1:${VAPOUR}`; BLOCKS['settings']['1']['4'] = { _: 'vapour_key=test-anon-key' }; }
  BLOCKS['pool:wire'] = { _: 'The room of wire.' };
  log.length = 0;
}
function setAt(tree, spindle, value) {
  const s = String(spindle), p = (s.indexOf('.') < 0 ? s.replace(/0+$/, '') : s.replace('.', '')).split('').map((d) => (d === '0' ? '_' : d));
  let n = tree;
  p.slice(0, -1).forEach((d) => { if (typeof n[d] === 'string') n[d] = { _: n[d] }; else if (!n[d] || typeof n[d] !== 'object') n[d] = {}; n = n[d]; });
  n[p[p.length - 1]] = value;
}
function shapeOk(v) {
  if (v == null) return true;
  if (typeof v === 'string') { const t = v.trim(); return !(t.length > 1 && (t[0] === '{' || t[0] === '[')); }
  if (typeof v !== 'object') return true;
  return Object.keys(v).every((k) => (k === '_' || /^[1-9]$/.test(k)) && shapeOk(v[k]));
}
function append(block, entry) {
  for (let i = 1; i <= 9; i++) if (!(String(i) in block)) { block[String(i)] = entry; return String(i); }
  throw new Error('the mock liquid is full');
}
let delay = 0;   // the beach's own slowness, when a test wants it
const muted = new Set();   // players whose writes the beach refuses, when a test wants the wire quiet
const slow = new Set();    // players whose writes, all but a goodbye, the beach answers late, when a test wants one on its way
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
    let lag = delay;
    try { const b = raw ? JSON.parse(raw) : {}; if (b.content && typeof b.content === 'object' && slow.has(b.content['1']) && b.content._ !== '') lag += 600; } catch (e) {}
    setTimeout(() => {
    const url = new URL(req.url, 'http://x'), body = raw ? JSON.parse(raw) : {};
    const name = url.searchParams.get('block') || body.block;
    const say = (status, d) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(d)); };
    log.push({ method: req.method, block: name, body });
    if (req.method === 'GET' && !name) return say(200, { blocks: Object.keys(BLOCKS), now: NOW });
    if (req.method === 'GET') { const b = BLOCKS[name]; return b ? say(200, b) : say(404, { error: `block "${name}" not found`, code: 'not_found' }); }
    if (!shapeOk(body.content)) return say(400, { error: 'shape', code: 'shape' });
    if (body.content && typeof body.content === 'object' && muted.has(body.content['1'])) return say(503, { error: 'refused for the test', code: 'unavailable' });
    if (body.append) {
      if (!BLOCKS[name]) BLOCKS[name] = { _: `Liquid pre-commit buffer for ${name}` };
      const entry = body.content && typeof body.content === 'object' ? { ...body.content } : body.content;
      if (entry && typeof entry === 'object' && typeof entry['3'] !== 'string') entry['3'] = beachNow();
      try { return say(200, { ok: true, slot: append(BLOCKS[name], entry) }); } catch (e) { return say(409, { error: e.message }); }
    }
    if (!BLOCKS[name]) { if (body.spindle) return say(404, { error: 'not found', code: 'not_found' }); BLOCKS[name] = body.content; return say(200, { ok: true, born: true }); }
    if (LOCKS[name] && body.secret !== LOCKS[name]) return say(403, { error: 'secret does not match', code: 'lock_required' });
    if (body.spindle) { setAt(BLOCKS[name], body.spindle, body.content); return say(200, { ok: true }); }
    if (body.confirm !== true) return say(400, { error: 'confirm', code: 'confirm_required' });
    BLOCKS[name] = body.content; return say(200, { ok: true });
    }, lag);
  });
}

// ── the mock vapour: Supabase Realtime's Phoenix shape over a bare WebSocket ──
const vapour = { sockets: new Set(), joins: [], broadcasts: 0 };
function frame(text) {
  const b = Buffer.from(text), len = b.length;
  const head = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.concat([Buffer.from([0x81, 126]), Buffer.from([len >> 8, len & 255])]) : Buffer.concat([Buffer.from([0x81, 127]), Buffer.from([0, 0, 0, 0, len >>> 24, (len >> 16) & 255, (len >> 8) & 255, len & 255])]);
  return Buffer.concat([head, b]);
}
function frames(buf) {
  const out = []; let i = 0;
  while (i + 2 <= buf.length) {
    const op = buf[i] & 15, masked = buf[i + 1] & 128; let len = buf[i + 1] & 127, j = i + 2;
    if (len === 126) { len = buf.readUInt16BE(j); j += 2; } else if (len === 127) { len = Number(buf.readBigUInt64BE(j)); j += 8; }
    let mask = null; if (masked) { mask = buf.slice(j, j + 4); j += 4; }
    if (j + len > buf.length) break;
    const data = Buffer.from(buf.slice(j, j + len));
    if (mask) for (let k = 0; k < data.length; k++) data[k] ^= mask[k & 3];
    out.push({ op, data }); i = j + len;
  }
  return { frames: out, rest: buf.slice(i) };
}
function vapourServer() {
  const s = http.createServer((req, res) => { res.writeHead(426); res.end(); });
  s.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    const me = { socket, topics: new Set(), url: req.url };
    vapour.sockets.add(me);
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const got = frames(buf); buf = got.rest;
      got.frames.forEach(({ op, data }) => {
        if (op === 8) { socket.end(); return; }
        if (op === 9) { socket.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); return; }
        if (op !== 1) return;
        let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
        if (m.event === 'phx_join') { me.topics.add(m.topic); vapour.joins.push({ topic: m.topic, payload: m.payload }); socket.write(frame(JSON.stringify({ topic: m.topic, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: m.ref }))); return; }
        if (m.event === 'heartbeat') { socket.write(frame(JSON.stringify({ topic: 'phoenix', event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: m.ref }))); return; }
        if (m.event === 'broadcast') {
          vapour.broadcasts++;
          const out = frame(JSON.stringify({ topic: m.topic, event: 'broadcast', payload: m.payload, ref: null }));
          vapour.sockets.forEach((o) => { if (o !== me && o.topics.has(m.topic)) o.socket.write(out); });
        }
      });
    });
    socket.on('close', () => vapour.sockets.delete(me));
    socket.on('error', () => vapour.sockets.delete(me));
  });
  return new Promise((ok) => s.listen(VAPOUR, () => ok(s)));
}

const listen = (fn, port) => new Promise((ok) => { const s = http.createServer(fn); s.listen(port, () => ok(s)); });
const slotsOf = (block) => Object.keys(block || {}).filter((k) => /^[1-9]$/.test(k)).map((k) => block[k]);
const slotNamed = (name) => slotsOf(BLOCKS['liquid:pool:wire']).filter((e) => e['1'] === name).pop();

(async () => {
  const servers = [await listen(site, SITE), await listen(beach, BEACH), await vapourServer()];
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 420, height: 820 } });
  context.setDefaultTimeout(15000);
  async function phone(name, extra) {
    const p = await context.newPage();
    p.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    await p.goto(`http://localhost:${SITE}/button/ping.html?room=wire&name=${name}&auto=1&beach=${encodeURIComponent('http://127.0.0.1:' + BEACH)}&engine=${encodeURIComponent('http://localhost:' + SITE + '/__test/gw.js')}${extra || ''}`);
    await p.evaluate(() => { window.__got = []; window.beachRoom && beachRoom.on('message', (m) => window.__got.push(m)); });
    return p;
  }
  const state = (p) => p.evaluate(() => pingPage.state());
  const peerNamed = async (p, name) => (await state(p)).peers.filter((x) => x.name === name)[0];
  const UP = []; for (let i = 0; i < 72; i++) UP.push([0, -20]);   // seventy steps up the straight wire, then still

  seed();
  console.log('\nthe room over the beach\'s liquid: introduced, then direct');
  const ann = await phone('ann');
  let st = await until(async () => { const s = await state(ann); return s.joined ? s : null; }, 8000);
  check('ann enters the room: the wire is the beach\'s liquid, since the beach names no vapour', st && st.joined.ok && st.joined.wire === 'beach' && !st.joined.named && st.joined.name === 'ann' && st.joined.room === 'pool:wire', st && st.joined);
  let slot = slotNamed('ann');
  check('…and takes one slot in liquid:pool:wire: a pending intention in words, her name, the room, the clock, and her mailbox at 7', slot && /^ann is in the room/.test(slot._) && slot['2'] === 'pool:wire' && typeof slot['3'] === 'string' && typeof slot['6'] === 'string' && typeof slot['7'] === 'string' && !/^[{[]/.test(slot['7']), slot);
  check('the page shows the engine and the race, and nobody else yet', st.engine && (await ann.isVisible('#c')) && (await ann.isVisible('#none')));
  const bob = await phone('bob');
  let pair = await until(async () => { const a = await peerNamed(ann, 'bob'), b = await peerNamed(bob, 'ann'); return a && b && a.direct && b.direct ? [a, b] : null; }, 15000);
  check('bob enters, and within seconds each page holds a direct data channel to the other, introduced by one offer and one answer through the liquid', !!pair, pair || { ann: (await state(ann)).peers, bob: (await state(bob)).peers });
  const intro = log.filter((x) => x.method === 'POST' && x.block === 'liquid:pool:wire');
  check('…the introduction cost the beach a handful of slot writes, and one slot per player', intro.length <= 14 && slotsOf(BLOCKS['liquid:pool:wire']).length === 2, { writes: intro.length, slots: slotsOf(BLOCKS['liquid:pool:wire']).length });
  pair = await until(async () => { const a = await peerNamed(ann, 'bob'), b = await peerNamed(bob, 'ann'); return a && b && a.ping.direct != null && b.ping.direct != null && a.ping.relayed != null && b.ping.relayed != null && a.ping.theirs.direct != null ? [a, b] : null; }, 15000);
  check('each sees their ping both ways: direct over the channel, relayed through the liquid, and the other\'s own numbers', !!pair, pair || { ann: (await state(ann)).peers, bob: (await state(bob)).peers });
  if (pair) check('…the direct ping is milliseconds over loopback, the relayed one the beach\'s poll (a second or two)', pair[0].ping.direct < 200 && pair[0].ping.relayed >= 100 && pair[0].ping.theirs.direct < 200, pair[0].ping);
  let rows = await ann.evaluate(() => Array.from(document.querySelectorAll('#peers li')).map((li) => li.textContent));
  check('the page lists bob as direct, player to player, with both rows of pings', rows.length === 1 && /bob/.test(rows[0]) && /direct, player to player/.test(rows[0]) && /you → them → you/.test(rows[0]) && /them → you → them/.test(rows[0]) && !/—/.test(rows[0]), rows);

  console.log('\nwords and moves, player to player');
  let via = await ann.evaluate(() => beachRoom.send('hi', { n: 1 }, { reliable: true }));
  let got = await until(() => bob.evaluate(() => window.__got.filter((m) => m.kind === 'hi')[0]), 3000);
  check('a message goes over the events channel and arrives direct, with who sent it', via === 'direct' && got && got.name === 'ann' && got.body.n === 1 && got.via === 'direct', { via, got });
  via = await ann.evaluate(() => beachRoom.send('pos', { x: 1 }, { reliable: false }));
  got = await until(() => bob.evaluate(() => window.__got.filter((m) => m.kind === 'pos')[0]), 3000);
  check('…and an unreliable one over the state channel', via === 'direct' && got && got.via === 'direct', { via, got });
  await ann.evaluate((mv) => pingPage.run(mv), UP);
  let ghost = await until(async () => { const s = await state(bob); return s.ghosts.ann && s.ghosts.ann.status === 'finished' ? s.ghosts.ann : null; }, 8000);
  const mine = (await state(ann)).mine;
  check('ann races: her moves stream as the engine records them, and bob\'s page re-runs them as her ghost to the finish, the replay re-run and checked', ghost && ghost.checked === true && ghost.steps === 70 && mine && mine.status === 'finished' && mine.steps === 70 && ghost.via === 'direct', { ghost, mine });
  check('…her page says so', /Finished in 1\.17 s/.test(await ann.textContent('#say')) && /ann: finished in 1\.17 s ✓ re-run here/.test(await bob.textContent('#ghosts')), [await ann.textContent('#say'), await bob.textContent('#ghosts')]);
  await bob.click('#race');
  st = await until(async () => { const s = await state(ann); return s.countdown ? s : null; }, 3000);
  const counting = await until(() => ann.evaluate(() => /…/.test(document.getElementById('count').textContent)), 2000);
  check('bob counts the room down: ann\'s page shows it', !!st && counting);
  st = await until(async () => { const s = await state(ann); return s.phase === 'running' || (s.mine && s.mine.status === 'running') ? s : null; }, 5000);
  check('…and both run at GO', !!st && (await state(bob)).phase === 'running', st && st.phase);

  console.log('\na pair the direct path cannot join: carried by the wire');
  const cid = await phone('cid', '&direct=off');
  let rel = await until(async () => { const a = await peerNamed(ann, 'cid'), c = await peerNamed(cid, 'ann'); return a && c && a.status === 'relayed' && !a.direct && !c.direct ? [a, c] : null; }, 15000);
  check('cid, with no direct path, is introduced and stands relayed on both pages (ann\'s offer answered as refused)', !!rel, rel || { ann: (await state(ann)).peers, cid: (await state(cid)).peers });
  via = await ann.evaluate(() => { const c = beachRoom.peers().filter((p) => p.name === 'cid')[0]; return beachRoom.send('hi', { n: 2 }, { to: c.id, reliable: true }); });
  got = await until(() => cid.evaluate(() => window.__got.filter((m) => m.kind === 'hi')[0]), 6000);
  check('a message to cid goes over the wire and arrives relayed', via === 'relayed' && got && got.via === 'relayed' && got.body.n === 2, { via, got });
  rel = await until(async () => { const c = await peerNamed(cid, 'ann'); return c && c.ping.relayed != null ? c : null; }, 12000);
  check('…and cid\'s page shows the relayed ping, the direct one standing empty', rel && rel.ping.direct == null, rel);
  rows = await cid.evaluate(() => Array.from(document.querySelectorAll('#peers li')).map((li) => li.textContent));
  check('the page says relayed over the wire', rows.some((r) => /ann/.test(r) && /relayed over the wire/.test(r)), rows);
  await cid.evaluate((mv) => pingPage.run(mv), UP);
  ghost = await until(async () => { const s = await state(ann); return s.ghosts.cid && s.ghosts.cid.status === 'finished' ? s.ghosts.cid : null; }, 15000);
  check('cid\'s race reaches ann relayed, slowly, and still re-runs to the finish', ghost && ghost.checked === true && ghost.via === 'relayed', ghost);

  console.log('\nleaving');
  await bob.evaluate(() => beachRoom.leave());
  slot = await until(() => { const s = slotNamed('bob'); return s && s._ === '' && !('7' in s) ? s : null; }, 3000);
  check('bob leaves: his slot in the liquid is blanked, the mailbox gone', !!slot, slotNamed('bob'));
  st = await until(async () => { const s = await state(ann); return !s.peers.some((p) => p.name === 'bob') ? s : null; }, 6000);
  check('…and ann\'s page lets him go', !!st && !/bob/.test(await ann.textContent('#peers')));
  check('nothing was written anywhere but the room\'s liquid', log.filter((x) => x.method !== 'GET').every((x) => x.block === 'liquid:pool:wire'), log.filter((x) => x.method !== 'GET' && x.block !== 'liquid:pool:wire'));
  await ann.close(); await cid.close(); await bob.close();

  console.log('\nthe room over the vapour the beach names');
  vapourNamed = true; seed(); vapour.joins.length = 0; vapour.broadcasts = 0;
  const dan = await phone('dan'), eve = await phone('eve');
  st = await until(async () => { const s = await state(dan); return s.joined ? s : null; }, 10000);
  check('dan enters over the vapour named at settings 1.3 and 1.4, joining the room\'s topic in the Phoenix shape', st && st.joined.wire === 'vapour' && st.joined.named && vapour.joins.some((j) => j.topic === 'realtime:beach-room:127.0.0.1:pool:wire' && j.payload.config.broadcast.self === false), { joined: st && st.joined, joins: vapour.joins });
  pair = await until(async () => { const a = await peerNamed(dan, 'eve'), b = await peerNamed(eve, 'dan'); return a && b && a.direct && b.direct && a.ping.relayed != null && b.ping.direct != null ? [a, b] : null; }, 15000);
  check('dan and eve are introduced by broadcast and hold a direct channel; the relayed ping rides the vapour', !!pair, pair || { dan: (await state(dan)).peers, eve: (await state(eve)).peers });
  if (pair) check('…in milliseconds either way', pair[0].ping.relayed < 500 && pair[0].ping.direct < 200, pair[0].ping);
  check('nothing of the vapour touched the beach: no liquid slot was written', !BLOCKS['liquid:pool:wire'] && log.filter((x) => x.method !== 'GET').length === 0, log.filter((x) => x.method !== 'GET'));
  await eve.evaluate((mv) => pingPage.run(mv), UP);
  ghost = await until(async () => { const s = await state(dan); return s.ghosts.eve && s.ghosts.eve.status === 'finished' ? s.ghosts.eve : null; }, 8000);
  check('eve\'s race re-runs on dan\'s page, direct', ghost && ghost.checked === true && ghost.via === 'direct', ghost);
  await eve.evaluate(() => beachRoom.leave());
  st = await until(async () => { const s = await state(dan); return !s.peers.some((p) => p.name === 'eve') ? s : null; }, 5000);
  check('eve leaves with a bye over the vapour, and dan\'s page lets her go at once', !!st);
  await dan.close(); await eve.close();

  console.log('\nthe anteroom: one name twice, slots reused, the host, a start together, a room by link, <beach-here>');
  vapourNamed = false; seed();
  const slotsAt = (room) => slotsOf(BLOCKS['liquid:' + room]);
  const fay1 = await phone('fay'), fay2 = await phone('fay');
  pair = await until(async () => { const a = (await state(fay1)).peers[0], b = (await state(fay2)).peers[0]; return a && b && a.name === 'fay' && b.name === 'fay' && a.direct && b.direct ? [a, b] : null; }, 15000);
  check('two players of one name meet and hold a direct channel: a slot is a player\'s by id, never by name', !!pair, { fay1: (await state(fay1)).peers, fay2: (await state(fay2)).peers });
  check('…each in a slot of their own', slotsAt('pool:wire').filter((e) => e['1'] === 'fay' && typeof e['7'] === 'string').length === 2, slotsAt('pool:wire'));
  const hosts = await Promise.all([fay1, fay2].map((p) => p.evaluate(() => ({ host: beachRoom.host(), me: beachRoom.me().id }))));
  const lowest = [hosts[0].me, hosts[1].me].sort()[0];
  check('both pages name the same host, the lower id, and each knows whether it is theirs', hosts[0].host.id === lowest && hosts[1].host.id === lowest && hosts.filter((h) => h.host.me).length === 1, hosts);
  const caller = hosts[0].host.me ? fay2 : fay1, other = caller === fay1 ? fay2 : fay1;
  await other.evaluate(() => { window.__starts = []; beachRoom.on('start', (x) => window.__starts.push(x)); });
  await caller.evaluate(() => { window.__starts = []; beachRoom.on('start', (x) => window.__starts.push(x)); });
  const called = await caller.evaluate(() => beachRoom.start({ in: 2000, body: { level: 7 } }));
  const heard = await until(() => other.evaluate(() => window.__starts[0]), 3000);
  const own = await caller.evaluate(() => window.__starts[0]);
  check('a start called on one page fires on both: the caller\'s own at once, the other\'s with the milliseconds left and what was said', called.ok && own && own.me === true && own.in === 2000 && heard && heard.me === false && heard.in > 1000 && heard.in <= 2000 && heard.body.level === 7 && heard.via === 'direct', { called, own, heard });
  const others = (await phone('gus'));
  await until(async () => ((await state(others)).peers.length === 2 ? 1 : 0), 15000);
  const three = [fay1, fay2, others];
  await until(async () => { const hs = await Promise.all(three.map((p) => p.evaluate(() => beachRoom.host().id))); return hs.every((h) => h === hs[0]) ? hs : null; }, 6000);
  const roles = await Promise.all(three.map((p) => p.evaluate(() => beachRoom.host())));
  const hostIx = roles.findIndex((h) => h.me), hostPage = three[hostIx], hostId = roles[hostIx].id, rest = three.filter((p, i) => i !== hostIx);
  await Promise.all(rest.map((p) => p.evaluate(() => { window.__hosts = []; beachRoom.on('host', (h) => window.__hosts.push(h)); })));
  await hostPage.evaluate(() => beachRoom.leave());
  const leftAt = Date.now();
  const both = await until(async () => { const hs = await Promise.all(rest.map((p) => p.evaluate(() => beachRoom.host()))); return hs[0] && hs[1] && hs[0].id !== hostId && hs[0].id === hs[1].id ? hs : null; }, 6000);
  const fired = await Promise.all(rest.map((p) => p.evaluate(() => window.__hosts.length)));
  check('the host leaves, and the host is handed on at once: both pages left name the same new one, and \'host\' fired on each', !!both && fired.every((n) => n >= 1), { roles, both, fired, ms: Date.now() - leftAt });
  const beforeSlots = slotsAt('pool:wire').length;
  const hal = await phone('hal');
  await until(async () => ((await state(hal)).joined ? 1 : 0), 8000);
  check('a newcomer takes the blank slot the leaver left, so the liquid does not grow', slotsAt('pool:wire').length === beforeSlots && slotsAt('pool:wire').some((e) => e['1'] === 'hal'), { before: beforeSlots, after: slotsAt('pool:wire').length });

  const ivy = await phone('ivy', '&with=friday'), jon = await phone('jon', '&with=friday');
  pair = await until(async () => { const a = (await state(ivy)).peers, b = (await state(jon)).peers; return a.length === 1 && b.length === 1 && a[0].name === 'jon' && a[0].direct ? [a, b] : null; }, 15000);
  const ivyRoom = await ivy.evaluate(() => ({ room: beachRoom.room(), link: beachRoom.link() }));
  check('a room by link: ?with=friday puts ivy and jon in pool:wire:friday, together and apart from the open room', !!pair && ivyRoom.room === 'pool:wire:friday' && !!BLOCKS['liquid:pool:wire:friday'] && slotsAt('pool:wire:friday').length === 2, { ivyRoom, peers: pair, slots: slotsAt('pool:wire:friday').length });
  check('…and link() hands on the same room\'s address', /[?&]with=friday(&|$)/.test(ivyRoom.link) && /\/button\/ping\.html\?/.test(ivyRoom.link), ivyRoom.link);
  await Promise.all([ivy, jon].map((p) => p.evaluate(() => { const h = document.createElement('beach-here'); h.id = 'here'; document.body.appendChild(h); })));
  const drawn = await until(() => ivy.evaluate(() => { const t = document.getElementById('here').textContent; return /Here: ivy \(you/.test(t) && /jon/.test(t) && /Start together/.test(t) && /Share this room/.test(t) ? t : null; }), 4000);
  check('<beach-here> draws the anteroom: who is here and how, the host, Start together, and the room\'s link to share', !!drawn, await ivy.evaluate(() => document.getElementById('here').textContent));
  await ivy.click('#here .bh-go');
  const counted = await until(() => jon.evaluate(() => { const c = document.querySelector('#here .bh-count').textContent; return /ivy started it: [1-3]/.test(c) ? c : null; }), 3000);
  const went = await until(() => jon.evaluate(() => (document.querySelector('#here .bh-count').textContent === 'Go' ? 'Go' : null)), 5000);
  check('…its Start together counts both pages down to Go', !!counted && went === 'Go', { counted, went });

  await hal.evaluate(() => { const h = document.createElement('beach-here'); h.id = 'here'; document.body.appendChild(h); });
  await until(() => hal.evaluate(() => (/A room for friends/.test(document.getElementById('here').textContent) ? 1 : 0)), 4000);
  await hal.click('#here .bh-friends');
  const offered = await hal.evaluate(() => ({ shown: !document.querySelector('#here .bh-ask').hidden, word: document.querySelector('#here .bh-word').value, see: document.querySelector('#here .bh-see').textContent }));
  check('in the open room, A room for friends asks for a word, offering an easy one and showing the link it makes', offered.shown && /^[a-z]+-[a-z]+-\d\d$/.test(offered.word) && offered.see.includes('with=' + offered.word), offered);
  await hal.fill('#here .bh-word', 'Friday Night!');
  const typed = await hal.evaluate(() => document.querySelector('#here .bh-see').textContent);
  await Promise.all([hal.waitForURL(/[?&]with=friday-night(&|$)/, { timeout: 8000 }), hal.click('#here .bh-make')]);
  const there = await until(() => hal.evaluate(() => (window.beachRoom && beachRoom.joined() && beachRoom.room() === 'pool:wire:friday-night' ? beachRoom.room() : null)), 10000);
  check('…a word typed as said (\'Friday Night!\') becomes the link\'s word, and going there takes the page into that room', /with=friday-night(&|$)/.test(typed) && there === 'pool:wire:friday-night', { typed, there, url: hal.url() });

  const kit = await phone('kit'), lee = await phone('lee');
  await until(async () => { const a = await peerNamed(kit, 'lee'); return a && a.direct ? a : null; }, 15000);
  muted.add('kit');
  console.log('    (the beach refusing kit\'s writes for half a minute, past the time a quiet slot counts as gone)');
  await sleep(31000);
  const still = await peerNamed(lee, 'kit');
  await lee.evaluate(() => { window.__got = []; });
  const sent = await kit.evaluate(() => { const l = beachRoom.peers().filter((p) => p.name === 'lee')[0]; return beachRoom.send('still', { n: 3 }, { to: l.id, reliable: true }); });
  const arrivedDirect = await until(() => lee.evaluate(() => window.__got.filter((m) => m.kind === 'still')[0]), 3000);
  muted.delete('kit');
  check('a pair joined directly lives on its own channel: half a minute of kit\'s slot going quiet on the wire does not part them', still && still.direct && sent === 'direct' && arrivedDirect && arrivedDirect.via === 'direct', { still, sent, arrivedDirect });

  const mo = await phone('mo', '&direct=off&with=late'), ned = await phone('ned', '&with=late');
  await until(async () => { const a = await peerNamed(mo, 'ned'); return a && a.status === 'relayed' ? a : null; }, 15000);
  slow.add('mo');
  console.log('    (the beach answering mo\'s writes late, so his leave comes while one is on its way and the next waits on it)');
  await mo.evaluate(async () => {
    const ned = beachRoom.peers().filter((p) => p.name === 'ned')[0], wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    beachRoom.send('busy', { n: 1 }, { to: ned.id, reliable: true });
    await wait(300);
    beachRoom.send('busy', { n: 2 }, { to: ned.id, reliable: true });
    await wait(200);
    return beachRoom.leave();
  });
  await sleep(2000);
  slow.delete('mo');
  const moSlot = slotsAt('pool:wire:late').filter((e) => e['1'] === 'mo').pop();
  check('a leave while a write is still on its way: the goodbye is the last word, and the slot stands blank', !!moSlot && moSlot._ === '' && !('7' in moSlot), moSlot);

  const guest = await context.newPage();
  guest.on('pageerror', (e) => errors.push('guest: ' + e.message));
  const guestUrl = `http://localhost:${SITE}/button/ping.html?room=wire&auto=1&beach=${encodeURIComponent('http://127.0.0.1:' + BEACH)}&engine=${encodeURIComponent('http://localhost:' + SITE + '/__test/gw.js')}`;
  await guest.goto(guestUrl);
  const g1 = await until(async () => { const s = await guest.evaluate(() => pingPage.state()); return s.joined && s.joined.ok ? s.joined.name : null; }, 8000);
  await guest.reload();
  const g2 = await until(async () => { const s = await guest.evaluate(() => pingPage.state()); return s.joined && s.joined.ok ? s.joined.name : null; }, 8000);
  check('a guest with no name keeps one from visit to visit: a reload is the same guest', /^guest-\d{4}$/.test(g1 || '') && g1 === g2, { g1, g2 });
  await Promise.all([fay1, fay2, others, hal, ivy, jon, kit, lee, mo, ned, guest].map((p) => p.close().catch(() => {})));

  check('no page threw', errors.length === 0, errors);
  await browser.close();
  servers.forEach((s) => s.close());
  console.log(pass ? '\nsmoke:room passed' : '\nsmoke:room FAILED');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
