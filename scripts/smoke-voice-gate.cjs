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
// from the key the write kept; a newcomer cannot found a mirror; a member mints an invitation and a newcomer joins
// with it (their passport founded, a key made and said once, the pass earned, a say landing with no question), one run
// out or for another name refused here, a forged one and a standing name refused at the door, the guard's refusal
// naming the kind; and on an open beach nothing changes.
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
const bearer2 = (p) => ({ Authorization: 'Bearer ' + (p && p.pass) });
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
    /* THE ONE WORD (coloured stigmergy step 4): keying in publishes the halves the word derives at the passport's 9, so a keeper can seal a colour's copy to her */
    check('her one word published its halves at passport:ada 9 as she keyed in', r.keys === 'published', r);
    let held = await voice(`beachVoice.pass()`);
    check('the pass is held for ada, with its expiry', held && held.name === 'ada' && typeof held.pass === 'string' && held.expires === r.expires, held);
    let keys = await voice(`Object.keys(localStorage)`);
    check('the pass is kept on the device, and the key beside it, wrapped, never plain', keys.includes('beach-pass:' + beachAt(GATED)) && keys.includes('beach-key:passport:ada') && !keys.some((k) => /latch/.test(k)) && /^w1\./.test(await voice(`localStorage.getItem('beach-key:passport:ada')`)), keys);
    check('proving again holds the same pass without asking', (await voice(`beachVoice.prove({ name: 'ada' })`)).expires === held.expires && asked.length === 2);

    console.log('\n— a say with the pass —');
    r = await voice(`beachVoice.say({ field: 'string', at: '2026421365.111', text: 'SHARE https://example.org/a — a line', name: 'ada' })`);
    check("ada's say lands (the mirror founded under her passport's key, the line said), with no further question", r && r.ok && r.name === 'ada' && asked.length === 2, r);
    const back = await g('GET', `${W}?block=string:ada`, null, { Authorization: 'Bearer ' + held.pass });
    const at = (b, a) => { let n = b; for (const d of a.replace('.', '')) n = n && n[d === '0' ? '_' : d]; return n; };
    check('the line stands in string:ada at its address, read with the pass', at(back.body, '2026421365.111') === 'SHARE https://example.org/a — a line', back.body && Object.keys(back.body));
    check('read without a pass, string:ada is members-only', (await g('GET', `${W}?block=string:ada`)).status === 401);
    keys = await voice(`Object.keys(localStorage)`);
    check('the write kept the key, as every write does', keys.includes('beach-key:string:ada'), keys);

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

    console.log('\n— an invitation: a member mints, a newcomer joins —');
    r = await voice(`beachVoice.invite()`);
    check('ada, holding her pass, mints an invitation with no question', r && r.ok && r.name === 'ada' && r.by === 'ada' && r.for === '' && typeof r.invite === 'string' && asked.length === 2, r);
    const inv = r && r.invite;
    let says = await voice(`beachVoice.invited(${JSON.stringify(inv)})`);
    check('what it says of itself, the beach not asked: from ada, for anyone, seven days', says && says.by === 'ada' && says.for === '' && Date.parse(says.expires) - Date.now() > 6.9 * 864e5, says);
    check('a pass or a stray string is not an invitation', await voice(`beachVoice.invited(${JSON.stringify(held.pass)})`) === null && await voice(`beachVoice.invited('nonsense')`) === null);
    const ctxN = await browser.newContext(), pn = await ctxN.newPage(), nAsked = [];
    pn.on('dialog', (d) => { nAsked.push(d.message()); d.accept(''); });
    await pn.goto(`http://127.0.0.1:${SITE}/__test/gated.html`);
    await pn.waitForFunction(() => !!window.beachVoice);
    const newcomer = (code) => pn.evaluate(code);
    r = await newcomer(`beachVoice.join({ invite: ${JSON.stringify(inv)}, name: 'newbie', passport: 'newbie — joined at ada’s invitation.' })`);
    check('a newcomer joins on their own device: the passport founded with the invitation, a key made here, the pass earned at once', r && r.ok && r.name === 'newbie' && r.made === true && r.founded === true && /T/.test(r.expires || ''), r);
    keys = await newcomer(`Object.keys(localStorage)`);
    check('the key is kept where every write keeps one, and the pass beside it', keys.includes('beach-key:passport:newbie') && keys.includes('beach-pass:' + beachAt(GATED)), keys);
    const madeKey = await newcomer(`beachVoice.made({ field: 'passport', name: 'newbie' })`);
    check('the key made here is said once, two digits and three words (the derived latch, §7)', madeKey && madeKey.name === 'newbie' && /^[1-9][0-9](-[a-z]{4,8}){3}$/.test(madeKey.key), madeKey);
    check('and never twice', await newcomer(`beachVoice.made({ field: 'passport', name: 'newbie' })`) === null);
    const nPass = await newcomer(`beachVoice.pass()`);
    const pp = await g('GET', `${W}?block=passport:newbie`, null, { Authorization: 'Bearer ' + nPass.pass });
    check('the passport stands in the words the page gave, read with the new pass', pp.status === 200 && pp.body && pp.body._ === 'newbie — joined at ada’s invitation.', pp.body);
    r = await newcomer(`beachVoice.say({ field: 'string', at: '2026421365.115', text: 'SHARE https://example.org/n — newbie’s first', name: 'newbie' })`);
    check('newbie shares with no further question: the mirror founded under the passport’s key', r && r.ok && r.name === 'newbie' && nAsked.length === 0, { r, nAsked });
    r = await newcomer(`beachVoice.join({ invite: ${JSON.stringify(inv)}, name: 'second' })`);
    check('the invitation, taken once, founds nothing more: refused in words of its own, with whom to ask', r && r.ok === false && r.status === 410 && r.code === 'invite_spent' && r.by === 'ada' && /ask ada/.test(r.error || ''), r);
    r = await voice(`beachVoice.invite()`);
    const inv2 = r && r.invite;
    check('so ada mints another', r && r.ok && typeof inv2 === 'string' && inv2 !== inv, r);
    r = await newcomer(`beachVoice.join({ invite: ${JSON.stringify(inv2)}, name: 'ada' })`);
    check('a name that stands is refused at the door, in words of its own: the name stands', r && r.ok === false && r.status === 409 && r.code === 'name_taken' && r.by === 'ada' && /passport:ada already stands/.test(r.error || ''), r);
    const b64 = (t) => Buffer.from(t, 'utf8').toString('base64url');
    r = await newcomer(`beachVoice.join({ invite: 'i.${b64('ada')}.${Date.now() - 1000}.AAAA', name: 'late' })`);
    check('an invitation run out is said so here, with whom to ask, and the beach never asked', r && r.ok === false && r.code === 'expired' && /ran out on .* ask ada/.test(r.error), r);
    r = await newcomer(`beachVoice.join({ invite: 'i.${b64('ada')}.${Date.now() + 100000}.AAAA', name: 'forger' })`);
    check('a forged one is nobody at the door', r && r.ok === false && r.code === 'members_only', r);
    r = await newcomer(`beachVoice.join({ invite: 'nonsense', name: 'x' })`);
    check('a string that is not an invitation', r && r.ok === false && r.code === 'invite', r);
    r = await newcomer(`beachVoice.join({ invite: ${JSON.stringify(inv)}, name: '' })`);
    check('no name, no join', r && r.ok === false && r.needName === true, r);
    r = await newcomer(`beachVoice.join({ invite: ${JSON.stringify(inv2)}, name: 'caller', passport: 'caller — ring me on 07700 900123' })`);
    check('a passport line with a phone number is refused by the guard, the kind named and never the number', r && r.ok === false && r.code === 'people_keeping' && r.found === 'a phone number' && !/900123/.test(JSON.stringify(r)), r);
    check('and nothing stood for caller', (await g('POST', `${W}?block=passport:caller`, { secret: 'x' })).status === 404);
    r = await newcomer(`beachVoice.join({ invite: ${JSON.stringify(inv2)}, name: 'quietly', passport: 'quietly — joined at ada’s invitation.' })`);
    check('the refusals spent nothing: the same invitation then founds a passport', r && r.ok && r.founded === true && r.name === 'quietly', r);
    r = await voice(`beachVoice.invite({ for: 'pearl' })`);
    check('ada mints an invitation for pearl', r && r.ok && r.for === 'pearl', r);
    const forPearl = r && r.invite;
    says = await voice(`beachVoice.invited(${JSON.stringify(forPearl)})`);
    check('it says who it is for', says && says.by === 'ada' && says.for === 'pearl', says);
    r = await newcomer(`beachVoice.join({ invite: ${JSON.stringify(forPearl)}, name: 'other' })`);
    check('it founds no other name, said here before the beach is asked', r && r.ok === false && r.code === 'for' && /for pearl, not other/.test(r.error), r);
    const ctxP = await browser.newContext(), pq = await ctxP.newPage();
    pq.on('dialog', (d) => d.accept(''));
    await pq.goto(`http://127.0.0.1:${SITE}/__test/gated.html`);
    await pq.waitForFunction(() => !!window.beachVoice);
    r = await pq.evaluate(`beachVoice.join({ invite: ${JSON.stringify(forPearl)}, name: 'pearl', key: 'P-own' })`);
    check('pearl joins with it under a key of her own choosing, none made', r && r.ok && r.name === 'pearl' && r.made === false, r);
    const pearlKept = await pq.evaluate(`localStorage.getItem('beach-key:passport:pearl')`);
    check('her key is kept — wrapped, never plain — and made() has nothing to say', /^w1\./.test(pearlKept || '') && !pearlKept.includes('P-own') && await pq.evaluate(`beachVoice.made({ field: 'passport', name: 'pearl' })`) === null, pearlKept);
    r = await voice(`beachVoice.invite({ for: 'no>good' })`);
    check('a name is cleaned here as every name is, before the beach sees it', r && r.ok && r.for === 'nogood', r);
    r = await voice(`beachVoice.invite({ for: 'a name far too long to be anyone on the beach at all' })`);
    check('and one too long mints nothing', r && r.ok === false && /32/.test(r.error), r);
    r = await pq.evaluate(`beachVoice.leave(); beachVoice.invite({ name: 'bob', ask: false })`);
    check('with no pass and no key at hand, and asking not allowed, nothing is minted', r && r.ok === false && r.needKey === true, r);
    await ctxN.close();

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

    console.log('\n— a colour at the door: the keeper founds it, a member shares in it, a member reads the words, one without it and a stranger read the grey line —');
    const askedBefore = asked.length;
    const pub9 = (await g('GET', `${W}?block=passport:ada`, null, bearer2(await voice(`beachVoice.pass()`)))).body;
    check('the halves stand at passport:ada 9 in the shape pscale_key_publish leaves', pub9 && pub9['9'] && typeof pub9['9']['1'] === 'string' && typeof pub9['9']['2'] === 'string' && /^Published public keys/.test(pub9['9']._), pub9 && pub9['9']);
    const ctxB = await browser.newContext(), pb = await ctxB.newPage(); pb.on('dialog', (d) => d.accept('B1'));
    await pb.goto(`http://127.0.0.1:${SITE}/__test/gated.html`); await pb.waitForFunction(() => !!window.beachVoice);
    const bob = (code) => pb.evaluate(code);
    r = await bob(`beachVoice.prove({ name: 'bob' })`);
    check('bob keys in: his halves published too', r && r.ok && r.keys === 'published', r);
    const ctxK = await browser.newContext(), pk = await ctxK.newPage(); pk.on('dialog', (d) => d.accept('K1'));
    await pk.goto(`http://127.0.0.1:${SITE}/__test/gated.html`); await pk.waitForFunction(() => !!window.beachVoice);
    r = await pk.evaluate(`beachVoice.prove({ name: 'keeper' })`);
    check('the keeper keys in', r && r.ok, r);
    /* THE KEEPER'S DOOR, in the browser: the colour founded with the beach's own seal — turn 1, a copy sealed to each member's published half, latched whole under the keeper's key */
    r = await pk.evaluate(async (W) => {
      await beachVoice.colours({ name: 'keeper' });   // loads the seal
      const S = beachSeal, H = { Authorization: 'Bearer ' + beachVoice.pass().pass, 'Content-Type': 'application/json' };
      const half = async (h) => S.publishedOf((await (await fetch(W + '?block=passport:' + h, { headers: H })).json())['9']).x25519;
      const K = await S.group.key();
      const turn = await S.colour.turn(K, [await S.group.wrap(K, 'ada', await half('ada')), await S.group.wrap(K, 'bob', await half('bob'))]);
      const w = await fetch(W, { method: 'POST', headers: H, body: JSON.stringify({ block: 'colour:salt', content: { _: 'colour:salt — a readership: SALT’s members’ words; a line sealed in this colour opens for each holder of a copy below', '1': turn }, new_lock: 'K1' }) });
      return { status: w.status, copies: S.group.copies(turn['1']).map((c) => c._), half: typeof turn['2'] === 'string' };
    }, `${beachAt(GATED)}${W}`);
    check('colour:salt founded by the keeper, latched whole: turn 1 with copies for ada and bob and the public half for letters', r.status === 200 && r.copies.join() === 'ada,bob' && r.half, r);
    check('the colour is latched whole: a write to it without the keeper’s key is refused', (await g('POST', `${W}?block=colour:salt`, { spindle: '2', content: 'x' }, bearer2(await voice(`beachVoice.pass()`)))).status === 403);
    r = await voice(`beachVoice.colours({ name: 'ada' })`);
    check('ada holds the colour: her word opens her copy in its current turn', Array.isArray(r) && r.length === 1 && r[0].name === 'salt' && r[0].block === 'colour:salt' && r[0].turn === '1', r);
    check('pearl, with no copy, holds none', JSON.stringify(await pq.evaluate(`beachVoice.colours({ name: 'pearl' })`)) === '[]');
    r = await voice(`beachVoice.say({ field: 'string', at: '2026421365.121', text: 'SHARE https://example.org/salt — a line only SALT reads', name: 'ada', gray: 'colour:salt' })`);
    check('ada shares in the colour: sealed before it left, in turn 1, with no question asked', r && r.ok && r.sealed === 'colour' && r.turn === '1' && asked.length === askedBefore, r);
    const sealedAt = (await g('GET', `${W}?block=string:ada`, null, bearer2(await voice(`beachVoice.pass()`)))).body;
    const env = at(sealedAt, '2026421365.121');
    check('the envelope stands at the address, naming its colour and turn, and the block carries none of the words', env && env['9'] && env['9']['1'] === 'colour' && env['9']['2'] === 'colour:salt' && env['9']['3'] === '1' && env._ === 'Sealed for colour:salt, turn 1.' && !JSON.stringify(sealedAt).includes('only SALT reads'), env);
    check('ada reads her own line back', await voice(`beachVoice.open(${JSON.stringify(env)}, { name: 'ada' })`) === 'SHARE https://example.org/salt — a line only SALT reads');
    check('bob opens it with his own copy, worn from then on', await bob(`beachVoice.open(${JSON.stringify(env)}, { name: 'bob' })`) === 'SHARE https://example.org/salt — a line only SALT reads');
    check('pearl, without the colour, opens nothing and is shown the grey line', await pq.evaluate(`beachVoice.open(${JSON.stringify(env)}, { name: 'pearl' })`) === null && await pq.evaluate(`beachVoice.grey(${JSON.stringify(env)})`) === 'sealed · colour · salt · turn 1');
    const ctxS = await browser.newContext(), ps = await ctxS.newPage();
    await ps.goto(`http://127.0.0.1:${SITE}/__test/gated.html`); await ps.waitForFunction(() => !!window.beachVoice);
    check('a stranger is at the door: the string is members-only, and the voice opens nothing for no one', (await g('GET', `${W}?block=string:ada`)).status === 401 && await ps.evaluate(`beachVoice.open(${JSON.stringify(env)})`) === null && await ps.evaluate(`beachVoice.grey(${JSON.stringify(env)})`) === 'sealed · colour · salt · turn 1');
    r = await pq.evaluate(`beachVoice.say({ field: 'string', at: '2026421365.122', text: 'SHARE https://example.org/letter — a letter to SALT from pearl', name: 'pearl', gray: 'colour:salt' })`);
    check('pearl, holding no copy, seals a letter to the colour', r && r.ok && r.sealed === 'letter' && r.turn === '1', r);
    const letter = at((await g('GET', `${W}?block=string:pearl`, null, bearer2(await pq.evaluate(`beachVoice.pass()`)))).body, '2026421365.122');
    check('every holder reads the letter, and its writer cannot', await voice(`beachVoice.open(${JSON.stringify(letter)}, { name: 'ada' })`) === 'SHARE https://example.org/letter — a letter to SALT from pearl' && await pq.evaluate(`beachVoice.open(${JSON.stringify(letter)}, { name: 'pearl' })`) === null && typeof letter['9']['4'] === 'string');
    r = await voice(`beachVoice.keep({ field: 'string', content: { _: 'x' }, name: 'ada', gray: true })`);
    check('a mirror is never sealed whole', r && r.ok === false && /never sealed whole/.test(r.error), r);
    await p.reload(); await p.waitForFunction(() => !!window.beachVoice);
    r = await voice(`beachVoice.colours({ name: 'ada' })`);
    check('after a reload the key her write kept, wrapped, opens her copy again without a question', Array.isArray(r) && r.length === 1 && r[0].name === 'salt' && asked.length === askedBefore, r);
    keys = await voice(`Object.keys(localStorage)`);
    const vals = await voice(`Object.keys(localStorage).filter((k) => /^beach-key:/.test(k)).map((k) => localStorage.getItem(k))`);
    check('nothing on the device is a key in plain text: the kept keys are wrapped', keys.every((k) => !/latch/.test(k)) && vals.length >= 1 && vals.every((v) => /^w1\./.test(v) && !/A1|string/.test(v)), { keys, vals });
    await ctxB.close(); await ctxK.close(); await ctxS.close(); await ctxP.close();

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
    r = await q.evaluate(`beachVoice.invite({ name: 'ada' })`);
    check('an invitation to an open beach is nothing: anyone may come in', r && r.ok === false && r.open === true, r);
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
