/* The beach's voice — the page's side of the beach button, in one script tag.
 *
 *   <script src="https://beach.happyseaurchin.com/button/voice.js"></script>
 *
 * A page that takes a person's words makes one call, and the words stand on the beach in that
 * person's name, in their own mirror of a family (<field>:<handle>, at the addresses of
 * spine:<field>):
 *
 *   beachVoice.say({ field, at, text, name })   a reading at one address; saying again there replaces it
 *   beachVoice.keep({ field, content, name })   the person's whole mirror of the family, at once
 *   beachVoice.ask(text)                        a question put in their button's prompt, sent only by them
 *   beachVoice.drop({ field, name })            their mirror taken down
 *
 * A NEWCOMER IS GIVEN A NAME AND A KEY IN ONE TAP, the same way on every page (the premiere page's kit,
 * keel, 2026-10-20, for the Brighton room at FLIRT 2026; moved here 26 Oct 2026, the arcade's step 2):
 *
 *   beachVoice.propose()                        a name no block on the beach is named for (starling-1234)
 *   beachVoice.enter({ field, name, intro })    their mirror of a family founded for the name given, else the
 *                                               proposed one; a name new to the beach is given its key here,
 *                                               kept on this device, wrapped (beach-key:<field>:<name>),
 *                                               so nobody chooses a key or reuses a password as one; a name
 *                                               already on the beach has a key, and the browser asks for it
 *   beachVoice.made({ field, name })            the name and key made here, handed back once to be said at the
 *                                               end (a show's last slide), then forgotten; null where none was
 *   beachVoice.known(name)                      what the beach has under a name: 'passport', 'blocks' or ''
 *
 * A MEMBERS' BEACH (README, "The members' gate"; bsp-mcp docs/protocol-pscale-beach-v2.md 2.8) answers a
 * stranger 401 members_only for everything but what its keepers mark beyond. A member proves their passport
 * once for a pass, twelve hours, which every read and write made here then carries as Authorization: Bearer:
 *
 *   beachVoice.prove({ name, ask })             the pass earned with the passport's key: the key this page holds or
 *                                               this device keeps, else the one the browser asks for (ask: false
 *                                               never asks). The pass is kept on this device for this beach alone,
 *                                               with its expiry, and the key beside it, wrapped (THE SEAL, below), so
 *                                               sealed lines open for them after a reload while the pass lasts. A write
 *                                               refused at the door is proved once more with its own key and made
 *                                               once again, so a page need not call this before a say
 *   beachVoice.pass()                           the pass this device holds for this beach, { name, pass, expires }, or null
 *   beachVoice.leave()                          the pass given up
 *
 * A NEWCOMER COMES IN BY INVITATION (3 Nov 2026, the SALT portal): a member mints one under their pass, the page makes a link
 * of it, and the link founds one passport, the newcomer's, which is proved at once for their pass:
 *
 *   beachVoice.invite({ name, for, ask })      an invitation to this beach from the member named (the one this device signs
 *                                               with, else op.name), minted under their pass, earned first where none is held:
 *                                               seven days, founding one passport, for the name op.for where the member says
 *                                               who it is for, else any name not yet a member's. { ok, name, invite, by, for,
 *                                               expires }. The beach keeps no record of it; the page makes the link
 *   beachVoice.invited(invite)                  what an invitation says of itself, read here and the beach not asked:
 *                                               { by, for, expires }, or null where it is not one
 *   beachVoice.join({ invite, name, key, passport })   the newcomer's passport founded with the invitation as the bearer,
 *                                               its opening line op.passport, locked to a key of their own: op.key, else one
 *                                               made here as enter makes one, kept where this script looks first and said
 *                                               once by made({ field: 'passport', name }); then proved at once for the pass.
 *                                               { ok, name, expires, made } or { ok: false, error, code? }: an invitation run
 *                                               out or for another name is refused here, a name that stands by the beach
 *
 * THE SEAL (4 Nov 2026, coloured stigmergy step 4; bsp-mcp proposals/2026-11-03-coloured-stigmergy-the-design.md §4.1,
 * §4.2): a line is sealed before it leaves and opened after it arrives, here, with the beach's own seal (seal.js, loaded
 * beside this script; the four modes byte for byte as the connector seals them, proved by one set of vectors). The pair a
 * person seals with is derived once from their ONE WORD — the key their passport uses — with their name as the salt, the
 * same pair pscale_key_publish derives, and is held in this page's memory for the tab; the beach never sees it.
 *
 *   beachVoice.say({ field, at, text, name, gray })   gray: true seals the line to the person alone (self); 'colour:<name>'
 *                                               seals it in that colour, with the current turn's key opened from their own
 *                                               copy — or as a letter to the colour where they hold none; the reply says
 *                                               which (sealed: 'self' | 'colour' | 'letter', and the turn). keep takes no
 *                                               gray: a mirror is never sealed whole, as the connector refuses it too
 *   beachVoice.open(node, { name, with, ring })  the words of a sealed line this tab can open — the node an envelope, or
 *                                               one at its underscore (a line with fields of its own): self under the
 *                                               person's word, a grain line with the other party (op.with, else the one
 *                                               the envelope names), a group line with op.ring, a colour line with the
 *                                               turn's key, opened from their copy the first time this tab meets that
 *                                               turn and worn from then on; null where it cannot, and never a question
 *   beachVoice.grey(node)                       the one line shown for a sealed line that does not open, as the router
 *                                               draws it: 'sealed · colour · salt · turn 3', 'sealed · grain · for bob'
 *   beachVoice.colours({ name })                the colours this tab holds: every colour:<name> on the beach whose
 *                                               current turn holds a copy the person's word opens, [{ name, block, turn }]
 *   beachVoice.seal(text, { gray, name })       the envelope alone, for a page that writes its own block (a grain's side):
 *                                               gray as say takes it, or { grain: <partner> }; { ok, envelope, how }
 *   beachVoice.wear({ name, ask })              the person's word put on for this tab, on an open beach: the key held or
 *                                               kept for the name, else asked for, tried against the halves published at
 *                                               passport:<name> 9 — or published there now where none stand. At a members'
 *                                               beach prove does this as the member keys in.
 *
 * A KEY IS NEVER KEPT IN PLAIN TEXT (Matthew's condition, coloured-stigmergy 1.18): what this script keeps on the device —
 * the key a write kept, beach-key:<block>, and a key made here until it is said, beach-made:<block> — is wrapped under a
 * key the browser will not hand out (seal.js keep: a non-extractable key in this origin's IndexedDB), and held plain in
 * this page's memory only; where the browser offers no such key, nothing is kept and the browser asks again next time.
 * A key the site's own pages kept plain under next-latch:<block> (their convention, before this) is read here as theirs
 * and never written. A pass is not a key, and is kept as before.
 *
 * Where the person has the beach button on the page, say, keep and ask go through it: they unlock
 * it once, see the words where they will stand, and commit them there, and the page never holds
 * their passphrase. Where they have not, the call is the page's own text entry, as o-pages have
 * always taken it: the name the page passes (or the one this device signs with), and the key this
 * device keeps for it, else the one they give the browser's own prompt, kept here once the beach
 * takes it. Either way the same writes land, by the same rules the button keeps (frame.js say and
 * keep): only a family that stands, a mirror founded locked to the person's words, a family on the
 * clock never kept whole. drop is a deletion, which the button never makes, so it is always the
 * page's own. Each call resolves to { ok, name } or { ok: false, error, quiet?, needName? }.
 *
 * The page draws its box the same either way and hides only its name field while the button is
 * there: beachVoice.button.shown() says whether it is, and beachVoice.onButton(fn) calls fn(shown)
 * whenever it comes or goes.
 *
 * THE BUTTON IS THE PERSON'S CHOICE, off until they turn it on (David, 2026-10-18), and kept with
 * their settings on the beach: settings:<handle>, the per-person layer of this beach's own settings
 * block, at its addresses — 9 is pages, 9.1 the button (true or false). It stands on every page that
 * carries this script wherever their name is known, and is kept on this device alone where no name
 * is. beachVoice.button.set(on) turns it on or off, wherever a page offers the choice. Never in a
 * frame (the page that frames it has its own) and never on a page whose body says
 * data-beach-button="off" (its own corner is taken). Any other page setting of the person's is read
 * and kept the same way, beachVoice.setting('9.2') and beachVoice.set('9.2', 'light'): 9.2 is the
 * light or the dark, which a site's own switch keeps here so it follows them too.
 *
 * The name this device signs with is the one happyseaurchin.com's pages have always kept,
 * render:who, set when a write lands under a name or the button says whose it is; a key kept is
 * kept wrapped, beach-key:<block> (a key /walk and the site's pages keep plain, next-latch:<block>, is read too). Nothing here reads what is typed into the
 * button: the frame is the beach's own, and keeps its words to itself. */
(function () {
  'use strict';
  if (window.beachVoice) return;
  var me = document.currentScript;
  var BASE = new URL('.', (me && me.src) || location.href);
  // a builder's test, as with the button: a script served from this computer may name another beach
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(BASE.hostname);
  var ROOT = ((LOCAL && me && me.getAttribute('data-beach')) || BASE.origin).replace(/\/+$/, '');
  var BEACH = ROOT + '/.well-known/pscale-beach';
  var NAME = 'render:who', DEVICE = 'beach-button', SPOT = '9.1';
  var KEPT = 'kept on this device — check the first letter: phones capitalise it';

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function clean(v) { return String(v || '').replace(/[^a-z0-9_\s-]/gi, '').replace(/\s+/g, ' ').trim(); }
  function who() { return clean(get(NAME)); }
  function fieldOf(f) { f = String(f || '').trim().toLowerCase(); return /^[a-z0-9][a-z0-9-]{0,63}$/.test(f) ? f : ''; }
  function intro(field, name) {
    return 'MIRROR — ' + name + '’s readings on the ' + field + ' family (spine:' + field +
      '), at the spine’s own addresses. Sovereign to them; silence at an address is honest absence.';
  }
  /* A MIRROR STANDS AT ITS FAMILY'S FLOOR: its opening line is nested as deep as the spine's own (a family
   * on the clock has ten underscores), as /walk founds one, so a day's line lands under the day's digits
   * and never one rung up. Founded one deep whatever the floor (18 Oct 2026), a daily game's lines stood
   * under the wrong digits, and the clock pages refused the mirror (orientation:weft 9.24; the arcade's
   * step 1, spine:game-arcade 1.11111). The root is the first underscore; this makes the rest. */
  function floored(line, floor) { var n = line; for (var i = 1; i < (+floor || 1); i++) n = { _: n }; return n; }
  function at(tree, addr) {
    var n = tree;
    String(addr).replace('.', '').split('').forEach(function (d) { n = n && typeof n === 'object' ? n[d === '0' ? '_' : d] : undefined; });
    return n;
  }

  // ── the seal: the beach's own, seal.js beside this script, loaded once ──
  var SEAL = null;
  function seal() {
    if (window.beachSeal) return Promise.resolve(window.beachSeal);
    if (SEAL) return SEAL;
    SEAL = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = BASE.href + 'seal.js'; s.async = true;
      s.onload = function () { if (window.beachSeal) res(window.beachSeal); else { SEAL = null; rej(new Error('the seal did not load')); } };
      s.onerror = function () { SEAL = null; rej(new Error('could not load ' + s.src)); };
      (document.head || document.documentElement).appendChild(s);
    });
    return SEAL;
  }
  /* the keys this script keeps on the device, plain in memory for this page alone and wrapped in storage (see THE SEAL
   * above), under names of its own: beach-key:<block> for the key a write kept, beach-made:<block> for a key made here
   * until it is said; read once, before any act. next-latch:<block> is the convention the site's own pages keep a key
   * under, plain: it is read here as a key the person's pages kept, and never written. */
  var KEYS = {}, READY = null;
  function own(k) { return String(k).replace(/^next-latch:/, 'beach-key:').replace(/^made-key:/, 'beach-made:'); }
  function isKeyName(k) { return /^(beach-key|beach-made):/.test(String(k || '')); }
  function ready() {
    if (READY) return READY;
    var names = [];
    try { for (var i = 0; i < localStorage.length; i++) { var n = localStorage.key(i); if (isKeyName(n)) names.push(n); } } catch (e) {}
    if (!names.length) return READY = Promise.resolve();
    return READY = seal().then(function (S) {
      return Promise.all(names.map(function (n) {
        var v = get(n);
        if (!S.keep.wrapped(v)) return keepKey(n, v);
        return S.keep.unwrap(v).then(function (t) { if (t !== null) KEYS[n] = t; });
      }));
    }).catch(function () {});
  }
  function kept(k) {
    var o = own(k);
    if (KEYS[o]) return KEYS[o];
    var v = /^next-latch:/.test(k) ? get(k) : '';
    return v && !/^w1\./.test(v) ? v : '';
  }
  function keepKey(k, v) {
    var o = own(k);
    if (v == null) { delete KEYS[o]; del(o); return Promise.resolve(); }
    KEYS[o] = v;
    return seal().then(function (S) { return S.keep.wrap(v); }).then(function (w) { put(o, w); }, function () { del(o); });
  }

  // ── the members' gate (README, "The members' gate"; bsp-mcp docs/protocol-pscale-beach-v2.md 2.8) ──
  /* a beach an organisation runs for its members answers a stranger 401 members_only for everything but what its
   * keepers mark beyond. A member proves their passport once (POST {block: 'passport:<name>', secret}, no content)
   * for a pass, twelve hours, sent as Authorization: Bearer on every request. The pass is kept on this device for
   * this beach alone, with its expiry, under the name it is for; the key that earned it is held in this page's
   * memory only, and kept on the device only as a write keeps it, the same on every beach. */
  var PASS = 'beach-pass:' + ROOT, HELD = {};
  function pass() {
    try { var p = JSON.parse(get(PASS) || 'null'); return p && p.pass && p.name && Date.parse(p.expires) - Date.now() > 60000 ? { name: p.name, pass: p.pass, expires: p.expires } : null; }
    catch (e) { return null; }
  }
  function leave() { del(PASS); }
  function headers(h) { var p = pass(); if (p) h.Authorization = 'Bearer ' + p.pass; return h; }
  function atTheDoor(r, d) { return r.status === 401 && !!d && d.code === 'members_only'; }
  function answer(r, d) { return { ok: r.ok && !(d && d.error), status: r.status, code: d && d.code, error: d && (d.error || d.message), found: d && d.found }; }
  /* the proof itself: the passport's latch, no content, answered with the pass */
  function proof(name, key) {
    return fetch(BEACH, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ block: 'passport:' + name, secret: key }) })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (d) {
          if (r.ok && d && d.pass) { put(PASS, JSON.stringify({ name: name, pass: d.pass, expires: d.expires })); HELD[name] = key; put(NAME, name); return { ok: true, name: name, expires: d.expires }; }
          if (r.ok) return { ok: false, open: true, error: ROOT + ' has no members’ gate: it is open to anyone' };
          return answer(r, d);
        });
      });
  }
  /* the pass for a member's name: the one this device holds while it lasts, else earned with the key this page holds
   * or the device keeps, else the one the browser asks for (again, twice at most, while the beach refuses it); op.ask
   * false never asks. Resolves { ok, name, expires } or { ok: false, error, quiet?, needKey?, needName? } */
  function prove(op) {
    op = op || {};
    var name = nameFor(op); if (!name) return Promise.resolve(NEED);
    var held = pass();
    if (held && held.name === name) return Promise.resolve({ ok: true, name: name, expires: held.expires });
    var key = HELD[name] || keyFor('passport:' + name, name), asked = 0, last = null;
    function attempt() {
      if (!key) {
        if (op.ask === false) return Promise.resolve({ ok: false, needKey: true, error: name + '’s key is not on this device' });
        if (asked++ === 2) return Promise.resolve(last);
        var v = window.prompt(last ? 'That key is not the one ' + name + '’s passport uses. Enter it again (' + KEPT + '):'
          : 'This beach is its members’. Enter the key ' + name + '’s passport uses (' + KEPT + '):');
        if (v === null || !v.trim()) return Promise.resolve({ ok: false, quiet: true });
        key = v.trim();
      }
      return proof(name, key).then(function (r) {
        // the member's one word: the halves it derives published at their passport's 9 where none stand, so a keeper can
        // seal a copy to them, or checked against those that do (r.keys: 'published' | 'match' | 'mismatch' | 'held')
        // and kept on the device, wrapped, as a write keeps it: the seal then opens for them after a reload while the pass lasts
        if (r.ok) return keepKey('next-latch:passport:' + name, key).then(function () { return publish(name, key); }).then(function (p) { r.keys = p.ok ? (p.published ? 'published' : 'match') : p.code === 'mismatch' || p.code === 'held' ? p.code : 'unknown'; return r; }, function () { r.keys = 'unknown'; return r; });
        if (r.status === 404) return { ok: false, code: 'not_found', error: 'no member called ' + name + ' on this beach' };
        if (!refused(r)) return r;
        last = r; key = '';
        return attempt();
      });
    }
    return attempt().catch(failed);
  }
  /* what an invitation says of itself: its four parts are the kind, the member who minted it (and after > who it is for),
   * when it runs out, and the beach's own signature, which only the beach can check */
  function invited(token) {
    var p = String(token || '').split('.');
    if (p.length !== 4 || p[0] !== 'i' || !/^\d+$/.test(p[2])) return null;
    var who = '';
    try {
      var b = p[1].replace(/-/g, '+').replace(/_/g, '/'); b += '==='.slice((b.length + 3) % 4);
      who = new TextDecoder().decode(Uint8Array.from(atob(b), function (c) { return c.charCodeAt(0); }));
    } catch (e) { return null; }
    if (!who) return null;
    var cut = who.indexOf('>');
    return { by: cut < 0 ? who : who.slice(0, cut), for: cut < 0 ? '' : who.slice(cut + 1), expires: new Date(Number(p[2])).toISOString() };
  }
  /* a member's invitation to this beach, minted under their pass (earned first where none is held, as prove earns it), for
   * the name op.for where they say who it is for; seven days; it founds one passport, the beach recording that one use for
   * as long as the invitation lasts, so a member bringing in several newcomers mints one for each. Resolves { ok, name,
   * invite, by, for, expires } or prove's own refusals, or { ok: false, open: true } where the beach has no gate */
  function invite(op) {
    op = op || {};
    var to = clean(op.for);
    if (op.for && (!to || to.length > 32)) return Promise.resolve({ ok: false, error: 'A name: up to 32 letters, digits, - or _.' });
    return prove({ name: op.name, ask: op.ask }).then(function (p) {
      if (!p.ok) return p;
      var body = { block: 'passport:' + p.name, invite: true };
      if (to) body.for = to;
      return fetch(BEACH, { method: 'POST', cache: 'no-store', headers: headers({ 'Content-Type': 'application/json', Accept: 'application/json' }), body: JSON.stringify(body) })
        .then(function (r) {
          return r.json().catch(function () { return null; }).then(function (d) {
            if (r.ok && d && d.invite) return { ok: true, name: p.name, invite: d.invite, by: d.by || p.name, for: d.for || '', expires: d.expires };
            if (r.ok) return { ok: false, open: true, error: ROOT + ' has no members’ gate: anyone may come in' };
            return answer(r, d);
          });
        });
    }).catch(failed);
  }
  /* a newcomer's passport founded with an invitation as the bearer (README, "The members' gate"): one write, its opening
   * line op.passport (else a plain one), locked to op.key or a key made here, kept as every write keeps one; then the
   * passport proved for the pass. The beach founds with an invitation one passport that does not yet stand and nothing
   * else, and with one minted for a name that name's alone; where it will not, it says why in words of its own, the code
   * beside them: invite_for_another, invite_spent (taken already: ask for another), name_taken (choose another name); the
   * guard's, where the line carries what the beach keeps out of plain words, names the kind found; the key guard's
   * (key_in_payload), where the line carries the key itself. What can be told here is told here. */
  function join(op) {
    op = op || {};
    var token = String(op.invite || '').trim(), name = clean(op.name);
    var says = invited(token);
    if (!says) return Promise.resolve({ ok: false, code: 'invite', error: 'That is not an invitation to this beach.' });
    if (Date.parse(says.expires) < Date.now()) return Promise.resolve({ ok: false, code: 'expired', by: says.by, error: 'This invitation ran out on ' + new Date(says.expires).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) + ': ask ' + says.by + ' for another.' });
    if (!name || name.length > 32) return Promise.resolve(NEED);
    if (says.for && says.for !== name) return Promise.resolve({ ok: false, code: 'for', by: says.by, for: says.for, error: 'This invitation is for ' + says.for + ', not ' + name + '.' });
    var block = 'passport:' + name, key = String(op.key || '').trim(), made = false;
    if (!key) { key = makeKey(); made = true; }
    var line = typeof op.passport === 'string' ? op.passport.trim() : '';
    var content = op.passport && typeof op.passport === 'object' ? op.passport
      : { _: line || (name + ' — joined ' + ROOT.replace(/^https?:\/\//, '') + ' on ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + ' at ' + says.by + '’s invitation.') };
    return fetch(BEACH, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ block: block, content: content, new_lock: key }) })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (d) {
          var a = answer(r, d);
          if (!a.ok) { a.by = says.by; return a; }
          HELD[name] = key; put(NAME, name);
          return Promise.all([keepKey('next-latch:' + block, key), made ? keepKey('made-key:' + block, key) : null])
            .then(function () { return proof(name, key); }).then(function (p) { p.name = name; p.made = made; p.founded = true; return p; });
        });
      }).catch(failed);
  }

  // ── the beach ──
  function read(block, pscale) {
    var u = BEACH + '?block=' + encodeURIComponent(block) + (pscale == null ? '' : '&pscale=' + pscale);
    return fetch(u, { cache: 'no-store', headers: headers({ Accept: 'application/json' }) }).then(function (r) {
      if (r.status === 404) return null;
      if (r.ok) return r.json();
      return r.json().catch(function () { return null; }).then(function (d) {
        // a members' beach, to someone it does not know: its own words, and its code for the page to say its own
        if (atTheDoor(r, d)) throw refusal(d.error, 'members_only');
        throw new Error('the beach answered ' + r.status);
      });
    });
  }
  function send(method, block, body, again) {
    return fetch(method === 'DELETE' ? BEACH + '?block=' + encodeURIComponent(block) : BEACH, {
      method: method, cache: 'no-store', headers: headers({ 'Content-Type': 'application/json', Accept: 'application/json' }), body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        /* a members' beach refusing the write at its door (no pass, or one run out): the passport proved once more
         * with the write's own key, and the write made once again; a key the proof refuses is handed back as the
         * refusal it is, to be asked for again */
        var key = typeof body.secret === 'string' && body.secret ? body.secret : typeof body.new_lock === 'string' ? body.new_lock : '';
        if (atTheDoor(r, d) && !again && key && block.lastIndexOf(':') > 0) {
          return proof(block.slice(block.lastIndexOf(':') + 1), key).then(function (p) {
            return p.ok ? send(method, block, body, true) : refused(p) || p.status === 404 ? p : answer(r, d);
          });
        }
        return answer(r, d);
      });
    });
  }
  function post(body) { return send('POST', body.block, body); }
  /* a block of the person's own, founded locked to their key; where they have a passport the beach
   * takes no other key for their name (handle_bound), so the founding is made again proving it */
  function found(block, key, content) {
    return post({ block: block, content: content, new_lock: key }).then(function (w) {
      return w.ok || w.code !== 'handle_bound' ? w : post({ block: block, content: content, secret: key, new_lock: key });
    });
  }
  /* the family's spine (it must stand, and says the family's floor) and the person's mirror; at a members' beach
   * refusing the read at its door, the passport proved once more with a key at hand, and the read made once again */
  function family(field, block, name, again) {
    return Promise.all([read('spine:' + field, 0), read(block)]).then(function (r) {
      if (!r[0]) throw refusal('no family called ' + field + ' stands on the beach (there is no spine:' + field + ')');
      return { floor: +r[0].floor || 1, mirror: r[1] };
    }, function (e) {
      if (!(e && e.code === 'members_only' && name && !again)) throw e;
      return admitted(block, name).then(function (ok) { if (!ok) throw e; return family(field, block, name, true); });
    });
  }
  /* the pass earned without a question, from the key this page holds or this device keeps for the name; false where
   * neither has one, so the door's own refusal stands and the page offers the way in */
  function admitted(block, name) {
    var key = HELD[name] || keyFor(block, name);
    if (!key) return Promise.resolve(false);
    return proof(name, key).then(function (r) { return !!r.ok; }, function () { return false; });
  }
  function refusal(msg, code) { var e = new Error(msg); e.refused = true; if (code) e.code = code; return e; }
  function failed(e) {
    var r = { ok: false, error: e && e.refused ? e.message : 'the beach could not be reached: ' + ((e && e.message) || e) };
    if (e && e.code) r.code = e.code;
    return r;
  }

  // ── a write under the person's own key, where no button is on the page ──
  /* a key this page holds for the name (its proof at a members' beach), else one this device already keeps: the
   * block's own, else the passport's (every block named for a handle with a passport is bound to that key), else
   * one kept for another of their blocks */
  function keyFor(block, name) {
    var k = HELD[name] || kept('next-latch:' + block) || get('mirror-latch:' + block) || get('passport-latch:' + name) || get('lists-latch:' + name) || get('now-latch:' + name);
    if (k) return k;
    var tail = ':' + name, n;
    for (n in KEYS) if (/^beach-key:/.test(n) && n.slice(-tail.length) === tail && KEYS[n]) return KEYS[n];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        n = localStorage.key(i);
        if (/^next-latch:/.test(n) && n.slice(-tail.length) === tail && kept(n)) return kept(n);
      }
    } catch (e) {}
    return '';
  }
  function question(name, founding, r, what) {
    var its = what || 'words';
    if (r && r.code === 'handle_bound') return name + ' has a passport on the beach, so its ' + its + ' go under the key that passport uses. Enter that key (' + KEPT + '):';
    if (r) return 'That key is not the one ' + name + '’s ' + its + ' are kept under. Enter it again (' + KEPT + '):';
    if (founding) return (what === 'settings' ? 'This keeps your settings on the beach as ' + name + ', so they follow you to every device, locked to you.'
      : 'This puts your words on the beach as ' + name + ', locked to you.') + '\nEnter your key — the one your passport uses, if you have one; with no passport yet, choose one (' + KEPT + '):';
    return name + '’s ' + its + ' on the beach are locked — enter your key (' + KEPT + '):';
  }
  function refused(r) { return !!r && (r.code === 'lock_required' || r.code === 'handle_bound' || r.status === 403); }
  /* act(key) makes the write: with the key kept here, else the one asked for, again (twice at most)
   * while the beach refuses it; the key that lands is kept, and the name is the one this device signs with */
  function signed(block, name, founding, act, what) {
    var key = keyFor(block, name), asked = 0, last = null;
    function attempt() {
      if (!key) {
        if (asked++ === 2) return Promise.resolve(last);
        var v = window.prompt(question(name, founding, last, what));
        if (v === null || !v.trim()) return Promise.resolve({ ok: false, quiet: true });
        key = v.trim();
      }
      return act(key).then(function (r) {
        if (r && r.ok) return keepKey('next-latch:' + block, key).then(function () { put(NAME, name); r.name = name; return r; });
        if (!refused(r)) return r;
        last = r; key = '';
        return attempt();
      });
    }
    return attempt();
  }
  function nameFor(op) {
    var name = clean(op.name || who());
    return name && name.length <= 32 ? name : '';
  }
  var NEED = { ok: false, needName: true, error: 'Give your handle: up to 32 letters, digits, - or _. It is how your words are signed.' };

  // ── the acts ──
  function through(op) {
    return window.beachButton.request(op).then(function (r) {
      r = r || { ok: false, error: 'the beach button did not answer' };
      if (r.ok && r.handle) { r.name = r.handle; put(NAME, r.handle); }
      return r;
    });
  }
  function say(op) {
    op = op || {};
    var field = fieldOf(op.field), addr = String(op.at == null ? '' : op.at).trim(), text = String(op.text || '').trim().slice(0, 2000);
    if (!field) return Promise.resolve({ ok: false, error: 'not a family name: ' + String(op.field || '') });
    if (!/^[1-9][0-9]*(\.[0-9]+)?$/.test(addr)) return Promise.resolve({ ok: false, error: 'not an address: ' + addr });
    if (!text) return Promise.resolve({ ok: false, error: 'nothing to say' });
    if (op.gray && typeof op.gray === 'object') return Promise.resolve({ ok: false, error: 'a say is sealed to the person (gray: true) or in a colour (gray: "colour:<name>"); a grain line is sealed with beachVoice.seal' });
    if (shown()) return through({ kind: 'say', field: field, at: addr, text: text, gray: op.gray });
    var name = nameFor(op); if (!name) return Promise.resolve(NEED);
    var block = field + ':' + name;
    return family(field, block, name).then(function (f) {
      return signed(block, name, !f.mirror, function (key) {
        return (f.mirror ? Promise.resolve({ ok: true }) : found(block, key, { _: floored(op.intro || intro(field, name), f.floor) })).then(function (w) {
          // confirm_required: the mirror was founded a moment ago, from another tab, and stands
          if (!(w.ok || w.code === 'confirm_required')) return w;
          if (!op.gray) return post({ block: block, spindle: addr, content: text, secret: key });
          // THE WRITER'S DOOR SEALS BEFORE THE LINE LEAVES: the envelope stands at the address, as the connector lands it
          return sealFor(op.gray, text, name, key).then(function (s) {
            return post({ block: block, spindle: addr, content: s.envelope, secret: key }).then(function (r) { if (r.ok) { r.sealed = s.how; if (s.turn) r.turn = s.turn; } return r; });
          }, failed);
        });
      });
    }).catch(failed);
  }
  function keep(op) {
    op = op || {};
    var field = fieldOf(op.field), content = op.content;
    if (!field) return Promise.resolve({ ok: false, error: 'not a family name: ' + String(op.field || '') });
    if (!content || typeof content !== 'object' || Array.isArray(content)) return Promise.resolve({ ok: false, error: 'nothing to keep' });
    if (op.gray) return Promise.resolve({ ok: false, error: 'a mirror is never sealed whole: seal a line with say, at its address' });
    if (shown()) return through({ kind: 'keep', field: field, content: content });
    var name = nameFor(op); if (!name) return Promise.resolve(NEED);
    var block = field + ':' + name, tree = JSON.parse(JSON.stringify(content));
    // a mirror's opening line names whose it is; a page that does not know the name writes 'a'
    if (typeof tree._ === 'string' && tree._.trim()) tree._ = tree._.replace(/^MIRROR — a /, 'MIRROR — ' + name + '’s ');
    else if (!tree._ || typeof tree._ !== 'object') tree._ = intro(field, name);
    return family(field, block, name).then(function (f) {
      if (f.floor >= 10) return { ok: false, error: 'the ' + field + ' family keeps time, so its mirror is said a beat at a time, never kept whole' };
      if (typeof tree._ === 'string') tree._ = floored(tree._, f.floor);
      return signed(block, name, !f.mirror, function (key) {
        function replace() { return post({ block: block, content: tree, secret: key, confirm: true }); }
        return f.mirror ? replace() : found(block, key, tree).then(function (w) { return w.code === 'confirm_required' ? replace() : w; });
      });
    }).catch(failed);
  }
  function ask(text) {
    text = String(text || '').trim();
    if (!text) return Promise.resolve({ ok: false, error: 'nothing to ask' });
    if (!shown()) return Promise.resolve({ ok: false, unsupported: true, error: 'no beach button is on this page' });
    return through({ kind: 'ask', text: text });
  }
  function drop(op) {
    op = op || {};
    var field = fieldOf(op.field);
    if (!field) return Promise.resolve({ ok: false, error: 'not a family name: ' + String(op.field || '') });
    var name = nameFor(op); if (!name) return Promise.resolve(NEED);
    var block = field + ':' + name;
    return signed(block, name, false, function (key) { return send('DELETE', block, { secret: key, confirm: true }); }).catch(failed);
  }

  // ── a newcomer: a name proposed, a key made here, said once at the end ──
  /* the beach's index (what stands, by name), read once a visit: a name is on the beach where a passport
   * or any block is named for it */
  var INDEX = null;
  function index(fresh) {
    if (!fresh && INDEX) return INDEX;
    return INDEX = read('').then(function (ix) {
      var names = ((ix && ix.blocks) || []).map(function (b) { return typeof b === 'string' ? b : (b && b.name) || ''; }), set = {};
      names.forEach(function (n) { set[n] = 1; });
      return { blocks: names, set: set };
    }, function (e) { INDEX = null; throw e; });
  }
  function onBeach(ix, h) {
    return !!ix.set['passport:' + h] || ix.blocks.some(function (b) { return b.slice(-(h.length + 1)) === ':' + h; });
  }
  function rnd(n) { var a = new Uint32Array(1); try { crypto.getRandomValues(a); } catch (e) { a[0] = Math.floor(Math.random() * 4294967296); } return a[0] % n; }
  var WORDS = ('amber anchor apple arch aspen autumn badger bay beach beacon bell berry birch bluff boat bough brass breeze ' +
    'brick brook cabin calm canal candle canyon cape cedar chalk cherry cliff cloud clover coast cobalt comet copper coral cove ' +
    'crane crest dawn delta dew dune dusk eagle east echo elm ember fern ferry field finch flame flint flock foam forest fossil ' +
    'fox frost gale garden garnet glade glow granite grove gull harbour hazel heath heron hill hollow honey indigo inlet iris ' +
    'island ivory ivy jade jetty juniper kelp kestrel kite lagoon lake lantern larch lark laurel leaf ledge lemon lily linen ' +
    'lotus maple marble marsh meadow mint mist moon moss north oak ocean olive opal orbit orchid otter owl palm pearl pebble ' +
    'pepper pier pine plover plum pond poppy prism quartz rain raven reed reef ridge river robin rose rowan saffron sage sail ' +
    'salt sand shell shore silver sky slate snow sorrel south spark spray spruce star stone storm stream summit swallow swan ' +
    'tern thistle thorn tide timber topaz tower trail tulip valley velvet violet wave west wharf willow wind winter wren yarrow').split(' ');
  function makeKey() { return [0, 1, 2].map(function () { return WORDS[rnd(WORDS.length)]; }).join('-') + '-' + (10 + rnd(90)); }
  var PROPOSED = '', TAKEN = {};
  /* a name made up for a newcomer: a starling and four digits no block on the beach is named for, the same
   * one until it is taken (by them, or by someone since it was proposed) */
  function propose() {
    return index().then(function (ix) {
      if (PROPOSED && !TAKEN[PROPOSED] && !onBeach(ix, PROPOSED)) return PROPOSED;
      for (var i = 0; i < 40; i++) { var h = 'starling-' + (1000 + rnd(9000)); if (!TAKEN[h] && !onBeach(ix, h)) return PROPOSED = h; }
      return PROPOSED = 'starling-' + (10000 + rnd(90000));
    });
  }
  /* what the beach has under a name: 'passport' (its blocks take the passport's key), 'blocks' (named on
   * the beach, under a key of its own), or '' (new to the beach); '' too where the beach does not answer */
  function known(name) {
    name = clean(name);
    if (!name) return Promise.resolve('');
    return index().then(function (ix) { return ix.set['passport:' + name] ? 'passport' : onBeach(ix, name) ? 'blocks' : ''; }, function () { return ''; });
  }
  /* one tap: the person's mirror of a family, for the name given (up to 32 letters, digits, - or _), else
   * the proposed one. A mirror that stands is handed back ({ standing: true, mirror }) and nothing is
   * written; a proposed name whose mirror stands was taken since it was proposed, so another is proposed,
   * since the person did not choose it. Otherwise the mirror is founded at the family's floor, with
   * op.intro as its opening line (where it opens 'MIRROR — a ', the name takes a's place): a name new to
   * the beach is given its key here first, kept where keyFor looks, and noted until made() says it; a
   * name already on the beach has a key, which the browser asks for as say does. Resolves { ok, name,
   * made, born } or { ok: false, error, quiet? }. The name becomes the one this device signs with. */
  function enter(op) {
    op = op || {};
    var field = fieldOf(op.field);
    if (!field) return Promise.resolve({ ok: false, error: 'not a family name: ' + String(op.field || '') });
    var given = clean(op.name);
    if (given && given.length > 32) return Promise.resolve(NEED);
    function attempt(name) {
      var block = field + ':' + name;
      return family(field, block, name).then(function (f) {
        if (f.mirror) {
          if (!given && name === PROPOSED) { TAKEN[name] = 1; PROPOSED = ''; return propose().then(attempt); }
          put(NAME, name);
          return { ok: true, name: name, standing: true, mirror: f.mirror };
        }
        return index().then(function (ix) {
          var made = false;
          var keeping = Promise.resolve();
          if (!onBeach(ix, name) && !kept('next-latch:' + block)) { var k = makeKey(); keeping = Promise.all([keepKey('next-latch:' + block, k), keepKey('made-key:' + block, k)]); made = true; }
          var line = String(op.intro || '').trim();
          line = line ? line.replace(/^MIRROR — a /, 'MIRROR — ' + name + '’s ') : intro(field, name);
          var tree = { _: floored(line, f.floor) };
          return keeping.then(function () { return signed(block, name, true, function (key) { return found(block, key, tree); }); }).then(function (r) {
            if (r && r.ok) { r.name = name; r.made = made; r.born = true; if (name === PROPOSED) { TAKEN[name] = 1; PROPOSED = ''; } }
            return r;
          });
        });
      });
    }
    return (given ? Promise.resolve(given) : propose()).then(attempt).catch(failed);
  }
  /* the name and key made here for a newcomer, once: said at the end of the show, then forgotten here (the
   * key stays kept on the device, and is never shown again). Null where none was made, or the name went
   * under a key of the person's own since. */
  function made(op) {
    op = op || {};
    var field = fieldOf(op.field), name = clean(op.name || who());
    if (!field || !name) return null;
    var block = field + ':' + name, k = kept('made-key:' + block);
    if (!k) return null;
    keepKey('made-key:' + block, null);
    return kept('next-latch:' + block) === k ? { name: name, key: k } : null;
  }

  // ── the seal through the voice (coloured stigmergy, step 4; the design's §4.1 and §4.2) ──
  /* the word a name seals with: the key this page holds for it (its proof at a members' beach), else the one the device
   * keeps for its passport or any of its blocks; never asked for here (wear and prove ask) */
  function wordOf(name) { return HELD[name] || keyFor('passport:' + name, name); }
  /* THE READER'S GLASSES: each colour turn this tab has opened, kept in memory alone, so every later line of that colour
   * and turn opens with no ring read and no derivation */
  var WORN = {};
  var turnNo = function (t) { return String(parseInt(t, 10) || t); };
  /* a colour block at this beach — its current turn, or the one named — and this name's key for it: their own copy opened
   * with their word, worn from then on. { K, turn, node }, K null where no copy opens; null where no such block or turn */
  function colourTurn(block, turn, name) {
    var at = turn != null ? block + '|' + turnNo(turn) : '';
    if (at && WORN[at]) return Promise.resolve({ K: WORN[at], turn: turnNo(turn) });
    var word = name ? wordOf(name) : '';
    return Promise.all([seal(), read(block)]).then(function (r) {
      var S = r[0], b = r[1];
      if (!b) return null;
      var t = turn == null ? S.colour.current(b) : S.colour.turns(b).filter(function (x) { return x.address === turnNo(turn); })[0];
      if (!t) return null;
      var k = block + '|' + t.address;
      if (WORN[k]) return { K: WORN[k], turn: t.address, node: t.node };
      if (!word) return { K: null, turn: t.address, node: t.node };
      return S.colour.keyOf(t, word, name).then(function (K) { if (K) WORN[k] = K; return { K: K, turn: t.address, node: t.node }; });
    });
  }
  /* the envelope a line leaves as: gray true to the person alone (self, salted with their name — the key their published
   * halves derive); 'colour:<name>' in that colour, with the current turn's key from their own copy, else as a letter;
   * { grain: <partner> } to the two of them, refused where the word does not derive the halves published at their
   * passport. Resolves { envelope, how: 'self' | 'colour' | 'letter' | 'grain', turn? } */
  function sealFor(gray, text, name, word) {
    return seal().then(function (S) {
      word = word || wordOf(name);
      if (gray && typeof gray === 'object' && gray.grain) {
        var partner = clean(gray.grain);
        if (!partner) throw refusal('a grain line is sealed to a partner: say who');
        if (!word) throw refusal('no key is held here for ' + name + ': wear it first');
        return Promise.all([read('passport:' + partner), read('passport:' + name)]).then(function (r) {
          var theirs = S.publishedOf(r[0] && r[0]['9']), mine = S.publishedOf(r[1] && r[1]['9']);
          if (!theirs) throw refusal(partner + ' has no keys published at passport:' + partner + ' 9, so nothing can be sealed to them yet');
          return S.grain.seal(text, word, name, partner, theirs.x25519, mine ? mine.x25519 : undefined).then(function (e) { return { envelope: e, how: 'grain' }; });
        });
      }
      if (typeof gray === 'string') {
        var block = S.colour.block(gray);
        return colourTurn(block, null, name).then(function (t) {
          if (!t) throw refusal('no ' + block + ' stands on this beach: a colour is founded by its keeper first');
          if (t.K) return S.colour.seal(text, block, t.turn, t.K).then(function (e) { return { envelope: e, how: 'colour', turn: t.turn }; });
          return S.colour.letter(text, block, t.turn, t.node['2']).then(function (e) { return { envelope: e, how: 'letter', turn: t.turn }; });
        });
      }
      if (!word) throw refusal('no key is held here for ' + name + ': wear it first');
      return S.self.seal(text, word, name).then(function (e) { return { envelope: e, how: 'self' }; });
    });
  }
  /* the envelope alone, for a page that writes its own block: { ok, envelope, how, turn? } */
  function sealAct(text, op) {
    op = op || {};
    text = String(text || '');
    if (!text) return Promise.resolve({ ok: false, error: 'nothing to seal' });
    if (!op.gray) return Promise.resolve({ ok: false, error: 'say how: gray true, "colour:<name>", or { grain: <partner> }' });
    if (shown()) return through({ kind: 'seal', text: text, gray: op.gray });
    var name = nameFor(op); if (!name) return Promise.resolve(NEED);
    return sealFor(op.gray, text, name).then(function (s) { return { ok: true, name: name, envelope: s.envelope, how: s.how, turn: s.turn }; }).catch(failed);
  }
  /* OPEN a sealed line this tab can open, else null — never a question (the page shows grey(node)) */
  function open(node, op) {
    op = op || {};
    if (shown()) return through({ kind: 'open', node: node, with: op.with, ring: op.ring }).then(function (r) { return r && r.ok ? r.text : null; });
    var name = nameFor(op);
    return seal().then(function (S) {
      var e = S.envelopeOf(node), m = S.mode(e);
      if (!m) return null;
      var word = name ? wordOf(name) : '';
      if (m === 'self') return word ? S.self.open(e, word, op.salt || name) : null;
      if (m === 'group') return op.ring && word ? S.group.unwrap(op.ring, word, name).then(function (K) { return K ? S.group.open(e, K) : null; }) : null;
      if (m === 'grain') {
        var other = clean(op.with) || String(e['9']['2'] || '');
        if (!word || !other || other === name) return null;
        return read('passport:' + other).then(function (p) { var k = S.publishedOf(p && p['9']); return k ? S.grain.open(e, word, name, k.x25519) : null; });
      }
      return colourTurn(String(e['9']['2'] || ''), String(e['9']['3'] || ''), name).then(function (t) { return t && t.K ? S.colour.open(e, t.K) : null; });
    }).catch(function () { return null; });
  }
  function grey(node) { return window.beachSeal ? window.beachSeal.grey(node) : ''; }
  /* the colours this tab holds, each with its current turn: read fresh from the beach's index each time */
  function colours(op) {
    op = op || {};
    if (shown()) return through({ kind: 'colours' }).then(function (r) { return r && r.ok ? r.colours || [] : []; });
    var name = nameFor(op);
    if (!name || !wordOf(name)) return Promise.resolve([]);
    return Promise.all([seal(), index(true)]).then(function (r) {
      var S = r[0], names = r[1].blocks.filter(function (b) { return b.indexOf('colour:') === 0; });
      return Promise.all(names.map(function (b) {
        return colourTurn(b, null, name).then(function (t) { return t && t.K ? { name: S.colour.name(b), block: b, turn: t.turn } : null; }, function () { return null; });
      }));
    }).then(function (list) { return list.filter(Boolean); }, function () { return []; });
  }
  /* the halves a word derives, published at passport:<name> 9 where none stand (one write, under the word as the latch,
   * which the beach refuses if the word is wrong), or checked against those that do */
  function publish(name, key) {
    return Promise.all([seal(), read('passport:' + name)]).then(function (r) {
      var S = r[0], p = r[1];
      if (!p) return { ok: false, code: 'not_found', status: 404, error: 'no passport:' + name + ' on this beach' };
      return S.pair(key, name).then(function (pair) {
        var mine = S.published(pair), has = S.publishedOf(p['9']);
        if (has) return has.x25519 === mine['2'] && has.ed25519 === mine['1'] ? { ok: true, published: false } : { ok: false, code: 'mismatch', error: 'that key does not derive the keys published at passport:' + name + ' 9' };
        if (p['9'] !== undefined && p['9'] !== null) return { ok: false, code: 'held', error: 'passport:' + name + ' keeps something else at 9, where its keys go' };
        return post({ block: 'passport:' + name, spindle: '9', content: mine, secret: key }).then(function (w) { return w.ok ? { ok: true, published: true } : w; });
      });
    });
  }
  /* WEAR: the person's word put on for this tab, on an open beach (at a members' beach, prove does this as they key in):
   * the key held or kept for the name, else asked for, twice at most while it proves wrong — a word proves itself against
   * the halves published at passport:<name> 9, or by publishing them. Resolves { ok, name, published } or a refusal */
  function wear(op) {
    op = op || {};
    var name = nameFor(op); if (!name) return Promise.resolve(NEED);
    var asked = 0, last = null, key = wordOf(name);
    function attempt() {
      if (!key) {
        if (op.ask === false) return Promise.resolve({ ok: false, needKey: true, error: name + '’s key is not on this device' });
        if (asked++ === 2) return Promise.resolve(last);
        var v = window.prompt(last ? 'That key is not the one ' + name + '’s passport uses. Enter it again (' + KEPT + '):' : 'Enter the key ' + name + '’s passport uses, to seal and open lines as them (' + KEPT + '):');
        if (v === null || !v.trim()) return Promise.resolve({ ok: false, quiet: true });
        key = v.trim();
      }
      return publish(name, key).then(function (r) {
        if (r.ok) { HELD[name] = key; put(NAME, name); return keepKey('next-latch:passport:' + name, key).then(function () { return { ok: true, name: name, published: r.published }; }); }
        if (!refused(r) && r.code !== 'mismatch') return r;
        last = r; key = '';
        return attempt();
      });
    }
    return attempt().catch(failed);
  }

  // ── the button on the page ──
  function shown() {
    return !!(window.beachButton && typeof window.beachButton.request === 'function' && document.querySelector('iframe[title="beach button"]'));
  }
  var loading = false;
  function show(on) {
    if (!on) { if (window.beachButton) window.beachButton.hide(); return; }
    if (window.beachButton) { window.beachButton.show(); return; }
    if (loading) return;
    loading = true;
    var s = document.createElement('script');
    s.src = BASE.href + 'button.js'; s.async = true;
    ['place', 'beach', 'llm', 'poll'].forEach(function (k) { var v = me && me.getAttribute('data-' + k); if (v) s.setAttribute('data-' + k, v); });
    (document.body || document.documentElement).appendChild(s);
  }

  // ── the person's own settings: settings:<handle>, at the addresses of the beach's settings block ──
  var PAGES = 'Pages — what a page carrying the beach’s voice (button/voice.js) shows this person. ' +
    '9.1, the beach button: true to have it stand on every such page, false to leave it off. ' +
    '9.2, the light or the dark: light or dark, on every page that offers both.';
  function settingsIntro(name) {
    return 'SETTINGS — ' + name + '’s own settings, at the addresses of this beach’s settings block, whose ' +
      'values stand wherever these are silent, and the built-in defaults where both are. Sovereign to them, and read by any page or AI.';
  }
  var held = null;   // their settings as this page last read them: { name, p }
  function settings(fresh) {
    var name = who();
    if (!name) return Promise.resolve(null);
    if (fresh || !held || held.name !== name) held = { name: name, p: read('settings:' + name) };
    return held.p;
  }
  /* one of the person's settings at a page address ('9.2'), or undefined where none stands, or no
   * name is known, or the beach does not answer */
  function setting(addr) {
    return settings().then(function (b) {
      var v = b ? at(b, String(addr)) : undefined;
      return v !== null && typeof v === 'object' ? undefined : v;
    }, function () { return undefined; });
  }
  /* a setting kept, where their name is known, in their own settings on the beach, written as every
   * write here is: under the key this device keeps, else through the button where it is on the page
   * and holds them (they commit it there), else under the key they give the browser's prompt, the
   * first time founding their settings locked to it. A device that knows no name keeps nothing here. */
  function set(addr, value) {
    addr = String(addr);
    if (!/^9\.[1-9]$/.test(addr)) return Promise.resolve({ ok: false, error: 'a page setting stands at 9.1 to 9.9, not ' + addr });
    var name = who();
    if (!name) return Promise.resolve({ ok: true, kept: 'device' });
    var block = 'settings:' + name;
    return settings(true).then(function (b) {
      if (b && at(b, addr) === value) return { ok: true, kept: 'beach' };                 // their settings say so already
      if (b && shown() && !keyFor(block, name)) return through({ kind: 'write', block: block, spindle: addr, content: value });
      return signed(block, name, !b, function (key) {
        var pages = { _: PAGES }; pages[addr.slice(2)] = value;
        if (!b) return found(block, key, { _: settingsIntro(name), 9: pages }).then(function (w) {
          return w.code === 'confirm_required' ? post({ block: block, spindle: addr, content: value, secret: key }) : w;
        });
        // pages not yet among their settings arrive described; where they are, only the one line changes
        if (b['9'] == null) return post({ block: block, spindle: '9', content: pages, secret: key });
        return post({ block: block, spindle: addr, content: value, secret: key });
      }, 'settings');
    }).then(function (r) {
      if (r && r.ok) { r.kept = r.kept || 'beach'; held = null; }
      return r;
    }, failed);
  }

  // ── the button, as the person chose ──
  /* on or off, here and on this device at once, and in their settings where their name is known.
   * Off needs no write where nothing on the beach says on, and the button goes once the person has
   * answered, so where it holds them they commit the change in it. */
  function setButton(on) {
    on = !!on;
    put(DEVICE, on ? 'on' : 'off');
    if (!who()) { show(on); return Promise.resolve({ ok: true, kept: 'device' }); }
    if (on) { show(true); return set(SPOT, true); }
    return setting(SPOT).then(function (was) { return was === true ? set(SPOT, false) : { ok: true, kept: 'device' }; })
      .then(function (r) { show(false); return r; });
  }
  /* the person's own choice where their name is known and their settings say, else this device's */
  function wanted() {
    var mine = get(DEVICE) === 'on';
    return setting(SPOT).then(function (v) {
      if (typeof v !== 'boolean') return mine;
      put(DEVICE, v ? 'on' : 'off');
      return v;
    });
  }

  var watchers = [], was = false;
  function onButton(fn) { if (typeof fn === 'function') watchers.push(fn); }
  function start() {
    // the seal loads with the voice, so grey(node) can draw a sealed line as soon as a page meets one; its libraries load on first use
    seal().catch(function () {});
    ready();
    was = shown();
    new MutationObserver(function () {
      var now = shown();
      if (now === was) return;
      was = now;
      watchers.forEach(function (fn) { try { fn(now); } catch (e) {} });
    }).observe(document.body, { childList: true });
    document.addEventListener('beachbutton:hello', function (e) { var h = clean(e.detail && e.detail.handle); if (h) put(NAME, h); });
    if (window.top !== window || document.body.getAttribute('data-beach-button') === 'off') return;
    var settled = false;
    var late = setTimeout(function () { settled = true; show(get(DEVICE) === 'on'); }, 2500);
    wanted().then(function (on) {
      clearTimeout(late);
      if (!settled || on !== shown()) show(on);
    });
  }

  /* every act waits for the keys the device keeps to be read (ready), so a reload proves and seals without a question */
  function waits(fn) { return function () { var a = arguments; return ready().then(function () { return fn.apply(null, a); }); }; }
  window.beachVoice = {
    say: waits(say), keep: waits(keep), ask: ask, drop: waits(drop),
    propose: propose, enter: waits(enter), made: made, known: known,
    prove: waits(prove), pass: pass, leave: leave,
    invite: waits(invite), invited: invited, join: waits(join),
    seal: waits(sealAct), open: waits(open), grey: grey, colours: waits(colours), wear: waits(wear),
    name: who,
    button: { shown: shown, set: setButton },
    setting: setting, set: set,
    onButton: onButton,
    beach: ROOT
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
