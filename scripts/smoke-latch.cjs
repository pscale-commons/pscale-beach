// smoke-latch.cjs — the derived latch at the voice (bsp-mcp proposals/2026-11-05-the-derived-latch.md §5, §7; button/latch.js),
// against the REAL handler: one local beach open and one a members' beach, the voice served to a plain page in headless Chromium,
// every body the page sends to a beach recorded. Proves: the switch runs when the holder asks (the marker, the passport, the
// blocks named for them moved; an open room left open), and after it the word is refused and the derived latch taken; a write
// after it goes with the derived latch; the switch back; a made key of the old three short words is weak, and asked for, three fresh words take
// every latch; a passport stripped of its marker is refused with nothing sent; a newcomer gets three words, founded under the
// derived latch only where the page asks. Needs Playwright (NODE_PATH as smoke:voice-gate says).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('smoke:latch needs Playwright — NODE_PATH=$(npm root -g) npm run smoke:latch'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const SITE = 8852, GATED = 8851, OPEN = 8853, W = '/.well-known/pscale-beach';
const at = (port) => `http://127.0.0.1:${port}`;
let pass = true;
const check = (label, ok, detail) => { if (!ok) pass = false; console.log(`  ${ok ? '✓' : '✗'} ${label}` + (ok || detail === undefined ? '' : `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)); };

// the beach's seal in node, with its own vendored libraries, for the keys the checks expect
// (copied as .cjs: this package is an ES module one, and the vendored libraries are scripts)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-latch-'));
fs.copyFileSync(path.join(ROOT, 'button/vendor/nacl-fast.min.js'), path.join(tmp, 'nacl.cjs'));
fs.copyFileSync(path.join(ROOT, 'button/vendor/argon2.umd.min.js'), path.join(tmp, 'argon2.cjs'));
const resolve0 = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'tweetnacl') return path.join(tmp, 'nacl.cjs');
  if (req === 'hash-wasm') return path.join(tmp, 'argon2.cjs');
  return resolve0.call(this, req, ...rest);
};
fs.copyFileSync(path.join(ROOT, 'button/seal.js'), path.join(tmp, 'seal.cjs'));
const S = require(path.join(tmp, 'seal.cjs'));

function client(port) {
  return (method, block, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify({ block, ...body }) : null;
    const r = http.request({ host: '127.0.0.1', port, method, path: W + '?block=' + encodeURIComponent(block), headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (resp) => {
      let b = ''; resp.on('data', (c) => (b += c)); resp.on('end', () => { let j = null; try { j = b ? JSON.parse(b) : null; } catch { j = null; } resolve({ status: resp.statusCode, body: j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
async function ready(req) { for (let i = 0; i < 80; i++) { try { if ((await req('GET', '')).status < 500) return true; } catch {} await new Promise((r) => setTimeout(r, 250)); } return false; }
function spawnBeach(dir, port, env) { return spawn('node', [path.join(ROOT, 'scripts/local-beach.mjs'), '--dir', dir, '--port', String(port), '--origin', `127.0.0.1:${port}`], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...env } }); }
const page = (beach) => `<!doctype html><html><head><meta charset="utf-8"><title>latch</title></head><body><script src="http://127.0.0.1:${SITE}/button/voice.js" data-beach="${beach}"></script></body></html>`;
function site(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__test/open.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page(at(OPEN))); }
  if (url.pathname === '/__test/gated.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page(at(GATED))); }
  const file = path.join(ROOT, url.pathname);
  if (!url.pathname.startsWith('/button/') || !file.startsWith(path.join(ROOT, 'button')) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(fs.readFileSync(file));
}

const W_ADA = 'rowan-pier-swallow-plover-41', OLD_BO = 'amber-anchor-apple-12', K_KEEPER = 'keeper-key-for-the-smoke', PROJECT = 'a-shared-project-lock';
const THREE = /^[1-9][0-9](-[a-z]{4,8}){3}$/;

(async () => {
  const dirO = fs.mkdtempSync(path.join(os.tmpdir(), 'latch-open-')), dirG = fs.mkdtempSync(path.join(os.tmpdir(), 'latch-gated-'));
  const open = spawnBeach(dirO, OPEN, { BEACH_GATE: '', BEACH_GATE_SECRET: '', BEACH_KEEPERS: '' });
  const gated = spawnBeach(dirG, GATED, { BEACH_GATE: 'members', BEACH_GATE_SECRET: 'latch-gate-secret', BEACH_KEEPERS: 'keeper' });
  const server = http.createServer(site).listen(SITE);
  const O = client(OPEN), G = client(GATED);
  let browser;
  try {
    if (!(await ready(O)) || !(await ready(G))) throw new Error('a local beach did not start');
    await O('POST', 'passport:ada', { spindle: '', content: { _: 'ADA' }, new_lock: W_ADA });
    await O('POST', 'notes:ada', { spindle: '', content: { _: 'ada notes' }, new_lock: W_ADA });
    await O('POST', 'pool:ada', { spindle: '', content: { _: 'a room, open' } });
    await O('POST', 'spine:shared', { spindle: '', content: { _: 'shared' }, new_lock: PROJECT });
    await O('POST', 'passport:bo', { spindle: '', content: { _: 'BO' }, new_lock: OLD_BO });
    await O('POST', 'notes:bo', { spindle: '', content: { _: 'bo notes' }, new_lock: OLD_BO });
    await G('POST', 'passport:keeper', { spindle: '', content: { _: 'KEEPER' }, new_lock: K_KEEPER });
    await G('POST', 'settings', { spindle: '', content: { _: 'the beach settings' }, new_lock: 'OP' });
    const L_ADA = await S.latch(W_ADA, 'ada');

    browser = await chromium.launch();
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    const sent = [];
    await pg.route('**/*', (route) => {
      const r = route.request(), u = r.url();
      if ((u.startsWith(at(OPEN)) || u.startsWith(at(GATED))) && r.method() === 'POST') { try { const b = JSON.parse(r.postData() || 'null'); if (b) sent.push(b); } catch {} }
      return route.continue();
    });
    let answers = [];
    pg.on('dialog', (d) => d.accept(answers.length ? answers.shift() : ''));
    const V = (fn, arg) => pg.evaluate(([f, a]) => window.beachVoice[f](a), [fn, arg]);
    await pg.goto(`http://127.0.0.1:${SITE}/__test/open.html`);
    await pg.waitForFunction(() => !!window.beachVoice);

    console.log('\nthe switch, when the holder asks');
    answers = [W_ADA];
    let r = await V('wear', { name: 'ada' });
    check('ada puts the word on: the halves are published at passport:ada 9', r && r.ok, r);
    r = await V('switch', { name: 'ada' });
    check('the switch runs: the block named for ada moved, the open room left open', r && r.ok && r.swept && r.moved.includes('notes:ada') && r.open.includes('pool:ada'), r);
    const p9 = (await O('GET', 'passport:ada')).body['9'];
    check('9.3 says derived and swept, beside the halves', typeof p9['3'] === 'string' && /^latch: derived\b/.test(p9['3']) && / · swept /.test(p9['3']), p9);
    for (const b of ['passport:ada', 'notes:ada']) check(`${b}: the word refused, the derived latch taken`, (await O('POST', b, { spindle: '7', content: 'x', secret: W_ADA })).status === 403 && (await O('POST', b, { spindle: '7', content: 'y', secret: L_ADA })).status === 200);
    console.log('\na write after the switch');
    await pg.evaluate(() => localStorage.setItem('render:who', 'ada'));
    let n = sent.length;
    r = await pg.evaluate(() => window.beachVoice.set('9.2', 'dark'));
    const founding = sent.slice(n).find((b) => b.block === 'settings:ada');
    check("ada's settings are founded under the derived latch, and the passport takes it", r && r.ok && founding && founding.new_lock === L_ADA, { r, founding: founding && { lock: founding.new_lock === L_ADA } });
    // the switch itself sends the word once a latch, to move it (R4); nothing after it does
    check('no request after the switch carried the word', !sent.slice(n).some((b) => b.secret === W_ADA || b.new_lock === W_ADA), sent.slice(n).map((b) => b.block));

    console.log('\nthe switch back');
    r = await V('switch', { name: 'ada', back: true });
    check('it runs, 9.3 is gone, and the word is taken again', r && r.ok && (await O('GET', 'passport:ada')).body['9']['3'] === undefined && (await O('POST', 'notes:ada', { spindle: '8', content: 'x', secret: W_ADA })).status === 200, r);

    console.log('\na made key of the old three short words, and three fresh ones asked for');
    answers = [OLD_BO];
    await V('wear', { name: 'bo' });
    check('a key of the old three short words is read as weak', await pg.evaluate(() => window.beachVoice.weak('bo')) === true);
    r = await V('switch', { name: 'bo', fresh: true });
    const fresh = await pg.evaluate(() => window.beachVoice.made({ field: 'passport', name: 'bo' }));
    check('three new words, said once, and every latch on theirs', r && r.ok && r.made && fresh && THREE.test(fresh.key), { r, made: !!fresh && THREE.test(fresh.key) });
    if (fresh) {
      const L_new = await S.latch(fresh.key, 'bo');
      check('the old key is refused at passport:bo and notes:bo, the new derived latch taken', (await O('POST', 'notes:bo', { spindle: '1', content: 'x', secret: OLD_BO })).status === 403 && (await O('POST', 'notes:bo', { spindle: '1', content: 'y', secret: L_new })).status === 200);
      check("the new halves stand at bo's 9", (await O('GET', 'passport:bo')).body['9']['2'] === S.published(await S.pair(fresh.key, 'bo'))['2']);
      console.log('\na beach that stops saying the form');
      await O('POST', 'passport:bo', { spindle: '9', content: S.published(await S.pair(fresh.key, 'bo')), secret: L_new });
      await pg.reload(); await pg.waitForFunction(() => !!window.beachVoice);
      await pg.evaluate(() => localStorage.setItem('render:who', 'bo'));
      n = sent.length;
      r = await pg.evaluate(() => window.beachVoice.set('9.2', 'light'));
      check('a write for a hand this device saw switched is refused, with nothing sent', r && !r.ok && r.code === 'form_gone' && !sent.slice(n).some((b) => b.block === 'settings:bo'), r);
    }

    console.log("\na newcomer at a members' beach");
    await pg.goto(`http://127.0.0.1:${SITE}/__test/gated.html`);
    await pg.waitForFunction(() => !!window.beachVoice);
    answers = [K_KEEPER];
    const inv1 = await V('invite', { name: 'keeper', for: 'cy' });
    n = sent.length;
    r = await V('join', { invite: inv1.invite, name: 'cy', derived: true });
    const madeCy = await pg.evaluate(() => window.beachVoice.made({ field: 'passport', name: 'cy' }));
    const foundCy = sent.slice(n).find((b) => b.block === 'passport:cy' && b.new_lock);
    check('a newcomer the page asks to be born switched gets three words, founded under the derived latch, the marker in the same write', r && r.ok && madeCy && THREE.test(madeCy.key) && foundCy && foundCy.new_lock === await S.latch(madeCy.key, 'cy') && /^latch: derived/.test(foundCy.content['9']['3']), { r, made: madeCy && THREE.test(madeCy.key) });
    check("…and the newcomer's word was never sent", !sent.slice(n).some((b) => madeCy && (b.secret === madeCy.key || b.new_lock === madeCy.key)));
    answers = [K_KEEPER];
    const inv2 = await V('invite', { name: 'keeper', for: 'dee' });
    n = sent.length;
    r = await V('join', { invite: inv2.invite, name: 'dee' });
    const madeDee = await pg.evaluate(() => window.beachVoice.made({ field: 'passport', name: 'dee' }));
    const foundDee = sent.slice(n).find((b) => b.block === 'passport:dee' && b.new_lock);
    check('a newcomer not asked to switch gets three words too, founded under the word as before', r && r.ok && madeDee && THREE.test(madeDee.key) && foundDee && foundDee.new_lock === madeDee.key, { r });
  } catch (e) {
    pass = false; console.error('  ✗ ' + ((e && e.stack) || e));
  } finally {
    if (browser) await browser.close();
    server.close(); open.kill(); gated.kill();
    for (const d of [dirO, dirG, tmp]) fs.rmSync(d, { recursive: true, force: true });
  }
  console.log(pass ? '\nsmoke:latch passed' : '\nsmoke:latch FAILED');
  process.exit(pass ? 0 : 1);
})();
