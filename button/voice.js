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
 *                                               kept where this script looks first (next-latch:<field>:<name>),
 *                                               so nobody chooses a key or reuses a password as one; a name
 *                                               already on the beach has a key, and the browser asks for it
 *   beachVoice.made({ field, name })            the name and key made here, handed back once to be said at the
 *                                               end (a show's last slide), then forgotten; null where none was
 *   beachVoice.known(name)                      what the beach has under a name: 'passport', 'blocks' or ''
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
 * kept as /walk keeps a mirror's, next-latch:<block>. Nothing here reads what is typed into the
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

  // ── the beach ──
  function read(block, pscale) {
    var u = BEACH + '?block=' + encodeURIComponent(block) + (pscale == null ? '' : '&pscale=' + pscale);
    return fetch(u, { cache: 'no-store', headers: { Accept: 'application/json' } }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('the beach answered ' + r.status);
      return r.json();
    });
  }
  function send(method, block, body) {
    return fetch(method === 'DELETE' ? BEACH + '?block=' + encodeURIComponent(block) : BEACH, {
      method: method, cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        return { ok: r.ok && !(d && d.error), status: r.status, code: d && d.code, error: d && (d.error || d.message) };
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
  /* the family's spine (it must stand, and says the family's floor) and the person's mirror */
  function family(field, block) {
    return Promise.all([read('spine:' + field, 0), read(block)]).then(function (r) {
      if (!r[0]) throw refusal('no family called ' + field + ' stands on the beach (there is no spine:' + field + ')');
      return { floor: +r[0].floor || 1, mirror: r[1] };
    });
  }
  function refusal(msg) { var e = new Error(msg); e.refused = true; return e; }
  function failed(e) { return { ok: false, error: e && e.refused ? e.message : 'the beach could not be reached: ' + ((e && e.message) || e) }; }

  // ── a write under the person's own key, where no button is on the page ──
  /* a key this device already keeps for the name: the block's own, else the passport's (every block
   * named for a handle with a passport is bound to that key), else one kept for another of their blocks */
  function keyFor(block, name) {
    var k = get('next-latch:' + block) || get('mirror-latch:' + block) || get('passport-latch:' + name) || get('lists-latch:' + name) || get('now-latch:' + name);
    if (k) return k;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var n = localStorage.key(i);
        if (/^next-latch:/.test(n) && n.slice(-(name.length + 1)) === ':' + name) return localStorage.getItem(n);
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
        if (r && r.ok) { put('next-latch:' + block, key); put(NAME, name); r.name = name; return r; }
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
    if (shown()) return through({ kind: 'say', field: field, at: addr, text: text });
    var name = nameFor(op); if (!name) return Promise.resolve(NEED);
    var block = field + ':' + name;
    return family(field, block).then(function (f) {
      return signed(block, name, !f.mirror, function (key) {
        return (f.mirror ? Promise.resolve({ ok: true }) : found(block, key, { _: floored(op.intro || intro(field, name), f.floor) })).then(function (w) {
          // confirm_required: the mirror was founded a moment ago, from another tab, and stands
          return w.ok || w.code === 'confirm_required' ? post({ block: block, spindle: addr, content: text, secret: key }) : w;
        });
      });
    }).catch(failed);
  }
  function keep(op) {
    op = op || {};
    var field = fieldOf(op.field), content = op.content;
    if (!field) return Promise.resolve({ ok: false, error: 'not a family name: ' + String(op.field || '') });
    if (!content || typeof content !== 'object' || Array.isArray(content)) return Promise.resolve({ ok: false, error: 'nothing to keep' });
    if (shown()) return through({ kind: 'keep', field: field, content: content });
    var name = nameFor(op); if (!name) return Promise.resolve(NEED);
    var block = field + ':' + name, tree = JSON.parse(JSON.stringify(content));
    // a mirror's opening line names whose it is; a page that does not know the name writes 'a'
    if (typeof tree._ === 'string' && tree._.trim()) tree._ = tree._.replace(/^MIRROR — a /, 'MIRROR — ' + name + '’s ');
    else if (!tree._ || typeof tree._ !== 'object') tree._ = intro(field, name);
    return family(field, block).then(function (f) {
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
      return family(field, block).then(function (f) {
        if (f.mirror) {
          if (!given && name === PROPOSED) { TAKEN[name] = 1; PROPOSED = ''; return propose().then(attempt); }
          put(NAME, name);
          return { ok: true, name: name, standing: true, mirror: f.mirror };
        }
        return index().then(function (ix) {
          var made = false;
          if (!onBeach(ix, name) && !get('next-latch:' + block)) { var k = makeKey(); put('next-latch:' + block, k); put('made-key:' + block, k); made = true; }
          var line = String(op.intro || '').trim();
          line = line ? line.replace(/^MIRROR — a /, 'MIRROR — ' + name + '’s ') : intro(field, name);
          var tree = { _: floored(line, f.floor) };
          return signed(block, name, true, function (key) { return found(block, key, tree); }).then(function (r) {
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
    var block = field + ':' + name, k = get('made-key:' + block);
    if (!k) return null;
    del('made-key:' + block);
    return get('next-latch:' + block) === k ? { name: name, key: k } : null;
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

  window.beachVoice = {
    say: say, keep: keep, ask: ask, drop: drop,
    propose: propose, enter: enter, made: made, known: known,
    name: who,
    button: { shown: shown, set: setButton },
    setting: setting, set: set,
    onButton: onButton,
    beach: ROOT
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
