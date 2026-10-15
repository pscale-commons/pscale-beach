// The beach button against a page that wants what is typed into it.
//
// A hostile host page carries the button (served from another origin, as it would be from the
// beach) and tries everything a page can try: read the frame's document and storage, listen for
// keystrokes, listen to every message, wrap fetch, fade or cover the button while asking it to
// write, and open the unlock window itself to catch its answer. A mock beach and a mock
// Anthropic record where every secret actually travelled. For contrast it also does what the
// old Chrome extension did — draw a widget inside the page, in a closed shadow root — and shows
// that one leaks.
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

let pass = true;
const check = (label, ok, detail) => {
  if (!ok) pass = false;
  console.log(`  ${ok ? '✓' : '✗'} ${label}` + (ok || detail === undefined ? '' : `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
};

// ── the hostile host page ─────────────────────────────────────────────────────────────────
const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>a page that wants your words</title></head><body>
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
  if (!url.pathname.startsWith('/button/') || !file.startsWith(path.join(ROOT, 'button')) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
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
const SCRIPTS = {
  [QUESTION]: { use: { name: 'read_block', input: { block: 'passport:tester', where: 'here' } }, answer: ANSWER },
  'make me a card': { use: { name: 'propose_card', input: { sentence: CARD } } },
  'say thanks to weft': { use: { name: 'propose_line', input: { room: 'pool:weft', text: LINE } } },
  'post in a room that is not there': { use: { name: 'propose_line', input: { room: 'pool:nowhere', text: 'hello?' } } },
  'a card I will refuse': { use: { name: 'propose_card', input: { sentence: 'never this one' } } },
  'a card under a fade': { use: { name: 'propose_card', input: { sentence: 'a sneaky card' } } },
  'answer with marks': { answer: 'Your **room** is `pool:tester`.\n## Where\nPlain words.' }
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
// its own guard against a page sliding a frame under the pointer. A person never notices; a test must wait.
const settle = () => sleep(700);
const within = (p, ms, label) => Promise.race([p, sleep(ms).then(() => ({ ok: false, error: 'no answer within ' + ms + 'ms: ' + label }))]);
async function armed(locator) { await locator.waitFor(); for (let i = 0; i < 60 && !(await locator.isEnabled()); i++) await sleep(50); }
const spy = (page) => page.evaluate(() => window.__spy);
const leaks = (s, words) => s.messages.filter((m) => words.some((w) => m.includes(w)));
// The unlock window closes itself the moment it hands over (unlock.js hand()), so a click that
// lands can see its page close before Playwright has finished with it. That close is the
// success being tested, not a fault.
const clickThatCloses = (p, sel) => Promise.all([p.waitForEvent('close'),
  p.click(sel).catch((e) => { if (!/closed/i.test(String(e && e.message))) throw e; })]);
const askIt = async (frame, q) => { await frame.locator('#q').fill(q); await frame.locator('#go').click(); };
const posts = () => beachLog.filter((r) => r.method === 'POST').length;

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
  await frame.locator('#dot').waitFor();
  await settle();

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
  await page.evaluate(() => { window.__spy.keys.length = 0; window.__spy.messages.length = 0; });

  console.log('\nunlocking, in the beach\'s own window:');
  await frame.locator('#dot').click();
  await frame.locator('#panel').waitFor();
  await settle();
  const [popup] = await Promise.all([context.waitForEvent('page'), frame.locator('#unlock').click()]);
  await popup.waitForLoadState();
  check('the window names the site that asked', (await popup.locator('#asker').textContent()).includes(`localhost:${SITE}`));
  await popup.locator('#h').pressSequentially('tester');
  await popup.locator('#s').pressSequentially(SECRET);
  await popup.locator('#k').fill(KEY);
  await popup.check('#rem');
  await clickThatCloses(popup, '#yes');
  await frame.locator('#who', { hasText: 'tester' }).waitFor();
  let s = await spy(page);
  check('the page heard no keystroke', s.keys.length === 0, s.keys);
  check('no message to the page carries the passphrase or the key', leaks(s, [SECRET, KEY]).length === 0, leaks(s, [SECRET, KEY]));
  check('the page has not been told the name either (not yet allowed)', s.hello.every((h) => h === null), s.hello);

  console.log('\nthe page asks, the person answers:');
  let pending = page.evaluate(() => window.beachButton.request({ kind: 'who' }));
  await frame.locator('.card button', { hasText: 'Tell it' }).click();
  const who = await pending;
  check('a page learns the name only when the person says so', who.ok && who.handle === 'tester', who);
  check('…and is told it as an event too', (await spy(page)).hello.includes('tester'));

  pending = page.evaluate(() => window.beachButton.request({ kind: 'write', block: 'standards:tester', spindle: '7', content: 'Partly — shown in the minutes.' }));
  await frame.locator('.card button', { hasText: 'Write it' }).click();
  const wrote = await pending;
  const post7 = beachLog.find((r) => r.method === 'POST' && r.body.block === 'standards:tester' && r.body.spindle === '7');
  check('a write the person approved lands', wrote.ok === true, wrote);
  check('…at the page\'s place on the beach, carrying the passphrase there and only there', !!post7 && post7.path === '/w/test-place/.well-known/pscale-beach' && post7.body.secret === SECRET, post7);
  check('…and the beach never learns which page asked (no referrer)', !!post7 && post7.referer === null, post7 && post7.referer);
  check('…the beach sees the button\'s origin, not the page\'s', !!post7 && post7.origin === `http://127.0.0.1:${SITE}`, post7 && post7.origin);
  s = await spy(page);
  check('the page\'s reply carries no secret', leaks(s, [SECRET, KEY]).length === 0, leaks(s, [SECRET, KEY]));

  const before = beachLog.length;
  const foreign = await page.evaluate(() => window.beachButton.request({ kind: 'write', block: 'lighthouse', content: { _: 'mine now' } }));
  check('a block not named for the person is refused before anyone is asked', !foreign.ok && /named for the person/.test(foreign.error), foreign);
  check('…and nothing reaches the beach', beachLog.length === before);

  console.log('\na page that tries to click yes for the person:');
  for (const [how, cover, uncover] of [
    ['fades the button', () => { document.querySelector('iframe[title="beach button"]').style.opacity = '0.2'; },
                         () => { document.querySelector('iframe[title="beach button"]').style.opacity = ''; }],
    ['lays a decoy over it', () => { const d = document.createElement('div'); d.id = 'decoy'; d.textContent = 'Click for a prize!';
                                     d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;pointer-events:none'; document.body.appendChild(d); },
                             () => { document.getElementById('decoy').remove(); }]
  ]) {
    await page.evaluate(cover);
    const n = beachLog.length;
    pending = page.evaluate(() => window.beachButton.request({ kind: 'write', block: 'standards:tester', spindle: '8', content: 'sneaky' }));
    const yes = frame.locator('.card button', { hasText: 'Write it' });
    await armed(yes);
    await yes.click({ force: true });
    const r = await within(pending, 5000, how);
    check(`a page that ${how} gets no yes`, !r.ok && /covered/.test(r.error || ''), r);
    check('…and nothing reaches the beach', beachLog.length === n);
    await page.evaluate(uncover);
  }
  await sleep(300);

  console.log('\nasking the beach — the person\'s own key, straight to Anthropic:');
  await frame.locator('#q').pressSequentially(QUESTION);
  await frame.locator('#go').click();
  await frame.locator('#said p', { hasText: ANSWER }).waitFor();
  s = await spy(page);
  check('the page heard none of the question being typed', s.keys.length === 0, s.keys.slice(0, 10));
  check('the page was told neither question nor answer', leaks(s, [QUESTION, ANSWER, KEY]).length === 0, leaks(s, [QUESTION, ANSWER]));
  check('the page\'s own fetch saw none of it', s.fetches.length === 0, s.fetches);
  check('Anthropic got the person\'s key and question', llmLog.length === 2 && llmLog[0].headers['x-api-key'] === KEY && llmLog[0].body.messages[0].content === QUESTION, llmLog.length);
  check('…on the default model, with fallbacks on', llmLog[0] && llmLog[0].body.model === 'claude-opus-5-5' && llmLog[0].body.fallbacks === 'default');
  check('…and the beach was read for it', beachLog.some((r) => r.method === 'GET' && r.query.block === 'passport:tester'));
  check('…the reads returned in one message, the assistant turn echoed unchanged', llmLog[1] && llmLog[1].body.messages.length === 3 && llmLog[1].body.messages[1].content[0].type === 'tool_use');

  console.log('\nthe page it stands on, as the page says it:');
  check('the question went to Anthropic with the page\'s address, its query and fragment dropped',
    llmLog[0].body.system.includes(PAGE_SAID) && !/page-secret|#frag/.test(llmLog[0].body.system), llmLog[0].body.system.slice(0, 300));
  check('…and the beach was told nothing of it', !beachLog.some((r) => JSON.stringify(r).includes('__test/host.html')));
  check('…a person holding a passphrase is offered the two proposals', ['read_block', 'propose_card', 'propose_line'].every((t) => llmLog[0].body.tools.some((x) => x.name === t)));
  // a page may say where it stands only within its own origin
  await page.evaluate(() => { document.querySelector('iframe[title="beach button"]').contentWindow.postMessage({ type: 'page', href: 'https://bank.example/account', title: 'Your bank' }, '*'); });
  await sleep(200);

  console.log('\na card and a line, proposed when asked, sent only on a yes:');
  const n0 = llmLog.length;
  await askIt(frame, 'make me a card');
  const addIt = frame.locator('.card button', { hasText: 'Add it' });
  await armed(addIt);
  check('the card is shown to the person before anything is written', !beachLog.some((r) => r.method === 'POST' && /^ahead:/.test(r.body.block)));
  await addIt.click();
  await frame.locator('#said p', { hasText: 'RESULT: Written' }).waitFor();
  const founded = beachLog.find((r) => r.method === 'POST' && r.body.block === 'ahead:now:tester' && r.body.new_lock);
  const card = beachLog.find((r) => r.method === 'POST' && r.body.block === 'ahead:now:tester' && r.body.spindle === '2');
  check('a hand not yet started is founded, latched to the person\'s own words', !!founded && founded.body.new_lock === SECRET && /^AHEAD — tester's hand/.test(founded.body.content._), founded);
  check('…the card lands in it for today, carrying the passphrase there and only there', !!card && card.body.secret === SECRET && card.body.content['1']._ === CARD && card.path === '/.well-known/pscale-beach', card);
  check('…saying the page it came from, its query and fragment dropped', !!card && card.body.content['1']['5'] === PAGE_SAID, card && card.body.content);
  check('…never the address another origin\'s message claimed', !beachLog.some((r) => JSON.stringify(r).includes('bank.example')) && !llmLog.slice(n0).some((l) => l.body.system.includes('bank.example')));
  check('…and the model is told what happened', llmLog.slice(n0).some((l) => JSON.stringify(l.body.messages).includes('Written: the card stands in ahead:now:tester at 21')));
  await askIt(frame, 'make me a card');
  await armed(addIt);
  await addIt.click();
  await frame.locator('#said p', { hasText: 'at 22, for today' }).last().waitFor();
  check('a second card takes the next free slot of today', beachLog.some((r) => r.method === 'POST' && r.body.block === 'ahead:now:tester' && r.body.spindle === '22' && !r.body.new_lock));

  await askIt(frame, 'say thanks to weft');
  const postIt = frame.locator('.card button', { hasText: 'Post it' });
  await armed(postIt);
  await postIt.click();
  await frame.locator('#said p', { hasText: 'RESULT: Posted in pool:weft at 7' }).waitFor();
  const line = beachLog.find((r) => r.method === 'POST' && r.body.block === 'pool:weft');
  check('a line goes into the room named, appended under the person\'s handle', !!line && line.body.append === true && line.body.content._ === LINE && line.body.content['1'] === 'tester', line);
  check('…carrying no passphrase, a room being open', !!line && !('secret' in line.body) && !JSON.stringify(line.body).includes(SECRET), line);
  check('…once the room was found standing', beachLog.some((r) => r.method === 'GET' && r.query.block === 'pool:weft' && r.query.pscale === '9'));

  let w0 = posts();
  await askIt(frame, 'post in a room that is not there');
  await frame.locator('#said p', { hasText: 'RESULT: Not posted: no room called pool:nowhere' }).waitFor();
  check('a room that does not stand is never founded by a line', posts() === w0);
  await askIt(frame, 'a card I will refuse');
  await frame.locator('.card button', { hasText: 'Not now' }).click();
  await frame.locator('#said p', { hasText: 'RESULT: Not written: tester said no' }).waitFor();
  check('a no writes nothing, and the model is told so', posts() === w0);
  await page.evaluate(() => { document.querySelector('iframe[title="beach button"]').style.opacity = '0.2'; });
  await askIt(frame, 'a card under a fade');
  await armed(addIt);
  await addIt.click({ force: true });
  await frame.locator('#said p', { hasText: 'RESULT: Not written: tester said no (covered' }).waitFor();
  check('a page that fades the button gets no yes for a proposal either', posts() === w0);
  await page.evaluate(() => { document.querySelector('iframe[title="beach button"]').style.opacity = ''; });
  await sleep(300);

  console.log('\nplain words, a whole header, and no echo:');
  await askIt(frame, 'answer with marks');
  const marked = frame.locator('#said p', { hasText: 'Plain words.' });
  await marked.waitFor();
  const shownText = await marked.textContent();
  check('an answer shows as plain text, its markdown marks taken out', shownText === 'Your room is pool:tester.\nWhere\nPlain words.', shownText);
  const head = await frame.locator('#who').evaluate((el) => ({ ws: getComputedStyle(el).whiteSpace, cut: el.scrollWidth > el.clientWidth }));
  check('the header line wraps rather than being cut off', head.ws !== 'nowrap' && !head.cut, head);
  await frame.locator('#q').fill('');
  await frame.locator('#mic').click();
  await sleep(400);
  const spoken = await frame.locator('#q').inputValue();
  check('a phone\'s repeated revisions land once — the words rebuilt, never appended', spoken === 'Hello world how are you. Second thing.', spoken);
  await frame.locator('#q').fill('');
  s = await spy(page);
  check('the page heard none of it', leaks(s, [CARD, LINE, SECRET, KEY, 'second thing']).length === 0 && s.keys.length === 0, leaks(s, [CARD, LINE]));

  console.log('\none site\'s button is not another\'s:');
  await frame.locator('#q').pressSequentially('a draft left on this site');
  const pageB = await context.newPage();
  await pageB.goto(`http://127.0.0.2:${SITE}/__test/host.html`);
  const frameB = pageB.frameLocator('iframe[title="beach button"]');
  await frameB.locator('#dot').waitFor();
  await settle();
  await frameB.locator('#dot').click();
  await frameB.locator('#panel').waitFor();
  await settle();
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
  check('…and is still on the first site', (await pageA2.frameLocator('iframe[title="beach button"]').locator('#q').inputValue()) === 'a draft left on this site');
  check('the second site was never told the name', (await spy(pageB)).hello.every((h) => h === null));

  console.log('\nthe unlock window answers only the button:');
  const [evil] = await Promise.all([context.waitForEvent('page'),
    page.evaluate((u) => { window.open(u + 'unlock.html?for=trusted.example&n=abc', 'evil', 'popup'); }, BUTTON)]);
  await evil.waitForLoadState();
  check('opened by a page, it shows nothing to type into and remembers no one', await evil.locator('#f').isHidden() && await evil.locator('#known').isHidden());
  await page.evaluate((u) => { const f = document.createElement('iframe'); f.id = 'framed-unlock'; f.src = u + 'unlock.html?for=x&n=abc'; document.body.appendChild(f); }, BUTTON);
  const framedUnlock = page.frameLocator('#framed-unlock');
  await framedUnlock.locator('#asker').waitFor();
  check('framed inside a page, it shows nothing either', await framedUnlock.locator('#f').isHidden() && await framedUnlock.locator('#known').isHidden());

  console.log('\nmoving it by its grip, as xstream moves its construction button:');
  const where_ = () => page.evaluate(() => {
    const f = document.querySelector('iframe[title="beach button"]'), g = document.querySelector('[data-beach-button-grip]');
    const fr = f.getBoundingClientRect(), gr = g.getBoundingClientRect();
    return { r: parseFloat(f.style.right), b: parseFloat(f.style.bottom), shown: getComputedStyle(g).display !== 'none',
             overlap: !(gr.right <= fr.left || gr.left >= fr.right || gr.bottom <= fr.top || gr.top >= fr.bottom), grip: [gr.x, gr.y, gr.width, gr.height] };
  });
  await frame.locator('#shut').click();
  await settle();
  let m0 = await where_();
  check('a grip stands beside the circle, never over the frame', m0.shown && !m0.overlap, m0);
  await frame.locator('#dot').click();
  await frame.locator('#panel').waitFor();
  let mOpen = await where_();
  check('…a tap on the circle opens it and moves nothing', mOpen.r === m0.r && mOpen.b === m0.b, { before: m0, after: mOpen });
  check('…and the open panel keeps a grip beside it, not over it', mOpen.shown && !mOpen.overlap, mOpen);
  await frame.locator('#shut').click();
  await settle();
  m0 = await where_();
  const gx = m0.grip[0] + m0.grip[2] / 2, gy = m0.grip[1] + m0.grip[3] / 2;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx - 120, gy - 80, { steps: 12 });
  await page.mouse.up();
  await sleep(100);
  const m1 = await where_();
  check('a mouse dragging the grip moves it exactly with the pointer', Math.abs(m1.r - m0.r - 120) <= 1 && Math.abs(m1.b - m0.b - 80) <= 1, { before: m0, after: m1 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const tx = m1.grip[0] + m1.grip[2] / 2, ty = m1.grip[1] + m1.grip[3] / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + 9 * i, y: ty + 4 * i }] }); await sleep(20); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await sleep(150);
  const m2 = await where_();
  check('a finger dragging the grip moves it too, as on a phone', Math.abs(m1.r - m2.r - 90) <= 1 && Math.abs(m1.b - m2.b - 40) <= 1, { before: m1, after: m2 });
  await page.evaluate(() => {
    const g = document.querySelector('[data-beach-button-grip]');
    ['ArrowLeft', 'ArrowLeft', 'ArrowUp'].forEach((key) => g.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
  });
  const m3 = await where_();
  check('the arrow keys move it too, a step at a time', m3.r - m2.r === 32 && m3.b - m2.b === 16, { before: m2, after: m3 });
  await page.evaluate(() => {
    const g = document.querySelector('[data-beach-button-grip]');
    for (let i = 0; i < 400; i++) g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  const m4 = await where_();
  check('…and it stops at the edge of the screen, never off it', m4.r === 0, m4);
  await page.reload();
  await page.frameLocator('iframe[title="beach button"]').locator('#dot').waitFor();
  const m5 = await where_();
  check('it stays where it was left when the page reloads', m5.r === m4.r && m5.b === m4.b, { left: m4, after: m5 });

  console.log('\nputting it away:');
  await settle();
  await frame.locator('#dot').click();
  await frame.locator('#panel').waitFor();
  await settle();
  await frame.locator('#away').click();
  // the frame asks the page to remove it by postMessage, one async hop after the click lands
  await page.locator('iframe[title="beach button"]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  check('put away, it is gone from the page, its grip with it', (await page.locator('iframe[title="beach button"]').count()) === 0 && (await page.locator('[data-beach-button-grip]').count()) === 0);
  await page.reload();
  await page.frameLocator('iframe[title="beach button"]').locator('#dot').waitFor();
  check('…until the page reloads', (await page.locator('iframe[title="beach button"]').count()) === 1);

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
