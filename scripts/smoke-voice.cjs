// The beach's voice (button/voice.js) on a plain page, as a page that takes words would use it.
//
// With no beach button the page's own text entry speaks: the name the page passes, and the key the
// browser keeps or asks for once. Turned on, the button stands on the page and the same call goes
// through it, and the person's choice is kept in their own settings on the beach (settings:<handle>
// 9.1), so another device that knows their name shows it too. A mock beach holds the blocks and
// refuses a wrong key, and a name with a passport takes only the passport's key (handle_bound).
//
// Runs offline in headless Chromium (Playwright). CommonJS (.cjs), as this package is ESM:
//   NODE_PATH=$(npm root -g) npm run smoke:voice
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('smoke:voice needs Playwright — npm i -g playwright && npx playwright install chromium, then NODE_PATH=$(npm root -g) npm run smoke:voice'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const SITE = 8775, BEACH = 8776;
const VOICE = `http://127.0.0.1:${SITE}/button/voice.js`;
const SECRET = 'correct horse battery';
const READING = 'The Walkman, on the bus to school.';

let pass = true;
const check = (label, ok, detail) => {
  if (!ok) pass = false;
  console.log(`  ${ok ? '✓' : '✗'} ${label}` + (ok || detail === undefined ? '' : `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// a page that takes words, as an o-page would: it carries the voice and nothing else of the beach's
const page = (extra) => `<!doctype html><html><head><meta charset="utf-8"><title>a page that takes words</title></head>
<body${extra || ''}><h1>Readings</h1>
<script src="${VOICE}" data-beach="http://127.0.0.1:${BEACH}"></script>
<script>window.__turns = []; beachVoice.onButton(function (on) { __turns.push(on); });</script></body></html>`;
function site(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__test/page.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page()); }
  if (url.pathname === '/__test/off.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page(' data-beach-button="off"')); }
  if (url.pathname === '/__test/framer.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(`<!doctype html><iframe id="f" src="/__test/page.html" style="width:600px;height:400px"></iframe>`); }
  const file = path.join(ROOT, url.pathname);
  if (!url.pathname.startsWith('/button/') || !file.startsWith(path.join(ROOT, 'button')) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file, 'utf8');
  // test only: let the frame reach the mock beach (the published CSP names only the real one)
  if (url.pathname.endsWith('frame.html')) body = body.replace('https://api.anthropic.com;', `https://api.anthropic.com http://127.0.0.1:${BEACH};`);
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)] || 'text/plain' });
  res.end(body);
}

// ── the mock beach ──
const BLOCKS = {}, LOCKS = {}, FLOORS = { 'spine:clock': 10 };
const log = [];
function seed() {
  Object.keys(BLOCKS).forEach((k) => { delete BLOCKS[k]; delete LOCKS[k]; });
  BLOCKS['passport:tester'] = { _: 'tester — a person testing the voice' }; LOCKS['passport:tester'] = SECRET;
  BLOCKS['spine:reflexive-reading'] = { _: 'Reading this reflexively.', 1: { _: 'Most charts ask you to take in information…' } };
  BLOCKS['spine:clock'] = { _: 'A family on the clock.' };
  log.length = 0;
}
function setAt(tree, spindle, value) {
  const p = String(spindle).replace('.', '').split('');
  let n = tree;
  p.slice(0, -1).forEach((d) => { if (typeof n[d] === 'string') n[d] = { _: n[d] }; else if (!n[d] || typeof n[d] !== 'object') n[d] = {}; n = n[d]; });
  const last = p[p.length - 1];
  if (n[last] && typeof n[last] === 'object' && (value === null || typeof value !== 'object')) n[last]._ = value; else n[last] = value;
}
function beach(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x'), body = raw ? JSON.parse(raw) : {};
    const name = url.searchParams.get('block') || body.block;
    const say = (status, d) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(d)); };
    log.push({ method: req.method, block: name, body });
    if (req.method === 'GET' && !name) return say(200, { blocks: Object.keys(BLOCKS) });
    if (req.method === 'GET') {
      const b = BLOCKS[name];
      if (!b) return say(404, { error: 'not found', code: 'not_found' });
      return say(200, url.searchParams.has('pscale') ? { floor: FLOORS[name] || 1, shape: 'disc', entries: [] } : b);
    }
    // a block named for a handle with a passport takes only the passport's key
    const hand = /:([^:]+)$/.exec(name || ''), bound = hand && BLOCKS['passport:' + hand[1]] && name !== 'passport:' + hand[1] ? LOCKS['passport:' + hand[1]] : null;
    if (req.method === 'DELETE') {
      if (!BLOCKS[name]) return say(404, { error: 'not found', code: 'not_found' });
      if (body.secret !== LOCKS[name]) return say(403, { error: 'secret does not match', code: 'lock_required' });
      delete BLOCKS[name]; delete LOCKS[name]; return say(200, { ok: true });
    }
    if (!BLOCKS[name]) {
      if (body.spindle) return say(404, { error: 'not found', code: 'not_found' });
      if (bound && (body.secret !== bound || body.new_lock !== bound)) return say(403, { error: 'this name has a passport; prove its key', code: 'handle_bound' });
      BLOCKS[name] = body.content; if (body.new_lock) LOCKS[name] = body.new_lock;
      return say(200, { ok: true, born: true });
    }
    if (LOCKS[name] && body.secret !== LOCKS[name]) return say(403, { error: 'secret does not match', code: 'lock_required' });
    if (body.spindle) { setAt(BLOCKS[name], body.spindle, body.content); return say(200, { ok: true }); }
    if (body.confirm !== true) return say(400, { error: 'whole-block replace requires {confirm: true}', code: 'confirm_required' });
    BLOCKS[name] = body.content; return say(200, { ok: true });
  });
}
const listen = (fn, port) => new Promise((ok) => { const s = http.createServer(fn); s.listen(port, () => ok(s)); });
const writes = (block) => log.filter((x) => x.method !== 'GET' && (!block || x.block === block));

(async () => {
  const servers = [await listen(site, SITE), await listen(beach, BEACH)];
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const errors = [], asked = [];
  async function device(store) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 760 } });
    context.setDefaultTimeout(15000);
    const p = await context.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('dialog', async (d) => { asked.push(d.message()); const a = (p.__answers || []).shift(); if (a == null) await d.dismiss(); else await d.accept(a); });
    await p.goto(`http://localhost:${SITE}/__test/page.html`);
    if (store) { await p.evaluate((s) => Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)), store); await p.reload(); }
    return { context, p };
  }
  const up = (p) => p.evaluate(() => beachVoice.button.shown());
  async function until(p, want, ms = 5000) { for (let t = 0; t < ms && (await up(p)) !== want; t += 100) await sleep(100); return (await up(p)) === want; }
  seed();

  console.log('\nno button: the page\'s own text entry speaks');
  let { context, p } = await device();
  await sleep(800);
  check('a page carrying the voice shows no button until the person turns it on', !(await up(p)) && (await p.locator('iframe[title="beach button"]').count()) === 0);
  let r = await p.evaluate(() => beachVoice.say({ field: 'reflexive-reading', at: '1.2', text: 'no name given' }));
  check('with no name, nothing is written and the page is told to ask for one', !r.ok && r.needName && writes().length === 0, r);
  r = await p.evaluate(() => beachVoice.say({ field: 'no-such-family', at: '1', text: 'hello', name: 'tester' }));
  check('a family that does not stand is refused before anyone is asked for a key', !r.ok && /no family called no-such-family/.test(r.error) && asked.length === 0 && writes().length === 0, r);
  p.__answers = ['a wrong key', SECRET];
  asked.length = 0;
  r = await p.evaluate((t) => beachVoice.say({ field: 'reflexive-reading', at: '1.2', text: t, name: 'tester' }), READING);
  let m = BLOCKS['reflexive-reading:tester'];
  check('the first reading asks for the key in the browser\'s own prompt, and again when the beach refuses it', asked.length === 2 && /locked to you/.test(asked[0]) && /passport/.test(asked[1]), asked);
  check('…founds the mirror under the passport\'s key, and the reading stands at its address', r.ok && r.name === 'tester' && LOCKS['reflexive-reading:tester'] === SECRET && m && m['1']['2'] === READING, { r, m });
  const kept = await p.evaluate(() => [localStorage.getItem('next-latch:reflexive-reading:tester'), localStorage.getItem('render:who')]);
  check('…the key is kept on this device, and the name is the one it signs with', kept[0] === SECRET && kept[1] === 'tester', kept);
  asked.length = 0;
  r = await p.evaluate(() => beachVoice.say({ field: 'reflexive-reading', at: '1.2', text: 'Said again, it replaces.' }));
  check('saying again asks nothing, takes the kept name, and replaces the reading', r.ok && asked.length === 0 && BLOCKS['reflexive-reading:tester']['1']['2'] === 'Said again, it replaces.', r);
  r = await p.evaluate(() => beachVoice.keep({ field: 'clock', content: { 1: 'a whole day' } }));
  check('a family on the clock is never kept whole', !r.ok && /keeps time/.test(r.error), r);
  r = await p.evaluate(() => beachVoice.ask('who came early?'));
  check('a question has nowhere to go without the button, and says so', !r.ok && r.unsupported, r);

  console.log('\nturned on: the button stands, and the choice is the person\'s');
  r = await p.evaluate(() => beachVoice.button.set(true));
  check('turned on, the button comes onto the page and the page hears it come', await until(p, true) && (await p.evaluate(() => __turns)).join() === 'true');
  const s = BLOCKS['settings:tester'];
  check('…and it is kept in their own settings at 9.1, founded under their key without asking', r.ok && r.kept === 'beach' && s && s['9'] && s['9']['1'] === true &&
    /^SETTINGS — tester/.test(s._) && LOCKS['settings:tester'] === SECRET && asked.length === 0, { r, s });
  r = await p.evaluate(() => beachVoice.set('9.2', 'light'));
  check('another of their settings, the light or the dark, is kept beside it at 9.2, asking nothing', r.ok && r.kept === 'beach' && BLOCKS['settings:tester']['9']['2'] === 'light' && BLOCKS['settings:tester']['9']['1'] === true && asked.length === 0, { r, s: BLOCKS['settings:tester'] });
  r = await p.evaluate(() => beachVoice.set('3.1', 'x'));
  check('…and nothing outside the pages is written by a page', !r.ok && /9\.1 to 9\.9/.test(r.error), r);
  const other = await device({ 'render:who': 'tester' });
  check('another device that knows the name shows the button without being asked', await until(other.p, true));
  check('…and reads their light or dark', (await other.p.evaluate(() => beachVoice.setting('9.2'))) === 'light');
  const frame = other.p.frameLocator('iframe[title="beach button"]');
  const said = other.p.evaluate(() => beachVoice.say({ field: 'reflexive-reading', at: '1.3', text: 'Through the button.' }));
  const unlockOnCard = frame.locator('.card.waiting button', { hasText: 'unlock' });
  await unlockOnCard.waitFor(); await sleep(900);
  const before = writes('reflexive-reading:tester').length;
  check('with the button there, the same call waits for the person in it, and nothing is written yet', before === writes('reflexive-reading:tester').length && (await frame.locator('.card.waiting pre').textContent()) === 'Through the button.');
  const [pop] = await Promise.all([other.context.waitForEvent('page'), unlockOnCard.click()]);
  await pop.waitForLoadState();
  await pop.locator('#h').fill('tester'); await pop.locator('#s').fill(SECRET);
  await Promise.all([pop.waitForEvent('close'), pop.click('#yes').catch(() => {})]);
  const commit = frame.locator('.card.staged button', { hasText: 'commit' });
  await commit.waitFor(); await sleep(900);
  await commit.click();
  r = await said;
  check('…they unlock and commit it there, and it lands in their mirror under their words', r.ok && r.name === 'tester' && BLOCKS['reflexive-reading:tester']['1']['3'] === 'Through the button.', r);
  const off = other.p.evaluate(() => beachVoice.button.set(false));
  const commitOff = frame.locator('.card.staged button', { hasText: 'commit' });
  await commitOff.waitFor(); await sleep(900);
  check('turned off where the button holds them, the change is theirs to commit in it, and the page asks no key', asked.length === 0 &&
    (await frame.locator('.card.staged p').last().textContent()).includes('settings:tester at 9.1'));
  await commitOff.click();
  r = await off;
  check('…committed, it leaves that page, and their settings say so', await until(other.p, false) && r.ok && r.kept === 'beach' && BLOCKS['settings:tester']['9']['1'] === false, r);
  await p.reload();
  await sleep(1200);
  check('…so back on the first device it is off after a reload', !(await up(p)));
  await other.context.close();

  console.log('\nwhere the button never stands');
  const nameless = await device();
  r = await nameless.p.evaluate(() => beachVoice.button.set(true));
  check('a device that knows no name keeps the choice for itself, and writes nothing', await until(nameless.p, true) && r.kept === 'device' && writes('settings:').length === 0);
  await nameless.p.goto(`http://localhost:${SITE}/__test/off.html`); await sleep(1200);
  check('a page whose corner is taken (data-beach-button="off") never shows it', !(await up(nameless.p)) && (await nameless.p.locator('iframe').count()) === 0);
  await nameless.p.goto(`http://localhost:${SITE}/__test/framer.html`); await sleep(1500);
  const inner = nameless.p.frames().find((f) => f.url().endsWith('/__test/page.html'));
  check('…nor a page in a frame, whose owner has its own', !!inner && (await inner.evaluate(() => document.querySelectorAll('iframe').length)) === 0);
  await nameless.context.close();

  console.log('\ntaken down');
  asked.length = 0;
  r = await p.evaluate(() => beachVoice.drop({ field: 'reflexive-reading' }));
  check('a mirror is taken down with the key kept here, asking nothing', r.ok && !BLOCKS['reflexive-reading:tester'] && asked.length === 0, r);
  await context.close();

  check('no page threw', errors.length === 0, errors);
  await browser.close();
  servers.forEach((x) => x.close());
  console.log(pass ? '\nsmoke:voice passed' : '\nsmoke:voice FAILED');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
