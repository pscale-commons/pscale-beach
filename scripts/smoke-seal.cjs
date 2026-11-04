// smoke-seal.cjs — the beach's seal (button/seal.js) in a real browser, against the ONE set of test vectors the connector
// keeps (bsp-mcp scripts/fixtures/gray-vectors.json, made by keys.ts): what the browser seals the router opens, and the
// other way round, in all four modes — self, grain, group and colour — with the pair and the latch one word derives, the
// grey line, and the device key that keeps nothing plain. The vendored libraries are what is checked here (nacl-fast,
// hash-wasm's argon2 as served), which node's copies in bsp-mcp's smoke are not.
//
//   NODE_PATH=$(npm root -g) npm run smoke:seal
//   GRAY_VECTORS=/path/to/gray-vectors.json names the fixtures (default: ../bsp-mcp-server/scripts/fixtures/gray-vectors.json)
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('smoke:seal needs Playwright — npm i -g playwright && npx playwright install chromium, then NODE_PATH=$(npm root -g) npm run smoke:seal'); process.exit(2); }

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = process.env.GRAY_VECTORS || path.resolve(ROOT, '..', 'bsp-mcp-server', 'scripts', 'fixtures', 'gray-vectors.json');
if (!fs.existsSync(FIXTURE)) { console.error(`no vectors at ${FIXTURE}: set GRAY_VECTORS to bsp-mcp's scripts/fixtures/gray-vectors.json`); process.exit(2); }
const F = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
if (!F.colour || !F.grain || !F.group) { console.error(`${FIXTURE} carries no grain, group or colour vectors: regenerate it in bsp-mcp (npm run smoke:gray-vectors -- --make)`); process.exit(2); }
const SITE = 8846;

let pass = true, n = 0;
const check = (label, ok, detail) => { n++; if (!ok) pass = false; console.log(`  ${ok ? '✓' : '✗'} ${label}` + (ok || detail === undefined ? '' : `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)); };

const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };
function site(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__test/seal.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(`<!doctype html><html><head><meta charset="utf-8"><title>the seal</title></head><body><script src="http://127.0.0.1:${SITE}/button/seal.js"></script></body></html>`); }
  const file = path.join(ROOT, url.pathname);
  if (!url.pathname.startsWith('/button/') || !file.startsWith(path.join(ROOT, 'button')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}

(async () => {
  const server = http.createServer(site).listen(SITE);
  let browser;
  try {
    browser = await chromium.launch();
    const p = await browser.newPage();
    p.on('pageerror', (e) => { console.log('  PAGE ERROR', e.message); pass = false; });
    await p.goto(`http://127.0.0.1:${SITE}/__test/seal.html`);
    await p.waitForFunction(() => !!window.beachSeal);
    await p.evaluate(() => beachSeal.ready());
    check('the seal loads its libraries from beside itself', await p.evaluate(() => !!(window.nacl && window.hashwasm)));
    /* every vector, in the browser: one evaluate per section, the results judged here */
    const r = await p.evaluate(async (F) => {
      const S = beachSeal, out = {};
      const hexOf = (u) => S.hex(u);
      out.self = [];
      for (const v of F.vectors) {
        const k = await S.key(v.secret, v.salt), pair = await S.pair(v.secret, v.salt), pub = S.published(pair);
        const sealed = await S.self.seal(v.plaintext, v.secret, v.salt);
        out.self.push({
          name: v.name, key: hexOf(k) === v.key_hex, open: (await S.self.open(v.envelope, v.secret, v.salt)) === v.plaintext,
          wrong: (await S.self.open(v.envelope, v.secret + 'x', v.salt)) === null,
          round: (await S.self.open(sealed, v.secret, v.salt)) === v.plaintext && sealed._ === v.envelope._ && sealed['9']['1'] === 'self',
          published: pub['2'] === v.x25519_pub_b64 && pub['1'] === v.ed25519_pub_b64 && pub._ === S.KEYS_NOTE,
          latch: (await S.latch(v.secret, v.salt)) === v.latch_b64,
          grey: S.grey(v.envelope) === 'sealed · self',
        });
      }
      const g = F.grain, pa = await S.pair(g.a.secret, g.a.handle), pb = await S.pair(g.b.secret, g.b.handle);
      const aPub = S.b64(pa.xpub), bPub = S.b64(pb.xpub);
      const toBob = await S.grain.seal(g.plaintext, g.a.secret, g.a.handle, g.b.handle, bPub, aPub);
      let refused = false; try { await S.grain.seal(g.plaintext, g.a.secret + 'x', g.a.handle, g.b.handle, bPub, aPub); } catch (e) { refused = /published at passport:ada 9/.test(e.message); }
      out.grain = {
        shared: hexOf(await S.grain.shared(g.b.secret, g.b.handle, aPub)) === g.shared_hex && hexOf(await S.grain.shared(g.a.secret, g.a.handle, bPub)) === g.shared_hex,
        bob: (await S.grain.open(g.envelope, g.b.secret, g.b.handle, aPub)) === g.plaintext,
        ada: (await S.grain.open(g.envelope, g.a.secret, g.a.handle, bPub)) === g.plaintext,
        round: toBob['9']['2'] === g.b.handle && (await S.grain.open(toBob, g.b.secret, g.b.handle, aPub)) === g.plaintext,
        stranger: (await S.grain.open(g.envelope, 'another word', 'carol', aPub)) === null,
        refused, grey: S.grey(g.envelope) === 'sealed · grain · for bob',
      };
      const gr = F.group, K = S.unb64(btoa(String.fromCharCode(...gr.K_hex.match(/../g).map((h) => parseInt(h, 16)))));
      const Kb = await S.group.unwrap(gr.ring, gr.member.secret, gr.member.handle);
      const w = await S.group.wrap(K, gr.member.handle, bPub), K2 = await S.group.unwrap(S.group.ring([w]), gr.member.secret, gr.member.handle);
      out.group = {
        unwrap: !!Kb && hexOf(Kb) === gr.K_hex, nobody: (await S.group.unwrap(gr.ring, gr.member.secret, 'nobody')) === null,
        open: (await S.group.open(gr.envelope, K)) === gr.plaintext, round: (await S.group.open(await S.group.seal(gr.plaintext, K), K)) === gr.plaintext,
        wrap: !!K2 && hexOf(K2) === gr.K_hex, grey: S.grey(gr.envelope) === 'sealed · group',
      };
      const c = F.colour, KC = S.unb64(btoa(String.fromCharCode(...c.K_hex.match(/../g).map((h) => parseInt(h, 16)))));
      const turns = S.colour.turns(c.block_node), cur = S.colour.current(c.block_node);
      const Kh = await S.colour.keyOf(cur, c.holder.secret, c.holder.handle);
      const line = await S.colour.seal(c.plaintext, c.block, '1', KC), letter = await S.colour.letter(c.letter.plaintext, c.block, '1', c.half_b64);
      const made = await S.colour.turn(KC, [await S.group.wrap(KC, c.holder.handle, aPub)], new Date(c.block_node['1']._.slice(5, 25)));
      const Km = await S.colour.keyOf({ address: '1', node: made }, c.holder.secret, c.holder.handle);
      out.colour = {
        turns: turns.length === 1 && turns[0].address === '1' && cur.address === '1',
        key: !!Kh && hexOf(Kh) === c.K_hex, stranger: (await S.colour.keyOf(cur, 'some other word', 'stranger')) === null,
        half: (await S.colour.half(KC)) === c.half_b64,
        open: (await S.colour.open(c.envelope, KC)) === c.plaintext, letter: (await S.colour.open(c.letter.envelope, KC)) === c.letter.plaintext,
        round: line._ === c.envelope._ && line['9']['2'] === c.block && line['9']['3'] === '1' && (await S.colour.open(line, KC)) === c.plaintext,
        letterRound: letter['9']['4'] && (await S.colour.open(letter, KC)) === c.letter.plaintext,
        turn: made._ === c.block_node['1']._ && made['2'] === c.half_b64 && !!Km && hexOf(Km) === c.K_hex,
        grey: S.grey(c.envelope) === c.grey && S.grey({ _: c.envelope, '1': 'ada' }) === c.grey && S.envelopeOf({ _: c.envelope, '1': 'ada' }) === c.envelope,
        supernested: (() => { const b = { _: { _: c.block_node._, '1': c.block_node['1'] }, '1': c.block_node['1'] }; const t = S.colour.turns(b); return t.length === 2 && t[0].address === '1' && t[1].address === '10' && S.colour.current(b).address === '10'; })(),
      };
      /* the device key: what is kept is ciphertext, and opens here alone */
      const blob = await S.keep.wrap('three-words-41');
      out.keep = { able: S.keep.able(), wrapped: S.keep.wrapped(blob) && !blob.includes('three-words'), back: (await S.keep.unwrap(blob)) === 'three-words-41',
        tampered: (await S.keep.unwrap(blob.slice(0, -4) + 'AAAA')) === null, plain: (await S.keep.unwrap('three-words-41')) === null };
      return out;
    }, F);
    console.log('\n— self —');
    for (const v of r.self) for (const k of ['key', 'open', 'wrong', 'round', 'published', 'latch', 'grey']) check(`${v.name}: ${k}`, v[k]);
    console.log('\n— grain —');
    for (const k of Object.keys(r.grain)) check(`grain: ${k}`, r.grain[k]);
    console.log('\n— group —');
    for (const k of Object.keys(r.group)) check(`group: ${k}`, r.group[k]);
    console.log('\n— colour —');
    for (const k of Object.keys(r.colour)) check(`colour: ${k}`, r.colour[k]);
    console.log('\n— kept on the device, never plain —');
    for (const k of Object.keys(r.keep)) check(`keep: ${k}`, r.keep[k]);
    /* the device key survives a reload and is the same key: a blob wrapped before opens after */
    const blob = await p.evaluate(() => beachSeal.keep.wrap('kept across a reload'));
    await p.reload();
    await p.waitForFunction(() => !!window.beachSeal);
    check('keep: the device key is kept by the browser across a reload, and a blob wrapped before opens after', (await p.evaluate((b) => beachSeal.keep.unwrap(b), blob)) === 'kept across a reload');
    const other = await browser.newContext(), q = await other.newPage();
    await q.goto(`http://127.0.0.1:${SITE}/__test/seal.html`);
    await q.waitForFunction(() => !!window.beachSeal);
    check('keep: another browser (another device key) opens nothing of it', (await q.evaluate((b) => beachSeal.keep.unwrap(b), blob)) === null);
    await other.close();
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  console.log(pass ? `\nthe beach's seal in the browser: ${n} checks, all pass ✓` : `\nFAILED (${n} checks)`);
  process.exit(pass ? 0 : 1);
})();
