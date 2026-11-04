/* seal.js — the beach's seal, in the page: one module carrying the four modes a sealed line can take,
 * byte for byte as the connector seals and opens them (bsp-mcp src/keys.ts), so what a page seals
 * the router opens and the other way round. The proof is one set of test vectors shared by both
 * (bsp-mcp scripts/smoke-gray-vectors.ts, its fixtures), which this file passes in the browser and in
 * node. Coloured stigmergy, step 4 (bsp-mcp proposals/2026-11-03-coloured-stigmergy-the-design.md
 * §4.1, §4.2, §11 item 4): the pages that seal — the String at a members' door, social-brain's grain,
 * a vault, a group's stack, Community Recovery's app — seal through the beach's own voice, never with
 * copies of their own, and this is what the voice seals with.
 *
 *   <script src="https://beach.happyseaurchin.com/button/seal.js"></script>     → window.beachSeal
 *   const S = require('./seal.js')                                                 → in node, for the vectors
 *
 * THE ENVELOPE, spine-legal (every key _ or a digit), stored by any beach as any node:
 *   { _: <a note>, 1: <ciphertext b64>, 2: <nonce b64>, 9: { _: 'gray', 1: <mode>, 2?, 3?, 4? } }
 * with four modes at the marker's 1:
 *   self    — nacl.secretbox under the author's own derived key; only the author opens it
 *   grain   — a shared key between two published pairs (nacl.box.before); the other party at 9.2
 *   group   — one key wrapped to each member in a keyring at the block's own 9
 *   colour  — the group envelope with one more rung: 9.2 names the block that keeps the key,
 *             colour:<name>, and 9.3 the turn within it, so the line can stand in any block; a
 *             LETTER to a colour, sealed by someone with no copy, is boxed to the turn's public half
 *             with a one-off pair whose public half rides at 9.4
 *
 * THE PAIR a person seals with is derived once from their one word, with their handle as the salt
 * (§4.2): Argon2id(word, salt = the handle, padded to eight bytes with NUL; t=3, m=65536, p=1, 64 bytes
 * out) — bytes 0-31 the X25519 secret (and the self key), 32-63 the Ed25519 seed; the halves a passport
 * publishes at its 9 are these. THE LATCH the beach checks can be derived from the same word by a
 * different salt, 'latch:' + the handle, so that the beach holds nothing that opens a line (latch()
 * below, in the vectors); the voice sends the word itself as the latch today, as every door does, and
 * says so where it is switched (voice.js). Pairs are kept for the page's life in memory only, by a hash
 * of the word and the salt, never by the word; nothing here writes to any storage. What a page keeps on
 * the device it keeps through keep.wrap, under a key the browser will not hand out.
 *
 * Libraries: tweetnacl (nacl-fast) and hash-wasm's argon2, served beside this file at vendor/ and
 * loaded on first use; in node they are required. The salt is the string as given: a vault sealed
 * under 'https://beach.happyseaurchin.com' opens under exactly that. */
(function (root) {
  'use strict';
  if (root.beachSeal) return;
  var NODE = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  var NOTE = {
    self: 'Encrypted (gray); readable only with the author secret.',
    grain: 'Encrypted (gray); readable by the two grain parties.',
    group: 'Encrypted (gray); readable by the group (key wrapped per member in the keyring at 9).'
  };
  var KEYS_NOTE = 'Published public keys (Argon2id from secret + handle). 1 ed25519 (signing), 2 x25519 (encryption). Private halves never stored.';
  var RING = 'group-keyring', COPIES = "the copies of this turn's key, one sealed to each holder's published half";
  var LATCH = 'latch:';
  var BASE = '';
  try { var me = typeof document !== 'undefined' && document.currentScript; BASE = me && me.src ? new URL('.', me.src).href : ''; } catch (e) { BASE = ''; }

  /* ── the libraries ── */
  var libs = null;
  function need() {
    if (libs) return libs;
    if (NODE) { libs = Promise.resolve({ nacl: require('tweetnacl'), argon2id: require('hash-wasm').argon2id }); return libs; }
    libs = new Promise(function (res, rej) {
      var want = [['nacl', 'vendor/nacl-fast.min.js'], ['hashwasm', 'vendor/argon2.umd.min.js']], left = want.length;
      want.forEach(function (w) {
        if (root[w[0]]) { if (!--left) done(); return; }
        var s = document.createElement('script'); s.src = BASE + w[1]; s.async = true;
        s.onload = function () { if (!--left) done(); };
        s.onerror = function () { libs = null; rej(new Error('could not load ' + s.src)); };
        document.head.appendChild(s);
      });
      function done() { res({ nacl: root.nacl, argon2id: root.hashwasm.argon2id }); }
    });
    return libs;
  }
  var enc = new TextEncoder(), dec = new TextDecoder();
  var b64, unb64;
  if (typeof btoa === 'function' && typeof atob === 'function') {
    b64 = function (u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
    unb64 = function (s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  } else {
    b64 = function (u8) { return Buffer.from(u8).toString('base64'); };
    unb64 = function (s) { return new Uint8Array(Buffer.from(s, 'base64')); };
  }
  function hex(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16); return s; }

  /* ── the pair, derived once ── */
  var pairs = {};   // by a hash of word and salt, for the page's life; never the word
  function argon(L, word, salt) {
    var s = String(salt), saltStr = s.length >= 8 ? s : s + Array(8 - s.length + 1).join('\u0000');
    return L.argon2id({ password: String(word), salt: saltStr, parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 64, outputType: 'binary' })
      .then(function (h) { return new Uint8Array(h); });
  }
  function pair(word, salt) {
    return need().then(function (L) {
      var at = b64(L.nacl.hash(enc.encode(String(salt) + '\u0000' + String(word))));
      if (pairs[at]) return pairs[at];
      pairs[at] = argon(L, word, salt).then(function (h) {
        var x = L.nacl.box.keyPair.fromSecretKey(h.slice(0, 32)), ed = L.nacl.sign.keyPair.fromSeed(h.slice(32, 64));
        return { xpub: x.publicKey, xsec: x.secretKey, edpub: ed.publicKey, edsec: ed.secretKey };
      });
      pairs[at].catch(function () { delete pairs[at]; });
      return pairs[at];
    });
  }
  /* the one secretbox key self mode seals under: the X25519 secret of the pair */
  function key(word, salt) { return pair(word, salt).then(function (p) { return p.xsec; }); }
  /* the latch the beach could check, from the same word by another salt: Argon2id(word, 'latch:' + handle), 32 bytes, base64 */
  function latch(word, handle) { return need().then(function (L) { return argon(L, word, LATCH + handle); }).then(function (h) { return b64(h.slice(0, 32)); }); }
  function forget() { pairs = {}; }
  /* the halves a passport publishes at 9, as pscale_key_publish leaves them */
  function published(p) { return { _: KEYS_NOTE, '1': b64(p.edpub), '2': b64(p.xpub) }; }
  function publishedOf(node) {
    if (!node || typeof node !== 'object') return null;
    if (typeof node['1'] === 'string' && typeof node['2'] === 'string') return { ed25519: node['1'], x25519: node['2'] };
    if (typeof node.x25519 === 'string' && typeof node.ed25519 === 'string') return { x25519: node.x25519, ed25519: node.ed25519 };
    return null;
  }

  /* ── the envelope ── */
  function isEnvelope(n) { return !!(n && typeof n === 'object' && typeof n['1'] === 'string' && typeof n['2'] === 'string' && n['9'] && typeof n['9'] === 'object' && n['9']['_'] === 'gray'); }
  function mode(n) { var m = isEnvelope(n) ? n['9']['1'] : null; return m === 'self' || m === 'grain' || m === 'group' || m === 'colour' ? m : null; }
  /* the envelope a node stands as: the node itself, or the one at its underscore, one zero deeper (a line with fields of its own) */
  function envelopeOf(n) { return isEnvelope(n) ? n : n && typeof n === 'object' && isEnvelope(n._) ? n._ : null; }
  /* THE GREY LINE a reader who cannot open the line is shown, as the router draws it: the mode, whom a grain line is for, a colour and its turn */
  function grey(n) {
    var e = envelopeOf(n), m = mode(e);
    if (!m) return '';
    if (m === 'grain') return 'sealed · grain' + (typeof e['9']['2'] === 'string' ? ' · for ' + e['9']['2'] : '');
    if (m === 'colour') return 'sealed · colour · ' + colourName(e['9']['2'] || '') + ' · turn ' + (e['9']['3'] || '?');
    return 'sealed · ' + m;
  }
  function box(L, text, nonce, K) { return { '1': b64(L.nacl.secretbox(enc.encode(text), nonce, K)), '2': b64(nonce) }; }
  function unbox(L, env, K) { var pt = L.nacl.secretbox.open(unb64(env['1']), unb64(env['2']), K); return pt ? dec.decode(pt) : null; }

  /* ── self ── */
  function selfSeal(text, word, salt) {
    return Promise.all([need(), key(word, salt)]).then(function (r) {
      var L = r[0], b = box(L, text, L.nacl.randomBytes(L.nacl.secretbox.nonceLength), r[1]);
      return { _: NOTE.self, '1': b['1'], '2': b['2'], '9': { _: 'gray', '1': 'self' } };
    });
  }
  function selfOpen(env, word, salt) {
    if (mode(env) !== 'self') return Promise.resolve(null);
    return Promise.all([need(), key(word, salt)]).then(function (r) { return unbox(r[0], env, r[1]); });
  }

  /* ── grain: one shared key between two published pairs ── */
  function shared(word, handle, partnerXpub) {
    return Promise.all([need(), pair(word, handle)]).then(function (r) { return r[0].nacl.box.before(unb64(partnerXpub), r[1].xsec); });
  }
  /* the partner opens this with the half published at passport:<handle> 9, so given that half a word that does not derive it is refused before anything travels */
  function grainSeal(text, word, handle, partner, partnerXpub, myPublishedXpub) {
    return Promise.all([need(), pair(word, handle)]).then(function (r) {
      var L = r[0], p = r[1];
      if (myPublishedXpub !== undefined && myPublishedXpub !== null && b64(p.xpub) !== myPublishedXpub) {
        throw new Error('the word sealing this line does not derive the keys published at passport:' + handle + ' 9, so ' + partner + ' could never open it — nothing was written. Seal with the word those keys were published from.');
      }
      var k = L.nacl.box.before(unb64(partnerXpub), p.xsec), nonce = L.nacl.randomBytes(L.nacl.box.nonceLength);
      return { _: NOTE.grain, '1': b64(L.nacl.box.after(enc.encode(text), nonce, k)), '2': b64(nonce), '9': { _: 'gray', '1': 'grain', '2': partner } };
    });
  }
  function grainOpen(env, word, handle, partnerXpub) {
    if (mode(env) !== 'grain') return Promise.resolve(null);
    return Promise.all([need(), shared(word, handle, partnerXpub)]).then(function (r) {
      var pt = r[0].nacl.box.open.after(unb64(env['1']), unb64(env['2']), r[1]);
      return pt ? dec.decode(pt) : null;
    });
  }

  /* ── group: one key, a copy sealed to each member's published half ── */
  function groupKey() { return need().then(function (L) { return L.nacl.randomBytes(L.nacl.secretbox.keyLength); }); }
  function wrap(K, handle, xpub) {
    return need().then(function (L) {
      var eph = L.nacl.box.keyPair(), nonce = L.nacl.randomBytes(L.nacl.box.nonceLength);
      return { _: handle, '1': b64(L.nacl.box(K, nonce, unb64(xpub), eph.secretKey)), '2': b64(nonce), '3': b64(eph.publicKey) };
    });
  }
  /* a keyring: eight copies a page, the ninth place a page of the same shape, spine-legal for any number */
  function ring(wraps, marker) {
    var node = { _: marker || RING };
    wraps.slice(0, 8).forEach(function (w, i) { node[String(i + 1)] = w; });
    if (wraps.length > 8) node['9'] = ring(wraps.slice(8), 'more');
    return node;
  }
  function isCopy(n) { return !!(n && typeof n === 'object' && typeof n._ === 'string' && typeof n['1'] === 'string' && typeof n['2'] === 'string' && typeof n['3'] === 'string'); }
  function copies(r) {
    var out = [];
    if (!r || typeof r !== 'object') return out;
    for (var i = 1; i <= 8; i++) if (isCopy(r[String(i)])) out.push(r[String(i)]);
    var tail = r['9'];
    if (isCopy(tail)) out.push(tail); else if (tail && typeof tail === 'object') out = out.concat(copies(tail));
    return out;
  }
  /* A COPY IS FOUND BY ITS HOLDER'S NAME: the reader's own copy first, one derivation; a copy that names nobody is tried with the
   * reader's name as its salt; a ring that names neither the reader nor nobody shuts them without a derivation at all */
  function unwrapRing(r, word, handle) {
    var all = copies(r), own = all.filter(function (c) { return c._ === handle; }), rest = all.filter(function (c) { return c._ !== handle; });
    if (handle && !all.some(function (c) { return c._ === handle || c._ === ''; })) return Promise.resolve(null);
    var list = own.concat(rest), i = 0;
    return need().then(function (L) {
      function next() {
        if (i >= list.length) return null;
        var c = list[i++], salt = c._ || handle;
        if (!salt) return next();
        return pair(word, salt).then(function (p) {
          var K = L.nacl.box.open(unb64(c['1']), unb64(c['2']), unb64(c['3']), p.xsec);
          return K || next();
        });
      }
      return next();
    });
  }
  function groupSeal(text, K) {
    return need().then(function (L) {
      var b = box(L, text, L.nacl.randomBytes(L.nacl.secretbox.nonceLength), K);
      return { _: NOTE.group, '1': b['1'], '2': b['2'], '9': { _: 'gray', '1': 'group' } };
    });
  }
  function groupOpen(env, K) { if (mode(env) !== 'group') return Promise.resolve(null); return need().then(function (L) { return unbox(L, env, K); }); }

  /* ── colour: the group envelope carrying the address of its key, so the line stands in any block ── */
  function colourBlock(c) { c = String(c || '').trim(); return c.indexOf('colour:') === 0 ? c : 'colour:' + c; }
  function colourName(b) { return String(b || '').replace(/^colour:/, ''); }
  function colourNote(block, turn) { return 'Sealed for ' + block + ', turn ' + turn + '.'; }
  function parseNote(note) { var m = typeof note === 'string' ? /^Sealed for (colour:\S+), turn (\S+)\.$/.exec(note) : null; return m ? { block: m[1], turn: m[2] } : null; }
  function isTurn(n) { return !!(n && typeof n === 'object' && n['1'] && typeof n['1'] === 'object' && typeof n['2'] === 'string'); }
  /* THE TURNS of a colour block in accumulator order, each named by the address the beach allocated — which stays good across a
   * supernest: an entry at a path of digits (0 for an underscore) is addressed by that path padded right to the block's floor,
   * so turn 1 at _.1 of a floor-2 block is 01 and turn 10 at its root's 1 is 10 */
  function turns(block) {
    var floor = 0, n = block;
    while (n && typeof n === 'object' && n._ && typeof n._ === 'object') { floor++; n = n._; }
    floor = Math.max(1, floor + 1);
    var out = [];
    (function walk(node, path) {
      if (!node || typeof node !== 'object') return;
      if (path && isTurn(node)) { var a = path; while (a.length < floor) a += '0'; out.push({ address: String(parseInt(a, 10)), node: node }); return; }
      if (node._ && typeof node._ === 'object') walk(node._, path + '0');
      for (var d = 1; d <= 9; d++) if (node[String(d)]) walk(node[String(d)], path + d);
    })(block, '');
    return out.sort(function (x, y) { return parseInt(x.address, 10) - parseInt(y.address, 10); });
  }
  function current(block) { var t = turns(block); return t.length ? t[t.length - 1] : null; }
  /* a turn's key for this reader: their own copy opened with the pair their word derives, else null */
  function keyOf(turn, word, handle) { return turn && turn.node ? unwrapRing(turn.node['1'], word, handle) : Promise.resolve(null); }
  /* a turn's public half: the turn's key read as an X25519 secret, so every holder can remake the private half and anyone can seal a letter to it */
  function half(K) { return need().then(function (L) { return b64(L.nacl.box.keyPair.fromSecretKey(K).publicKey); }); }
  /* a turn as the colour block keeps it at a root slot: when it began, the ring of copies at 1, the public half for letters at 2 */
  function turn(K, wraps, now) {
    return half(K).then(function (h) {
      var iso = (now || new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
      return { _: 'from ' + iso + ': the key every line of this turn is sealed with — ' + wraps.length + (wraps.length === 1 ? ' copy' : ' copies') + " at 1, one sealed to each holder's published half; its public half for letters at 2", '1': ring(wraps, COPIES), '2': h };
    });
  }
  function colourSeal(text, block, turnAddress, K) {
    return need().then(function (L) {
      var b = box(L, text, L.nacl.randomBytes(L.nacl.secretbox.nonceLength), K);
      return { _: colourNote(block, turnAddress), '1': b['1'], '2': b['2'], '9': { _: 'gray', '1': 'colour', '2': block, '3': String(turnAddress) } };
    });
  }
  /* a letter: boxed to the turn's public half with a one-off pair, its public half at 9.4; needs no key, and its writer cannot open it */
  function letter(text, block, turnAddress, halfB64) {
    return need().then(function (L) {
      var eph = L.nacl.box.keyPair(), nonce = L.nacl.randomBytes(L.nacl.box.nonceLength);
      return { _: colourNote(block, turnAddress), '1': b64(L.nacl.box(enc.encode(text), nonce, unb64(halfB64), eph.secretKey)), '2': b64(nonce), '9': { _: 'gray', '1': 'colour', '2': block, '3': String(turnAddress), '4': b64(eph.publicKey) } };
    });
  }
  function colourOpen(env, K) {
    if (mode(env) !== 'colour') return Promise.resolve(null);
    return need().then(function (L) {
      var writer = env['9']['4'];
      if (typeof writer !== 'string') return unbox(L, env, K);
      var pt = L.nacl.box.open(unb64(env['1']), unb64(env['2']), unb64(writer), K);
      return pt ? dec.decode(pt) : null;
    });
  }

  /* ── keeping on the device: wrapped under a key the browser will not hand out ──
   * An AES-GCM key made non-extractable and kept in this origin's IndexedDB: a page may use it to
   * wrap and unwrap, and nothing can read it out — so what stands in localStorage is ciphertext, and
   * a copy of the storage alone opens nothing. Where the browser offers no such key (no IndexedDB, no
   * SubtleCrypto), wrap rejects, and the caller keeps nothing. */
  var device = null;
  function deviceKey() {
    if (device) return device;
    device = new Promise(function (res, rej) {
      var idb = root.indexedDB, subtle = root.crypto && root.crypto.subtle;
      if (!idb || !subtle) return rej(new Error('this browser keeps no device key'));
      var req = idb.open('beach-keep', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('k'); };
      req.onerror = function () { rej(req.error || new Error('no device key')); };
      req.onsuccess = function () {
        var db = req.result;
        function get() { return new Promise(function (ok, no) { var r = db.transaction('k').objectStore('k').get('device'); r.onsuccess = function () { ok(r.result || null); }; r.onerror = function () { no(r.error); }; }); }
        get().then(function (k) {
          if (k) return k;
          return subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']).then(function (made) {
            // add, never put: two tabs making one at once keep the first, and both then read it
            return new Promise(function (ok) { var r = db.transaction('k', 'readwrite').objectStore('k').add(made, 'device'); r.onsuccess = function () { ok(made); }; r.onerror = function () { ok(null); }; });
          }).then(function (k) { return k || get(); });
        }).then(function (k) { db.close(); if (!k) throw new Error('no device key'); res(k); }, function (e) { db.close(); rej(e); });
      };
    });
    device.catch(function () { device = null; });
    return device;
  }
  function wrapText(text) {
    return deviceKey().then(function (k) {
      var iv = new Uint8Array(12); root.crypto.getRandomValues(iv);
      return root.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, enc.encode(String(text))).then(function (ct) { return 'w1.' + b64(iv) + '.' + b64(new Uint8Array(ct)); });
    });
  }
  function isWrapped(v) { return typeof v === 'string' && v.indexOf('w1.') === 0; }
  function unwrapText(blob) {
    if (!isWrapped(blob)) return Promise.resolve(null);
    var p = blob.split('.');
    if (p.length !== 3) return Promise.resolve(null);
    return deviceKey().then(function (k) {
      return root.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p[1]) }, k, unb64(p[2])).then(function (pt) { return dec.decode(new Uint8Array(pt)); });
    }).catch(function () { return null; });
  }
  function keepAble() { return !!(root.indexedDB && root.crypto && root.crypto.subtle); }

  var S = {
    ready: need, pair: pair, key: key, latch: latch, forget: forget, published: published, publishedOf: publishedOf,
    isEnvelope: isEnvelope, envelopeOf: envelopeOf, mode: mode, grey: grey, NOTE: NOTE, KEYS_NOTE: KEYS_NOTE,
    b64: b64, unb64: unb64, hex: hex,
    self: { seal: selfSeal, open: selfOpen },
    grain: { seal: grainSeal, open: grainOpen, shared: shared },
    group: { key: groupKey, wrap: wrap, ring: ring, copies: copies, unwrap: unwrapRing, seal: groupSeal, open: groupOpen },
    colour: { block: colourBlock, name: colourName, note: colourNote, parse: parseNote, turns: turns, current: current, keyOf: keyOf, half: half, turn: turn, seal: colourSeal, letter: letter, open: colourOpen },
    keep: { able: keepAble, wrap: wrapText, unwrap: unwrapText, wrapped: isWrapped }
  };
  root.beachSeal = S;
  if (NODE) module.exports = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
