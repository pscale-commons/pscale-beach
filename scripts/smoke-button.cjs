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
  'lighthouse': { _: 'the test place' }
};
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
      const b = BLOCKS[url.searchParams.get('block')];
      res.writeHead(b ? 200 : 404); return res.end(JSON.stringify(b || { error: 'not found', code: 'not_found' }));
    }
    if (req.method === 'POST') {
      const named = /:tester$/.test(body.block);
      if (named && body.secret !== SECRET) { res.writeHead(403); return res.end(JSON.stringify({ error: 'secret does not match', code: 'lock_required' })); }
      res.writeHead(200); return res.end(JSON.stringify({ ok: true }));
    }
    res.writeHead(405); res.end('{}');
  });
}

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
    const last = body.messages[body.messages.length - 1];
    const answered = Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_result');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answered
      ? { id: 'msg_2', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: ANSWER }] }
      : { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'read_block', input: { block: 'passport:tester', where: 'here' } }] }));
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
  const browser = await chromium.launch(Object.assign({ executablePath: process.env.CHROMIUM_PATH || undefined }, opts));
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${SITE}/__test/host.html`);
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
  await Promise.all([popup.waitForEvent('close'), popup.click('#yes')]);
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
  await Promise.all([popupB.waitForEvent('close'), popupB.click('#useknown')]);
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

  console.log('\nmoving it and putting it away:');
  const at0 = await page.evaluate(() => { const f = document.querySelector('iframe[title="beach button"]'); return [parseInt(f.style.right, 10), parseInt(f.style.bottom, 10)]; });
  await frame.locator('#shut').click();
  await settle();
  const box = await page.locator('iframe[title="beach button"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 - 40, { steps: 8 });
  await page.mouse.up();
  const at1 = await page.evaluate(() => { const f = document.querySelector('iframe[title="beach button"]'); return [parseInt(f.style.right, 10), parseInt(f.style.bottom, 10)]; });
  check('dragging moves it with the pointer', at1[0] - at0[0] >= 50 && at1[1] - at0[1] >= 30, { before: at0, after: at1 });
  await settle();
  await frame.locator('#dot').click();
  await frame.locator('#panel').waitFor();
  await settle();
  await frame.locator('#away').click();
  // the frame asks the page to remove it by postMessage, one async hop after the click lands
  await page.locator('iframe[title="beach button"]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  check('put away, it is gone from the page', (await page.locator('iframe[title="beach button"]').count()) === 0);
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
