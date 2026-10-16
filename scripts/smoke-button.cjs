// The beach button against a page that wants what is typed into it.
//
// A hostile host page carries the button (served from another origin, as it would be from the
// beach) and tries everything a page can try: read the frame's document and storage, listen for
// keystrokes, listen to every message, wrap fetch, fade or cover the window while asking it to
// write, and open the unlock window itself to catch its answer. A mock beach and a mock Anthropic
// record where every secret actually travelled. For contrast it also does what the old Chrome
// extension did — draw a widget inside the page, in a closed shadow root — and shows that one
// leaks. Then it holds the button to its shape: the circle's three taps (+ # ×), Escape, a tap
// elsewhere leaving settings, the window hung above the circle and never over it, growing with
// the reply and never past its most, widened by its left edge, flipped below the circle at the top
// of the screen, risen above a phone's keyboard, and moved by its grip.
//
// Runs offline in headless Chromium (Playwright). CommonJS (.cjs), as this package is ESM:
//   NODE_PATH=$(npm root -g) npm run smoke:button
// (Playwright is not a dependency of the beach; once: npm i -g playwright && npx playwright install chromium)
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('smoke:button needs Playwright — npm i -g playwright && npx playwright install chromium, then NODE_PATH=$(npm root -g) npm run smoke:button'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const SITE = 8765, BEACH = 8766, LLM = 8767;
const BUTTON = `http://127.0.0.1:${SITE}/button/`;
const SECRET = 'correct horse battery';
const KEY = 'sk-test-not-a-real-key-123';
const QUESTION = 'what does my passport say about me';
const ANSWER = 'Your passport says you are a tester of buttons.';
const CARD = 'Ask weft to pass the dictation fix to whoever keeps this page';
const LINE = 'Thank you, weft: the button works from my own pages.';
// the page's own address carries a query and a fragment, which never leave the frame
const HOST_URL = (host) => `http://${host}:${SITE}/__test/host.html?token=page-secret#frag`;
const PAGE_SAID = `http://localhost:${SITE}/__test/host.html`;
const GAP = 10, EDGE = 8, TALL = 560, LEAST = 280;

let pass = true;
const check = (label, ok, detail) => {
  if (!ok) pass = false;
  console.log(`  ${ok ? '✓' : '✗'} ${label}` + (ok || detail === undefined ? '' : `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
};

// ── the hostile host page ─────────────────────────────────────────────────────────────────
const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>a page that wants your words</title></head><body>
<h1>Some page on the open web</h1>
<script>
  window.__spy = { keys: [], messages: [], fetches: [], hello: [] };
  ['keydown', 'keyup', 'keypress', 'beforeinput', 'input'].forEach(function (t) {
    window.addEventListener(t, function (e) { __spy.keys.push(t + ':' + (e.key || e.data || '')); }, true);
  });
  window.addEventListener('message', function (e) { __spy.messages.push(JSON.stringify(e.data)); }, true);
  var realFetch = window.fetch;
  window.fetch = function (u) { __spy.fetches.push(String(u && u.url || u)); return realFetch.apply(this, arguments); };
  document.addEventListener('beachbutton:hello', function (e) { __spy.hello.push(e.detail.handle); });
  window.__probe = function () {
    var f = document.querySelector('iframe[title="beach button"]'), r = {};
    try { r.contentDocument = f.contentDocument === null ? 'null' : 'readable'; } catch (e) { r.contentDocument = 'threw ' + e.name; }
    try { void f.contentWindow.document.body; r.document = 'readable'; } catch (e) { r.document = 'threw ' + e.name; }
    try { void f.contentWindow.localStorage; r.localStorage = 'readable'; } catch (e) { r.localStorage = 'threw ' + e.name; }
    try { void f.contentWindow.sessionStorage; r.sessionStorage = 'readable'; } catch (e) { r.sessionStorage = 'threw ' + e.name; }
    try { r.location = f.contentWindow.location.href; } catch (e) { r.location = 'threw ' + e.name; }
    return r;
  };
  // the old way, for contrast: a widget drawn inside the page, in a closed shadow root
  (function () {
    var host = document.createElement('div'); document.body.appendChild(host);
    var root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = '<input type="password" aria-label="injected widget">';
    window.__injected = root.querySelector('input');
  })();
</script>
<script src="${BUTTON}button.js" data-place="w/test-place" data-beach="http://127.0.0.1:${BEACH}" data-llm="http://127.0.0.1:${LLM}"></script>
</body></html>`;

// ── servers: the site (button + host page), a mock beach, a mock Anthropic ────────────────
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
function site(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__test/host.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(HOST_PAGE); }
  const file = path.join(ROOT, url.pathname);
  if (!url.pathname.startsWith('/button/') || !file.startsWith(path.join(ROOT, 'button')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file, 'utf8');
  // test only: let the frame reach the two mocks (the published CSP names only the real ones)
  if (url.pathname.endsWith('frame.html')) body = body.replace('https://api.anthropic.com;', `https://api.anthropic.com http://127.0.0.1:${BEACH} http://127.0.0.1:${LLM};`);
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
}

const beachLog = [];
const BLOCKS = {
  'passport:tester': { _: 'tester — a person testing the beach button', 1: 'offers: patience', 2: 'needs: a button that keeps a secret' },
  'lighthouse': { _: 'the test place' },
  'pool:weft': { _: "Weft's room — say the thing itself." }
};
const HANDS = {};   // ahead:now:tester, once founded
function beach(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const body = raw ? JSON.parse(raw) : null;
    beachLog.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, origin: req.headers.origin || null, referer: req.headers.referer || null });
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET') {
      const name = url.searchParams.get('block');
      const b = HANDS[name] || BLOCKS[name];
      if (b && url.searchParams.has('pscale')) { res.writeHead(200); return res.end(JSON.stringify({ floor: 1, shape: 'disc', entries: [] })); }
      res.writeHead(b ? 200 : 404); return res.end(JSON.stringify(b || { error: 'not found', code: 'not_found' }));
    }
    if (req.method === 'POST' && body.block === 'ahead:now:tester') {
      // a hand: founded once under the person's own words, then written at its slots under them
      if (body.new_lock) {
        if (HANDS[body.block] || body.new_lock !== SECRET) { res.writeHead(403); return res.end(JSON.stringify({ error: 'refused', code: 'lock_required' })); }
        HANDS[body.block] = body.content; res.writeHead(200); return res.end(JSON.stringify({ ok: true }));
      }
      const hand = HANDS[body.block];
      if (!hand || body.secret !== SECRET) { res.writeHead(403); return res.end(JSON.stringify({ error: 'secret does not match', code: 'lock_required' })); }
      if (body.spindle === '2') hand['2'] = body.content;
      else if (/^2[1-9]$/.test(body.spindle)) { hand['2'] = hand['2'] || {}; hand['2'][body.spindle[1]] = body.content; }
      res.writeHead(200); return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method === 'POST' && /^pool:/.test(body.block) && body.append) {
      res.writeHead(200); return res.end(JSON.stringify({ ok: true, slot: '7' }));
    }
    if (req.method === 'POST') {
      const named = /:tester$/.test(body.block);
      if (named && body.secret !== SECRET) { res.writeHead(403); return res.end(JSON.stringify({ error: 'secret does not match', code: 'lock_required' })); }
      res.writeHead(200); return res.end(JSON.stringify({ ok: true }));
    }
    res.writeHead(405); res.end('{}');
  });
}

// the mock Anthropic plays a script per question: one tool to use, then an answer — by default
// the tool's result, given back word for word, so the test reads what the model was told
const LONG = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long answer, to see the window stop growing.`).join('\n');
const SCRIPTS = {
  [QUESTION]: { use: { name: 'read_block', input: { block: 'passport:tester', where: 'here' } }, answer: ANSWER },
  'make me a card': { use: { name: 'propose_card', input: { sentence: CARD } } },
  'say thanks to weft': { use: { name: 'propose_line', input: { room: 'pool:weft', text: LINE } } },
  'post in a room that is not there': { use: { name: 'propose_line', input: { room: 'pool:nowhere', text: 'hello?' } } },
  'a card I will refuse': { use: { name: 'propose_card', input: { sentence: 'never this one' } } },
  'a card under a fade': { use: { name: 'propose_card', input: { sentence: 'a sneaky card' } } },
  'answer with marks': { answer: 'Your **room** is `pool:tester`.\n## Where\nPlain words.' },
  'a long answer': { answer: LONG }
};
const llmLog = [];
function llm(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, x-api-key, anthropic-version, anthropic-beta, anthropic-dangerous-direct-browser-access');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const body = JSON.parse(raw);
    llmLog.push({ headers: req.headers, body });
    const script = SCRIPTS[body.messages[0].content] || { answer: 'no script for this question' };
    const last = body.messages[body.messages.length - 1];
    const result = Array.isArray(last.content) && last.content.find((b) => b.type === 'tool_result');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(script.use && !result
      ? { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'toolu_' + llmLog.length, name: script.use.name, input: script.use.input }] }
      : { id: 'msg_2', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn',
          content: [{ type: 'text', text: script.answer || 'RESULT: ' + (result ? result.content : '') }] }));
  });
}

const listen = (fn, port) => new Promise((ok) => { const s = http.createServer(fn); s.listen(port, () => ok(s)); });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Chromium drops input to a cross-origin frame that appeared, moved or resized in the last ~500ms —
// its own guard against a page sliding a frame under the pointer. The button's window grows
// as replies and cards arrive, so a person never notices; a test must wait.
const settle = () => sleep(700);
const within = (p, ms, label) => Promise.race([p, sleep(ms).then(() => ({ ok: false, error: 'no answer within ' + ms + 'ms: ' + label }))]);
async function armed(locator) { await locator.waitFor(); for (let i = 0; i < 60 && !(await locator.isEnabled()); i++) await sleep(50); await sleep(100); }
const spy = (page) => page.evaluate(() => window.__spy);
const leaks = (s, words) => s.messages.filter((m) => words.some((w) => m.includes(w)));
// The unlock window closes itself the moment it hands over (unlock.js hand()), so a click that
// lands can see its page close before Playwright has finished with it. That close is the
// success being tested, not a fault.
const clickThatCloses = (p, sel) => Promise.all([p.waitForEvent('close'),
  p.click(sel).catch((e) => { if (!/closed/i.test(String(e && e.message))) throw e; })]);
const askIt = async (frame, q) => { await settle(); await frame.locator('#q').fill(q); await frame.locator('#go').click(); };
const posts = () => beachLog.filter((r) => r.method === 'POST').length;

// where the button's parts stand on the page, and which view is open
const parts = (page) => page.evaluate(() => {
  const box = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom, shown: getComputedStyle(el).display !== 'none' };
  };
  const dock = document.querySelector('[data-beach-button-dock]'), f = document.querySelector('iframe[title="beach button"]');
  const a = document.activeElement;
  return {
    view: dock ? dock.getAttribute('data-view') : null,
    dock: box(dock), frame: box(f), edge: box(document.querySelector('[data-beach-button-edge]')),
    vw: document.documentElement.clientWidth, vh: innerHeight,
    focus: a && a === f ? 'frame' : a && a === dock ? 'dock' : a ? a.tagName : null
  };
});
const meets = (a, b) => !!a && !!b && a.shown && b.shown && !(a.right <= b.x || a.x >= b.right || a.bottom <= b.y || a.y >= b.bottom);
const apart = (g) => !meets(g.frame, g.dock) && !meets(g.frame, g.edge) && !meets(g.dock, g.edge);
const onScreen = (g) => g.frame.x >= EDGE - 0.5 && g.frame.y >= EDGE - 0.5 && g.frame.right <= g.vw - EDGE + 0.5 && g.frame.bottom <= g.vh - EDGE + 0.5;
// the circle is drawn in a closed shadow root, as a page cannot reach it: tapped where it stands
async function tap(page) { const g = await parts(page); await page.mouse.click(g.dock.right - 28, g.dock.y + 28); }
async function toView(page, v) {
  for (let i = 0; i < 3 && (await parts(page)).view !== v; i++) { await tap(page); await sleep(60); }
  await settle();
}
// The circle's icon and its spoken name, read through its closed shadow root as only the browser's own
// tools can (a page cannot): + while closed (its tap opens the prompt), # while the prompt is open
// (its tap opens settings), × while settings is open (its tap closes everything).
const GLYPH = { 'M5 12h14M12 5v14': '+', 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18': '#', 'M18 6 6 18M6 6l12 12': '×' };
async function circleSays(cdp) {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const attr = (n, k) => { const a = n.attributes || []; for (let i = 0; i < a.length; i += 2) if (a[i] === k) return a[i + 1]; return null; };
  const find = (n, ok) => { if (ok(n)) return n; for (const c of [].concat(n.children || [], n.shadowRoots || [], n.contentDocument || [])) { const f = find(c, ok); if (f) return f; } return null; };
  const dock = find(root, (n) => attr(n, 'data-beach-button-dock') !== null);
  const circle = dock && find(dock, (n) => n.nodeName === 'BUTTON' && attr(n, 'class') === 'c');
  const path = circle && find(circle, (n) => n.nodeName === 'path');
  return { glyph: path ? GLYPH[attr(path, 'd')] || attr(path, 'd') : null, label: circle ? attr(circle, 'aria-label') : null };
}
const whenReady = (page) => page.waitForFunction(() => window.__spy && window.__spy.messages.some((m) => m.includes('"type":"ready"')));

// A phone's speech engine, as Chrome on Android behaves: each revision of a phrase comes back as a
// further final result repeating the words before it, and every event carries all of them again.
// Installed in the button's frame only (an init script reaches every frame Playwright opens).
function fakePhoneSpeech() {
  if (!/\/button\/frame(\.html)?$/.test(location.pathname)) return;
  function Phone() {}
  Phone.prototype.start = function () {
    var self = this, i = 0, seq = [['hello'], ['hello', 'hello world'], ['hello', 'hello world', 'hello world how are you'],
      ['hello', 'hello world', 'hello world how are you', 'second thing']];
    (function tick() {
      if (i >= seq.length) { if (self.onend) self.onend(); return; }
      var results = seq[i++].map(function (t) { var r = [{ transcript: t }]; r.isFinal = true; return r; });
      if (self.onresult) self.onresult({ resultIndex: 0, results: results });
      setTimeout(tick, 40);
    })();
  };
  Phone.prototype.stop = function () {};
  window.SpeechRecognition = window.webkitSpeechRecognition = Phone;
}

// Playwright turns off Chromium's third-party storage partitioning (playwright#32230), which
// shipping Chrome, Firefox and Safari all have on. The run is made twice: once as browsers ship,
// and once with partitioning off, which the button must survive on its own keying.
function launchArgs(partitioned) {
  if (!partitioned) return {};
  try {
    const core = path.dirname(require.resolve('playwright-core/package.json', { paths: [path.dirname(require.resolve('playwright'))] }));
    const flag = require(path.join(core, 'lib/server/chromium/chromiumSwitches.js')).chromiumSwitches(false).find((a) => a.startsWith('--disable-features='));
    const kept = flag.split('=')[1].split(',').filter((f) => f !== 'ThirdPartyStoragePartitioning');
    return { ignoreDefaultArgs: [flag], args: ['--disable-features=' + kept.join(',')] };
  } catch (e) { return null; }
}

async function run(partitioned) {
  const opts = launchArgs(partitioned);
  if (!opts) { console.log('\n(could not restore storage partitioning in this Playwright; skipping that run)'); return; }
  console.log(`\n━━ storage partitioning ${partitioned ? 'ON — as browsers ship' : 'OFF — Playwright\'s default'} ━━`);
  beachLog.length = 0; llmLog.length = 0;
  Object.keys(HANDS).forEach((k) => { delete HANDS[k]; });
  const browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM_PATH || undefined }, opts));
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  context.setDefaultTimeout(15000);
  await context.addInitScript(fakePhoneSpeech);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HOST_URL('localhost'));
  const frame = page.frameLocator('iframe[title="beach button"]');
  await whenReady(page);

  console.log('\nwhat a page can reach of the button:');
  const probe = await page.evaluate(() => window.__probe());
  check('its document reads as null', probe.contentDocument === 'null', probe);
  check('reaching through its window throws', /^threw SecurityError/.test(probe.document), probe);
  check('its localStorage throws', /^threw/.test(probe.localStorage), probe);
  check('its sessionStorage throws', /^threw/.test(probe.sessionStorage), probe);
  check('even its address throws', /^threw/.test(probe.location), probe);

  console.log('\nthe old way, for contrast — a widget drawn inside the page:');
  await page.evaluate(() => window.__injected.focus());
  await page.keyboard.type('hunter2');
  const typed = (await spy(page)).keys.filter((k) => k.startsWith('keydown:')).map((k) => k.slice(8)).join('');
  check('the page logs every key typed into it, closed shadow root or not', typed.includes('hunter2'), typed);
  await page.evaluate(() => { window.__injected.blur(); window.__spy.keys.length = 0; window.__spy.messages.length = 0; });

  console.log('\nthe circle, tapped as xstream\'s construction button is tapped:');
  const cdp0 = await context.newCDPSession(page);
  let says = await circleSays(cdp0);
  check('closed, the circle shows + and says its tap opens the button, to speak or type', says.glyph === '+' && says.label === 'open the beach button, to speak or type', says);
  let g = await parts(page);
  check('it stands bottom right, closed, its window hidden', g.view === 'closed' && g.dock.shown && !g.frame.shown && !g.edge.shown &&
    Math.abs(g.dock.right - (g.vw - 16)) <= 1 && Math.abs(g.dock.bottom - (g.vh - 16)) <= 1, g);
  await tap(page); await settle();
  g = await parts(page);
  check('a first tap (+) opens the prompt, hanging up and to the left of the circle', g.view === 'prompt' && g.frame.shown &&
    Math.abs(g.frame.right - g.dock.right) <= 1 && g.frame.bottom <= g.dock.y - GAP + 0.5, g);
  check('…never over the circle, its grip or its edge, and on screen', apart(g) && onScreen(g), g);
  check('…showing the prompt', await frame.locator('#prompt').isVisible() && await frame.locator('#settings').isHidden());
  check('…and taking the keys, so a person may type at once', g.focus === 'frame', g.focus);
  says = await circleSays(cdp0);
  check('…the circle now showing #, its tap opening settings', says.glyph === '#' && says.label === 'the beach button’s settings', says);
  await tap(page); await settle();
  g = await parts(page);
  check('a second tap (#) opens settings', g.view === 'settings' && await frame.locator('#settings').isVisible() && await frame.locator('#prompt').isHidden(), g.view);
  says = await circleSays(cdp0);
  check('…the circle now showing ×, its tap closing everything', says.glyph === '×' && says.label === 'close the beach button', says);
  check('…which holds you, your name, and hide', await frame.locator('#you').isVisible() && await frame.locator('#tell').isVisible() && await frame.locator('#away').isVisible());
  await tap(page); await settle();
  g = await parts(page);
  check('a third tap (×) closes everything, and the circle shows + again', g.view === 'closed' && !g.frame.shown && !g.edge.shown && (await circleSays(cdp0)).glyph === '+', g);
  await tap(page); await settle();
  await page.keyboard.press('Escape');
  await sleep(250);
  g = await parts(page);
  check('Escape, pressed in the window, closes it', g.view === 'closed' && !g.frame.shown, g.view);
  check('…and the keys come back to the circle', g.focus === 'dock', g.focus);
  await toView(page, 'settings');
  await page.mouse.click(300, 200);
  await sleep(250);
  check('a tap elsewhere on the page leaves settings for the prompt, as xstream\'s menu does', (await parts(page)).view === 'prompt');
  let s = await spy(page);
  check('the page heard none of the keys pressed in the window', s.keys.length === 0, s.keys);

  console.log('\nunlocking, in the beach\'s own window:');
  await toView(page, 'prompt');
  const [popup] = await Promise.all([context.waitForEvent('page'), frame.locator('#unlock').click()]);
  await popup.waitForLoadState();
  check('the window names the site that asked', (await popup.locator('#asker').textContent()).includes(`localhost:${SITE}`));
  await popup.locator('#h').pressSequentially('tester');
  await popup.locator('#s').pressSequentially(SECRET);
  await popup.locator('#k').fill(KEY);
  await popup.check('#rem');
  await clickThatCloses(popup, '#yes');
  await frame.locator('#who', { hasText: 'tester' }).waitFor();
  s = await spy(page);
  check('the page heard no keystroke', s.keys.length === 0, s.keys);
  check('no message to the page carries the passphrase or the key', leaks(s, [SECRET, KEY]).length === 0, leaks(s, [SECRET, KEY]));
  check('the page has not been told the name either (not yet allowed)', s.hello.every((h) => h === null), s.hello);
  check('the target line says who acts, and where', (await frame.locator('#who').textContent()) === `as tester · on localhost:${SITE}`, await frame.locator('#who').textContent());
  await toView(page, 'closed');
  await tap(page); await settle();
  check('with a key held, a tap on the circle puts the caret straight in the prompt',
    (await parts(page)).focus === 'frame' && await frame.locator('#q').evaluate((el) => document.activeElement === el));

  console.log('\nthe page asks, the person answers:');
  await toView(page, 'closed');
  let pending = page.evaluate(() => window.beachButton.request({ kind: 'who' }));
  const tellIt = frame.locator('.card button', { hasText: 'tell it' });
  await armed(tellIt);
  g = await parts(page);
  check('a request opens the window to the prompt, where the person answers — without taking the keys from the page', g.view === 'prompt' && g.focus !== 'frame', g);
  await tellIt.click();
  const who = await pending;
  check('a page learns the name only when the person says so', who.ok && who.handle === 'tester', who);
  check('…and is told it as an event too', (await spy(page)).hello.includes('tester'));

  pending = page.evaluate(() => window.beachButton.request({ kind: 'write', block: 'standards:tester', spindle: '7', content: 'Partly — shown in the minutes.' }));
  const commit = frame.locator('.card button', { hasText: 'commit' });
  await armed(commit);
  check('a write the page asks for is staged, as liquid, before anything is written',
    await frame.locator('.card.staged .tag').isVisible() && !beachLog.some((r) => r.method === 'POST' && r.body.block === 'standards:tester'));
  await commit.click();
  const wrote = await pending;
  const post7 = beachLog.find((r) => r.method === 'POST' && r.body.block === 'standards:tester' && r.body.spindle === '7');
  check('a write the person commits lands', wrote.ok === true, wrote);
  check('…at the page\'s place on the beach, carrying the passphrase there and only there', !!post7 && post7.path === '/w/test-place/.well-known/pscale-beach' && post7.body.secret === SECRET, post7);
  check('…and the beach never learns which page asked (no referrer)', !!post7 && post7.referer === null, post7 && post7.referer);
  check('…the beach sees the button\'s origin, not the page\'s', !!post7 && post7.origin === `http://127.0.0.1:${SITE}`, post7 && post7.origin);
  s = await spy(page);
  check('the page\'s reply carries no secret', leaks(s, [SECRET, KEY]).length === 0, leaks(s, [SECRET, KEY]));

  const before = beachLog.length;
  const foreign = await page.evaluate(() => window.beachButton.request({ kind: 'write', block: 'lighthouse', content: { _: 'mine now' } }));
  check('a block not named for the person is refused before anyone is asked', !foreign.ok && /named for the person/.test(foreign.error), foreign);
  check('…and nothing reaches the beach', beachLog.length === before);

  console.log('\na page that tries to commit for the person:');
  for (const [how, cover, uncover] of [
    ['fades the window', () => { document.querySelector('iframe[title="beach button"]').style.opacity = '0.2'; },
                         () => { document.querySelector('iframe[title="beach button"]').style.opacity = ''; }],
    ['lays a decoy over it', () => { const d = document.createElement('div'); d.id = 'decoy'; d.textContent = 'Click for a prize!';
                                     d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;pointer-events:none'; document.body.appendChild(d); },
                             () => { document.getElementById('decoy').remove(); }]
  ]) {
    await page.evaluate(cover);
    const n = beachLog.length;
    pending = page.evaluate(() => window.beachButton.request({ kind: 'write', block: 'standards:tester', spindle: '8', content: 'sneaky' }));
    await armed(commit);
    await commit.click({ force: true });
    const r = await within(pending, 5000, how);
    check(`a page that ${how} gets no commit`, !r.ok && /covered/.test(r.error || ''), r);
    check('…and nothing reaches the beach', beachLog.length === n);
    await page.evaluate(uncover);
  }
  await sleep(300);

  console.log('\nasking the beach — the person\'s own key, straight to Anthropic:');
  await settle();
  const tall0 = (await parts(page)).frame.h;
  await frame.locator('#q').pressSequentially(QUESTION);
  await frame.locator('#go').click();
  await frame.locator('#log p', { hasText: ANSWER }).waitFor();
  s = await spy(page);
  check('the page heard none of the question being typed', s.keys.length === 0, s.keys.slice(0, 10));
  check('the page was told neither question nor answer', leaks(s, [QUESTION, ANSWER, KEY]).length === 0, leaks(s, [QUESTION, ANSWER]));
  check('the page\'s own fetch saw none of it', s.fetches.length === 0, s.fetches);
  check('Anthropic got the person\'s key and question', llmLog.length === 2 && llmLog[0].headers['x-api-key'] === KEY && llmLog[0].body.messages[0].content === QUESTION, llmLog.length);
  check('…on the default model, with fallbacks on', llmLog[0] && llmLog[0].body.model === 'claude-opus-5-5' && llmLog[0].body.fallbacks === 'default');
  check('…and the beach was read for it', beachLog.some((r) => r.method === 'GET' && r.query.block === 'passport:tester'));
  check('…the reads returned in one message, the assistant turn echoed unchanged', llmLog[1] && llmLog[1].body.messages.length === 3 && llmLog[1].body.messages[1].content[0].type === 'tool_use');
  check('the question leaves the prompt once asked, standing in the reply above, as xstream clears its prompt',
    (await frame.locator('#q').inputValue()) === '' && (await frame.locator('#log p.q', { hasText: QUESTION }).count()) === 1);
  await sleep(300);
  g = await parts(page);
  check('the window grows upward with the reply, still clear of the circle', g.frame.h > tall0 && g.frame.bottom <= g.dock.y - GAP + 0.5 && apart(g), { before: tall0, after: g.frame });

  console.log('\nthe page it stands on, as the page says it:');
  check('the question went to Anthropic with the page\'s address, its query and fragment dropped',
    llmLog[0].body.system.includes(PAGE_SAID) && !/page-secret|#frag/.test(llmLog[0].body.system), llmLog[0].body.system.slice(0, 300));
  check('…and the beach was told nothing of it', !beachLog.some((r) => JSON.stringify(r).includes('__test/host.html')));
  check('…a person holding a passphrase is offered the two proposals', ['read_block', 'propose_card', 'propose_line'].every((t) => llmLog[0].body.tools.some((x) => x.name === t)));
  // a page may say where it stands only within its own origin
  await page.evaluate(() => { document.querySelector('iframe[title="beach button"]').contentWindow.postMessage({ type: 'page', href: 'https://bank.example/account', title: 'Your bank' }, '*'); });
  await sleep(200);

  console.log('\na card and a line, staged when asked, written only on commit:');
  const n0 = llmLog.length;
  await askIt(frame, 'make me a card');
  await armed(commit);
  check('the card is staged for the person before anything is written', await frame.locator('.card.staged').isVisible() && !beachLog.some((r) => r.method === 'POST' && /^ahead:/.test(r.body.block)));
  await commit.click();
  await frame.locator('#log p', { hasText: 'RESULT: Written' }).waitFor();
  const founded = beachLog.find((r) => r.method === 'POST' && r.body.block === 'ahead:now:tester' && r.body.new_lock);
  const card = beachLog.find((r) => r.method === 'POST' && r.body.block === 'ahead:now:tester' && r.body.spindle === '2');
  check('a hand not yet started is founded, latched to the person\'s own words', !!founded && founded.body.new_lock === SECRET && /^AHEAD — tester's hand/.test(founded.body.content._), founded);
  check('…the card lands in it for today, carrying the passphrase there and only there', !!card && card.body.secret === SECRET && card.body.content['1']._ === CARD && card.path === '/.well-known/pscale-beach', card);
  check('…saying the page it came from, its query and fragment dropped', !!card && card.body.content['1']['5'] === PAGE_SAID, card && card.body.content);
  check('…never the address another origin\'s message claimed', !beachLog.some((r) => JSON.stringify(r).includes('bank.example')) && !llmLog.slice(n0).some((l) => l.body.system.includes('bank.example')));
  check('…and the model is told what happened', llmLog.slice(n0).some((l) => JSON.stringify(l.body.messages).includes('Written: the card stands in ahead:now:tester at 21')));
  await askIt(frame, 'make me a card');
  await armed(commit);
  await commit.click();
  await frame.locator('#log p', { hasText: 'at 22, for today' }).last().waitFor();
  check('a second card takes the next free slot of today', beachLog.some((r) => r.method === 'POST' && r.body.block === 'ahead:now:tester' && r.body.spindle === '22' && !r.body.new_lock));

  await askIt(frame, 'say thanks to weft');
  await armed(commit);
  await commit.click();
  await frame.locator('#log p', { hasText: 'RESULT: Posted in pool:weft at 7' }).waitFor();
  const line = beachLog.find((r) => r.method === 'POST' && r.body.block === 'pool:weft');
  check('a line goes into the room named, appended under the person\'s handle', !!line && line.body.append === true && line.body.content._ === LINE && line.body.content['1'] === 'tester', line);
  check('…carrying no passphrase, a room being open', !!line && !('secret' in line.body) && !JSON.stringify(line.body).includes(SECRET), line);
  check('…once the room was found standing', beachLog.some((r) => r.method === 'GET' && r.query.block === 'pool:weft' && r.query.pscale === '9'));

  const w0 = posts();
  await askIt(frame, 'post in a room that is not there');
  await frame.locator('#log p', { hasText: 'RESULT: Not posted: no room called pool:nowhere' }).waitFor();
  check('a room that does not stand is never founded by a line', posts() === w0);
  await askIt(frame, 'a card I will refuse');
  await armed(commit);
  await frame.locator('.card button', { hasText: 'not now' }).click();
  await frame.locator('#log p', { hasText: 'RESULT: Not written: tester said no' }).waitFor();
  check('not now writes nothing, and the model is told so', posts() === w0);
  await page.evaluate(() => { document.querySelector('iframe[title="beach button"]').style.opacity = '0.2'; });
  await askIt(frame, 'a card under a fade');
  await armed(commit);
  await commit.click({ force: true });
  await frame.locator('#log p', { hasText: 'RESULT: Not written: tester said no (covered' }).waitFor();
  check('a page that fades the window gets no commit for a proposal either', posts() === w0);
  await page.evaluate(() => { document.querySelector('iframe[title="beach button"]').style.opacity = ''; });
  await sleep(300);

  console.log('\nplain words, a whole target line, and no echo:');
  await askIt(frame, 'answer with marks');
  const marked = frame.locator('#log p', { hasText: 'Plain words.' });
  await marked.waitFor();
  const shownText = await marked.textContent();
  check('an answer shows as plain text, its markdown marks taken out', shownText === 'Your room is pool:tester.\nWhere\nPlain words.', shownText);
  const head = await frame.locator('#who').evaluate((el) => ({ ws: getComputedStyle(el).whiteSpace, cut: el.scrollWidth > el.clientWidth }));
  check('the target line wraps rather than being cut off', head.ws !== 'nowrap' && !head.cut, head);
  await settle();
  await frame.locator('#q').fill('');
  await frame.locator('#mic').evaluate((el) => { window.__pressed = []; new MutationObserver(() => window.__pressed.push(el.getAttribute('aria-pressed'))).observe(el, { attributes: true, attributeFilter: ['aria-pressed'] }); });
  await frame.locator('#mic').click();
  await sleep(400);
  const mic = await frame.locator('#mic').evaluate((el) => ({ paths: [...el.querySelectorAll('svg path')].map((x) => x.getAttribute('d').slice(0, 20)), text: el.textContent.trim(), pressed: window.__pressed, on: el.classList.contains('on') }));
  check('the microphone is the site\'s own glyph, and says when it listens and when it stops',
    mic.paths.length === 2 && mic.paths[0] === 'M12 15a4 4 0 0 0 4-4' && mic.text === '' && mic.pressed.join() === 'true,false' && !mic.on, mic);
  const spoken = await frame.locator('#q').inputValue();
  check('a phone\'s repeated revisions land once — the words rebuilt, never appended', spoken === 'Hello world how are you. Second thing.', spoken);
  await frame.locator('#q').fill('');
  s = await spy(page);
  check('the page heard none of it', leaks(s, [CARD, LINE, SECRET, KEY, 'second thing']).length === 0 && s.keys.length === 0, leaks(s, [CARD, LINE]));

  console.log('\nthe window\'s height, its edge and its keyboard:');
  await askIt(frame, 'a long answer');
  await frame.locator('#log p', { hasText: 'Line 40 of a long answer' }).waitFor();
  await sleep(300);
  g = await parts(page);
  check('a long reply stops the window at its most, and scrolls inside it', g.frame.h <= TALL + 0.5 && g.frame.h >= TALL - 1 && onScreen(g) && apart(g), g.frame);
  check('…with the prompt still in reach at its foot', await frame.locator('#q').isVisible() &&
    await frame.locator('#said').evaluate((el) => el.scrollHeight > el.clientHeight));
  const wBefore = g.frame.w, rBefore = g.frame.right;
  const ex = g.edge.x + g.edge.w / 2, ey = g.edge.y + g.edge.h / 2;
  check('an edge stands beside the window\'s left side, never against it', g.edge.shown && g.edge.right <= g.frame.x - GAP + 0.5 && apart(g), g);
  await page.mouse.move(ex, ey);
  await page.mouse.down();
  await page.mouse.move(ex - 100, ey, { steps: 10 });
  await page.mouse.up();
  await sleep(150);
  g = await parts(page);
  check('dragging it left widens the window, its right side staying with the circle', Math.abs(g.frame.w - wBefore - 100) <= 1 && Math.abs(g.frame.right - rBefore) <= 1 && apart(g), { before: wBefore, after: g.frame.w });
  const ex2 = g.edge.x + g.edge.w / 2;
  await page.mouse.move(ex2, ey);
  await page.mouse.down();
  await page.mouse.move(ex2 + 700, ey, { steps: 10 });
  await page.mouse.up();
  await sleep(150);
  g = await parts(page);
  check('…and narrows it, never past its least', g.frame.w === LEAST, g.frame.w);
  await page.evaluate(() => document.querySelector('[data-beach-button-edge]').focus());
  await page.keyboard.press('ArrowLeft');
  await sleep(100);
  g = await parts(page);
  check('…the arrow keys widen it too, a step at a time', g.frame.w === LEAST + 16, g.frame.w);
  await page.evaluate(() => {
    const h = innerHeight - 320;
    Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => h });
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await sleep(150);
  g = await parts(page);
  check('when a phone\'s keyboard takes the bottom of the screen, the circle rises above it', g.dock.bottom <= g.vh - 320 - EDGE + 0.5, { dock: g.dock, seen: g.vh - 320 });
  check('…and its window too, above the circle, inside what can be seen', g.frame.y >= EDGE - 0.5 && g.frame.bottom <= g.dock.y - GAP + 0.5 && apart(g), g);
  await page.evaluate(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
  await sleep(150);
  g = await parts(page);
  check('…and they settle back when the keyboard goes', Math.abs(g.dock.bottom - (g.vh - 16)) <= 1, g.dock);

  console.log('\none site\'s button is not another\'s:');
  await settle();
  await frame.locator('#q').pressSequentially('a draft left on this site');
  const pageB = await context.newPage();
  await pageB.goto(`http://127.0.0.2:${SITE}/__test/host.html`);
  const frameB = pageB.frameLocator('iframe[title="beach button"]');
  await whenReady(pageB);
  await toView(pageB, 'prompt');
  check('on another site the button holds no one', (await frameB.locator('#who').textContent()).startsWith('the beach'));
  const [popupB] = await Promise.all([context.waitForEvent('page'), frameB.locator('#unlock').click()]);
  await popupB.waitForLoadState();
  check('the beach\'s window remembers the person (its own storage, one tap)', await popupB.locator('#known').isVisible() && (await popupB.locator('#kname').textContent()) === 'tester');
  check('…and names the new site that asks', (await popupB.locator('#asker').textContent()).includes(`127.0.0.2:${SITE}`));
  await clickThatCloses(popupB, '#useknown');
  await frameB.locator('#who', { hasText: 'tester' }).waitFor();
  check('the draft left on the first site is not on this one', (await frameB.locator('#q').inputValue()) === '');
  const pageA2 = await context.newPage();
  await pageA2.goto(`http://localhost:${SITE}/__test/host.html`);
  await whenReady(pageA2);
  check('…and is still on the first site', (await pageA2.frameLocator('iframe[title="beach button"]').locator('#q').evaluate((el) => el.value)) === 'a draft left on this site');
  check('the second site was never told the name', (await spy(pageB)).hello.every((h) => h === null));
  await pageA2.close();
  await pageB.close();

  console.log('\nthe unlock window answers only the button:');
  const [evil] = await Promise.all([context.waitForEvent('page'),
    page.evaluate((u) => { window.open(u + 'unlock.html?for=trusted.example&n=abc', 'evil', 'popup'); }, BUTTON)]);
  await evil.waitForLoadState();
  check('opened by a page, it shows nothing to type into and remembers no one', await evil.locator('#f').isHidden() && await evil.locator('#known').isHidden());
  await evil.close();
  await page.evaluate((u) => { const f = document.createElement('iframe'); f.id = 'framed-unlock'; f.src = u + 'unlock.html?for=x&n=abc'; f.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:200px'; document.body.appendChild(f); }, BUTTON);
  const framedUnlock = page.frameLocator('#framed-unlock');
  await framedUnlock.locator('#asker').waitFor();
  check('framed inside a page, it shows nothing either', await framedUnlock.locator('#f').isHidden() && await framedUnlock.locator('#known').isHidden());
  await page.evaluate(() => document.getElementById('framed-unlock').remove());

  console.log('\nsettings, and the one tick that tells the page something:');
  await toView(page, 'settings');
  await sleep(300);
  check('it names the one who is held, and offers to forget them on this tab', (await frame.locator('#youname').textContent()) === 'tester' && await frame.locator('#forget').isVisible());
  await frame.locator('#tell').click();   // untaking it is always allowed
  await sleep(150);                        // the page hears of it by message, a hop later
  check('untaking "this site may know my name" is taken at once', !(await frame.locator('#tell').isChecked()) && (await spy(page)).hello.slice(-1)[0] === null);
  await page.evaluate(() => { document.querySelector('iframe[title="beach button"]').style.opacity = '0.2'; });
  await sleep(300);
  await frame.locator('#tell').click({ force: true });
  await sleep(100);
  check('a page that fades the window cannot get the tick that tells it the name', !(await frame.locator('#tell').isChecked()) &&
    await frame.locator('#snote').isVisible() && (await spy(page)).hello.slice(-1)[0] === null);
  await page.evaluate(() => { document.querySelector('iframe[title="beach button"]').style.opacity = ''; });
  await sleep(300);
  await frame.locator('#tell').click();
  await sleep(100);
  check('…and the person, seeing it, can give it', await frame.locator('#tell').isChecked() && (await spy(page)).hello.slice(-1)[0] === 'tester');
  g = await parts(page);
  check('settings stands where the prompt stood, never over the circle', apart(g) && onScreen(g) && g.frame.bottom <= g.dock.y - GAP + 0.5, g);

  await frame.locator('#forget').click();
  await sleep(150);
  check('forget me: this tab lets go of the person — no one is held, and the page is told no name',
    (await frame.locator('#youname').textContent()) === 'no one yet' && (await frame.locator('#forget').isHidden()) && (await spy(page)).hello.slice(-1)[0] === null);
  await page.reload();
  await whenReady(page);
  await toView(page, 'prompt');
  check('…and a reload brings no one back', (await frame.locator('#who').textContent()).startsWith('the beach'), await frame.locator('#who').textContent());

  console.log('\nmoving it by its grip, as xstream moves its construction button:');
  await toView(page, 'closed');
  let m0 = await parts(page);
  const gx = m0.dock.x + 14, gy = m0.dock.y + 28;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx - 120, gy - 80, { steps: 12 });
  await page.mouse.up();
  await sleep(100);
  const m1 = await parts(page);
  check('a mouse dragging the grip moves it exactly with the pointer', Math.abs(m1.dock.x - m0.dock.x + 120) <= 1 && Math.abs(m1.dock.y - m0.dock.y + 80) <= 1, { before: m0.dock, after: m1.dock });
  check('…and a drag is not a tap: the window stays closed', m1.view === 'closed');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const tx = m1.dock.x + 14, ty = m1.dock.y + 28;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + 9 * i, y: ty + 4 * i }] }); await sleep(20); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await sleep(150);
  const m2 = await parts(page);
  check('a finger dragging the grip moves it too, as on a phone', Math.abs(m2.dock.x - m1.dock.x - 90) <= 1 && Math.abs(m2.dock.y - m1.dock.y - 40) <= 1, { before: m1.dock, after: m2.dock });
  await page.evaluate(() => document.querySelector('[data-beach-button-dock]').focus());
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await sleep(100);
  const m3 = await parts(page);
  check('the arrow keys move it too, a step at a time', m2.dock.x - m3.dock.x === 32 && m2.dock.y - m3.dock.y === 16, { before: m2.dock, after: m3.dock });
  for (let i = 0; i < 16; i++) await page.keyboard.press('Shift+ArrowUp');
  await sleep(100);
  let m4 = await parts(page);
  check('…and it stops at the top of the screen, never off it', Math.abs(m4.dock.y - EDGE) <= 0.5, m4.dock);
  await tap(page); await settle();
  m4 = await parts(page);
  check('at the top of the screen its window opens below the circle instead', m4.view === 'prompt' && m4.frame.y >= m4.dock.bottom + GAP - 0.5 && apart(m4) && onScreen(m4), m4);
  await toView(page, 'closed');
  await page.evaluate(() => document.querySelector('[data-beach-button-dock]').focus());
  for (let i = 0; i < 25; i++) await page.keyboard.press('Shift+ArrowRight');
  await sleep(100);
  const m5 = await parts(page);
  check('…and at the right edge too', Math.abs(m5.dock.right - (m5.vw - EDGE)) <= 0.5, m5.dock);
  await page.reload();
  await whenReady(page);
  const m6 = await parts(page);
  check('it stays where it was left when the page reloads', Math.abs(m6.dock.x - m5.dock.x) <= 0.5 && Math.abs(m6.dock.y - m5.dock.y) <= 0.5, { left: m5.dock, after: m6.dock });
  await tap(page); await settle();
  const m7 = await parts(page);
  check('…and so does its window\'s width', m7.frame.w === LEAST + 16, m7.frame.w);

  console.log('\nputting it away:');
  await toView(page, 'settings');
  await frame.locator('#away').click();
  // the frame asks the page to remove it by postMessage, one async hop after the click lands
  await page.locator('iframe[title="beach button"]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  check('put away, it is gone from the page, its circle, grip and edge with it', (await page.locator('iframe[title="beach button"]').count()) === 0 &&
    (await page.locator('[data-beach-button-dock]').count()) === 0 && (await page.locator('[data-beach-button-edge]').count()) === 0);
  await page.reload();
  await whenReady(page);
  check('…until the page reloads', (await page.locator('iframe[title="beach button"]').count()) === 1 && (await page.locator('[data-beach-button-dock]').count()) === 1);

  console.log('\non a phone\'s screen:');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  pp.on('pageerror', (e) => errors.push(e.message));
  await pp.goto(HOST_URL('localhost'));
  await whenReady(pp);
  let q0 = await parts(pp);
  await pp.touchscreen.tap(q0.dock.right - 28, q0.dock.y + 28);
  await settle();
  q0 = await parts(pp);
  check('a finger\'s tap opens the prompt, the window as wide as the screen allows and all of it in view',
    q0.view === 'prompt' && q0.frame.w === Math.min(Math.floor(390 * 0.9), 390 - 2 * EDGE) && onScreen(q0) && apart(q0), q0);
  check('…with no widening edge against the screen\'s own edge, where a phone\'s back-swipe lives', !q0.edge.shown, q0.edge);
  await phone.close();

  check('no script errors on the host page', errors.length === 0, errors);
  await browser.close();
}

(async () => {
  const servers = [await listen(site, SITE), await listen(beach, BEACH), await listen(llm, LLM)];
  await run(true);
  await run(false);
  servers.forEach((x) => x.close());
  console.log(pass ? '\nall held\n' : '\nSOMETHING LEAKED OR BROKE\n');
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
