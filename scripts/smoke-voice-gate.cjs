// smoke-voice-gate.cjs — the beach's voice (button/voice.js) at a MEMBERS' beach, end to end against the real
// handler: one local beach stood up gated (BEACH_GATE=members, its settings root-latched) and one open, the voice
// served to a plain page in headless Chromium.
//
//   NODE_PATH=$(npm root -g) npm run smoke:voice-gate
//
// Proves: a stranger's say is refused in the beach's own words with its code (members_only); a member proves their
// passport once (the browser asked for the key, a wrong one refused and asked again) for a pass the device keeps
// with its expiry and NOT the key; a say then lands with the pass and the latch, and the write keeps the key as
// ever; the pass given up, or run out, a write refused at the door is proved once more with its own key and made
// once again; the guard's refusal comes back with the kind found and never the value; a name with no passport
// is told so; a key not on the device is asked for only when asking is allowed; a reload still proves silently
// from the key the write kept; a newcomer cannot found a mirror; and on an open beach nothing changes.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('smoke:voice-gate needs Playwright — npm i -g playwright && npx playwright install chromium, then NODE_PATH=$(npm root -g) npm run smoke:voice-gate'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const SITE = 8842, GATED = 8841, OPEN = 8843, GATE_SECRET = 'test-gate-secret';
const W = '/.well-known/pscale-beach';
const beachAt = (port) => `http://127.0.0.1:${port}`;

let pass = true;
const check = (label, ok, detail) => {
  if (!ok) pass = false;
  console.log(`  ${ok ? '✓' : '✗'} ${label}` + (ok || detail === undefined ? '' : `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
};

// ── a client for seeding, as smoke-gate.mjs has one ──
function client(port) {
  return (method, p, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (resp) => {
      let b = ''; resp.on('data', (c) => (b += c)); resp.on('end', () => { let j = null; try { j = b ? JSON.parse(b) : null; } catch { j = { raw: b }; } resolve({ status: resp.statusCode, body: j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function ready(req) {
  for (let i = 0; i < 80; i++) { try { const r = await req('GET', W); if (r.status < 500) return true; } catch { /* not up */ } await new Promise((r) => setTimeout(r, 250)); }
  return false;
}
function spawnBeach(dir, port, env) {
  return spawn('node', [path.join(ROOT, 'scripts/local-beach.mjs'), '--dir', dir, '--port', String(port), '--origin', `127.0.0.1:${port}`], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...env } });
}
const nested = (line, floor) => { let n = line; for (let i = 0; i < floor; i++) n = { _: n }; return n; };
const SPINE = 'SPINE — string, the clock template only, never anyone\'s content. Floor 10 on the canonical clock.';

// ── the site: the voice, and a page that carries it ──
const page = (beach) => `<!doctype html><html><head><meta charset="utf-8"><title>a page at a members' beach</title></head>
<body><h1>The string</h1><script src="http://127.0.0.1:${SITE}/button/voice.js" data-beach="${beach}"></script></body></html>`;
function site(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__test/gated.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page(beachAt(GATED))); }
  if (url.pathname === '/__test/open.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page(beachAt(OPEN))); }
  const file = path.join(ROOT, url.pathname);
  if (!url.pathname.startsWith('/button/') || !file.startsWith(path.join(ROOT, 'button')) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/javascript' });
  res.end(fs.readFileSync(file));
}

(async () => {
  const dirG = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voice-gate-')), dirO = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voice-open-'));
  const gated = spawnBeach(dirG, GATED, { BEACH_GATE: 'members', BEACH_GATE_SECRET: GATE_SECRET, BEACH_KEEPERS: 'keeper' });
  const open = spawnBeach(dirO, OPEN, { BEACH_GATE: '', BEACH_GATE_SECRET: '', BEACH_KEEPERS: '' });
  const server = http.createServer(site).listen(SITE);
  const g = client(GATED), o = client(OPEN);
  let browser;
  try {
    if (!await ready(g) || !await ready(o)) { console.error('a local beach did not start'); process.exit(2); }
    // the rig: a keeper, two members, the family, the notice with the guard's line, the keeper's index; settings latched LAST
    for (const [b, body] of [
      ['passport:keeper', { spindle: '', content: { _: 'KEEPER' }, new_lock: 'K1' }],
      ['passport:ada', { spindle: '', content: { _: 'ADA' }, new_lock: 'A1' }],
      ['passport:bob', { spindle: '', content: { _: 'BOB' }, new_lock: 'B1' }],
      ['spine:string', { spindle: '', content: nested(SPINE, 10), new_lock: 'K1' }],
      ['notice', { spindle: '', content: { _: 'NOTICE', '6': { _: 'WHAT THE DOOR REFUSES', '1': 'people_keeping=passport:,string:' } }, new_lock: 'K1' }],
      ['index:keeper', { spindle: '', new_lock: 'K1', content: { _: "the keeper's index", '1': { _: 'notice', '5': 'beyond' }, '2': { _: 'passport:keeper', '5': 'beach' }, '3': { _: 'spine:string', '5': 'beach' }, '4': { _: 'index:keeper', '5': 'beach' }, '5': { _: 'settings', '5': 'beach' } } }],
      ['settings', { spindle: '', content: { _: 'the beach settings' }, new_lock: 'OP' }],
    ]) check(`seeded ${b}`, (await g('POST', `${W}?block=${b}`, body)).status === 200);
    check('the gate is up: a stranger sees only what is beyond', JSON.stringify((await g('GET', W)).body.blocks) === JSON.stringify(['notice']));
    check('the open beach: ada founds her passport', (await o('POST', `${W}?block=passport:ada`, { spindle: '', content: { _: 'ADA' }, new_lock: 'A1' })).status === 200);
    check('the open beach: the family', (await o('POST', `${W}?block=spine:string`, { spindle: '', content: nested(SPINE, 10) })).status === 200);

    browser = await chromium.launch();
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    const answers = [], asked = [];
    p.on('dialog', (d) => { asked.push(d.message()); d.accept(answers.length ? answers.shift() : ''); });
    const voice = (code) => p.evaluate(code);
    await p.goto(`http://127.0.0.1:${SITE}/__test/gated.html`);
    await p.waitForFunction(() => !!window.beachVoice);
    check('the voice speaks to the beach the page names', await voice(`beachVoice.beach`) === beachAt(GATED));

    console.log('\n— a stranger —');
    let r = await voice(`beachVoice.say({ field: 'string', at: '2026421365.111', text: 'SHARE https://example.org/a — a line', name: 'ada' })`);
    check("a stranger's say is refused at the door, in the beach's own words, with its code", r && r.ok === false && r.code === 'members_only' && /members' beach/.test(r.error || ''), r);
    check('no pass is held', await voice(`beachVoice.pass()`) === null);
    check('nothing was asked of the browser', asked.length === 0);
    r = await voice(`beachVoice.enter({ field: 'string', name: 'newbie' })`);
    check('a newcomer cannot found a mirror there', r && r.ok === false && r.code === 'members_only', r);

    console.log('\n— the proof —');
    answers.push('WRONG', 'A1');
    r = await voice(`beachVoice.prove({ name: 'ada' })`);
    check('ada proves her passport: a wrong key refused and asked again, the right one answered with the pass', r && r.ok && r.name === 'ada' && /T/.test(r.expires || ''), r);
    check('the browser was asked twice, the second time told the first was wrong', asked.length === 2 && /Enter it again/.test(asked[1]), asked);
    let held = await voice(`beachVoice.pass()`);
    check('the pass is held for ada, with its expiry', held && held.name === 'ada' && typeof held.pass === 'string' && held.expires === r.expires, held);
    let keys = await voice(`Object.keys(localStorage)`);
    check('the pass is kept on the device, and the key is not', keys.includes('beach-pass:' + beachAt(GATED)) && !keys.some((k) => /latch/.test(k)), keys);
    check('proving again holds the same pass without asking', (await voice(`beachVoice.prove({ name: 'ada' })`)).expires === held.expires && asked.length === 2);

    console.log('\n— a say with the pass —');
    r = await voice(`beachVoice.say({ field: 'string', at: '2026421365.111', text: 'SHARE https://example.org/a — a line', name: 'ada' })`);
    check("ada's say lands (the mirror founded under her passport's key, the line said), with no further question", r && r.ok && r.name === 'ada' && asked.length === 2, r);
    const back = await g('GET', `${W}?block=string:ada`, null, { Authorization: 'Bearer ' + held.pass });
    const at = (b, a) => { let n = b; for (const d of a.replace('.', '')) n = n && n[d === '0' ? '_' : d]; return n; };
    check('the line stands in string:ada at its address, read with the pass', at(back.body, '2026421365.111') === 'SHARE https://example.org/a — a line', back.body && Object.keys(back.body));
    check('read without a pass, string:ada is members-only', (await g('GET', `${W}?block=string:ada`)).status === 401);
    keys = await voice(`Object.keys(localStorage)`);
    check('the write kept the key, as every write does', keys.includes('next-latch:string:ada'), keys);

    console.log('\n— the pass given up, or run out: a write proves once more with its own key —');
    await voice(`beachVoice.leave()`);
    check('the pass is given up', await voice(`beachVoice.pass()`) === null);
    r = await voice(`beachVoice.say({ field: 'string', at: '2026421365.112', text: 'SHARE https://example.org/b — a second line', name: 'ada' })`);
    check('the say is refused at the door, proved with its own key, and made once again', r && r.ok, r);
    check('a pass is held again', (await voice(`beachVoice.pass()`) || {}).name === 'ada');
    const b64u = (t) => Buffer.from(t, 'utf8').toString('base64url');
    const expired = `m.${b64u('ada')}.${Date.now() - 1000}.AAAA`;
    await voice(`localStorage.setItem('beach-pass:${beachAt(GATED)}', JSON.stringify({ name: 'ada', pass: '${expired}', expires: new Date(Date.now() - 1000).toISOString() }))`);
    check('a pass run out is nobody to the page', await voice(`beachVoice.pass()`) === null);
    r = await voice(`beachVoice.say({ field: 'string', at: '2026421365.113', text: 'SHARE https://example.org/c — a third', name: 'ada' })`);
    check('a say with a pass run out is proved once more and lands', r && r.ok, r);

    console.log('\n— the guard behind the gate —');
    r = await voice(`beachVoice.say({ field: 'string', at: '2026421365.114', text: 'SHARE https://example.org/d — call me on 07700 900123', name: 'ada' })`);
    check('a line with a phone number is refused, the kind named', r && r.ok === false && r.code === 'people_keeping' && r.found === 'a phone number', r);
    check('and the number itself never comes back', !/900123/.test(JSON.stringify(r)));
    check('nothing stood there', (await g('GET', `${W}?block=string:ada`, null, { Authorization: 'Bearer ' + held.pass })).body && at((await g('GET', `${W}?block=string:ada`, null, { Authorization: 'Bearer ' + held.pass })).body, '2026421365.114') === undefined);

    console.log('\n— names and keys —');
    answers.push('x');
    r = await voice(`beachVoice.prove({ name: 'nobody' })`);
    check('a name with no passport is told so', r && r.ok === false && r.code === 'not_found' && /no member called nobody/.test(r.error), r);
    r = await voice(`beachVoice.prove({ name: 'bob', ask: false })`);
    check("a key not on the device, with asking not allowed, is said to be missing", r && r.ok === false && r.needKey === true, r);
    check('ada is the name the device signs with', await voice(`beachVoice.name()`) === 'ada');
    check("known: ada's passport, with the pass", await voice(`beachVoice.known('ada')`) === 'passport');
    await voice(`beachVoice.leave()`);
    await p.reload();
    await p.waitForFunction(() => !!window.beachVoice);
    const before = asked.length;
    r = await voice(`beachVoice.prove({ name: 'ada', ask: false })`);
    check('after a reload, the key the write kept proves her passport again without asking', r && r.ok && asked.length === before, r);

    console.log('\n— an open beach is unchanged —');
    const q = await ctx.newPage();
    q.on('dialog', (d) => d.accept('A1'));
    await q.goto(`http://127.0.0.1:${SITE}/__test/open.html`);
    await q.waitForFunction(() => !!window.beachVoice);
    r = await q.evaluate(`beachVoice.prove({ name: 'ada' })`);
    check('prove on an open beach says the beach has no gate', r && r.ok === false && r.open === true, r);
    r = await q.evaluate(`beachVoice.say({ field: 'string', at: '2026421365.111', text: 'SHARE https://example.org/a — open', name: 'ada' })`);
    check('a say lands there as it always has', r && r.ok, r);
    check('no pass is held there', await q.evaluate(`beachVoice.pass()`) === null);
    check('and the open read carries no Authorization header: string:ada reads back plainly', at((await o('GET', `${W}?block=string:ada`)).body, '2026421365.111') === 'SHARE https://example.org/a — open');
  } finally {
    if (browser) await browser.close();
    server.close(); gated.kill(); open.kill();
    await fs.promises.rm(dirG, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(dirO, { recursive: true, force: true }).catch(() => {});
  }
  console.log(pass ? "\nthe voice at a members' beach: all pass ✓" : '\nFAILED');
  process.exit(pass ? 0 : 1);
})();
