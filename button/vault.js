/* vault.js — the vault, opened in the page.
 *
 * A person's vault is one block at their home beach, vault:<handle> (ways:vault): the root law in
 * plain text, and beneath it entries — each a KEY-GROUP the handle holds — sealed individually, so
 * that a session holding the ONE sovereign key recovers every other key the handle owns. This file
 * lets a page do what only the router (bsp-mcp) could do until now: seal and open those entries in
 * the browser, so a key goes from the beach to this page to the service it pays, and nowhere else.
 *
 * THE CIPHER is bsp-mcp's own (src/keys.ts), byte for byte, so what a page seals the router opens and
 * the other way round: Argon2id(sovereign, salt = the beach's URL form, padded to eight bytes;
 * 3 iterations, 64 MB, parallelism 1, 64 bytes out) — the first 32 bytes are the X25519 secret key,
 * and a SELF envelope is nacl.secretbox under that key: {_: note, 1: ciphertext, 2: nonce,
 * 9: {_: 'gray', 1: 'self'}} — spine-legal, so the beach's shape gate admits it and a keyless
 * reader sees opaque structure and nothing else.
 *
 * THE SALT IS THE ADDRESSING FORM (ways:vault 2.3): a vault decrypts only under the exact string it
 * was sealed with. The recipe founds a vault as bsp(agent_id='<beach-url>', …), so the salt here is
 * the beach's origin, e.g. 'https://beach.happyseaurchin.com' — never the handle.
 *
 * THE ENTRY a page appends (characters-in-the-vault, 2026-09-15; the image key and the picture place,
 * 2026-09-29): { _: <plain label — what the key is, for whom, since when>, 1: <sealed: the key alone> }
 * The label IS the list, readable without the key; the key is never plain. Every write carries the
 * sovereign as the latch (secret) and never a per-spindle lock (ways:vault 1.2).
 *
 * Libraries: tweetnacl (nacl-fast) and hash-wasm's argon2, vendored at /vendor/, loaded on first use.
 * In node (tests) they are required.
 */
(function (root) {
  'use strict';
  var NOTE = 'Encrypted (gray); readable only with the author secret.';
  var libs = null;
  function need() {
    if (libs) return libs;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      libs = Promise.resolve({ nacl: require('tweetnacl'), argon2id: require('hash-wasm').argon2id });
      return libs;
    }
    libs = new Promise(function (res, rej) {
      var want = [['nacl', '/vendor/nacl-fast.min.js'], ['hashwasm', '/vendor/argon2.umd.min.js']];
      var left = want.length;
      want.forEach(function (w) {
        if (root[w[0]]) { if (!--left) done(); return; }
        var s = document.createElement('script'); s.src = w[1]; s.async = true;
        s.onload = function () { if (!--left) done(); };
        s.onerror = function () { rej(new Error('could not load ' + w[1])); };
        document.head.appendChild(s);
      });
      function done() { res({ nacl: root.nacl, argon2id: root.hashwasm.argon2id }); }
    });
    return libs;
  }
  var enc = new TextEncoder(), dec = new TextDecoder();
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  if (typeof btoa === 'undefined') { /* node */
    b64 = function (u8) { return Buffer.from(u8).toString('base64'); };
    unb64 = function (s) { return new Uint8Array(Buffer.from(s, 'base64')); };
  }

  /* the key: Argon2id as bsp-mcp derives it, remembered for the sitting so a vault opens once */
  var derived = {};
  function keyFor(secret, salt) {
    var k = salt + '\u0000' + secret;
    if (derived[k]) return derived[k];
    derived[k] = need().then(function (L) {
      var saltStr = salt.length >= 8 ? salt : salt + Array(8 - salt.length + 1).join('\u0000');
      return L.argon2id({ password: secret, salt: saltStr, parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 64, outputType: 'binary' });
    }).then(function (hash) { return new Uint8Array(hash).slice(0, 32); });
    return derived[k];
  }
  function forget() { derived = {}; }

  function isEnvelope(n) { return !!(n && typeof n === 'object' && typeof n['1'] === 'string' && typeof n['2'] === 'string' && n['9'] && typeof n['9'] === 'object' && n['9']['_'] === 'gray'); }
  function seal(plaintext, secret, salt) {
    return Promise.all([need(), keyFor(secret, salt)]).then(function (r) {
      var nacl = r[0].nacl, key = r[1];
      var nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      var ct = nacl.secretbox(enc.encode(plaintext), nonce, key);
      return { _: NOTE, '1': b64(ct), '2': b64(nonce), '9': { _: 'gray', '1': 'self' } };
    });
  }
  function open(envelope, secret, salt) {
    if (!isEnvelope(envelope) || envelope['9']['1'] !== 'self') return Promise.resolve(null);
    return Promise.all([need(), keyFor(secret, salt)]).then(function (r) {
      var pt = r[0].nacl.secretbox.open(unb64(envelope['1']), unb64(envelope['2']), r[1]);
      return pt ? dec.decode(pt) : null;
    });
  }

  /* ── the block on the wire ── */
  function wire(origin) { return origin.replace(/\/+$/, '') + '/.well-known/pscale-beach'; }
  function getJSON(u) { return fetch(u, { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error('read failed (' + r.status + ')'); return r.json(); }); }
  function post(origin, body) {
    return fetch(wire(origin), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { d.ok = r.ok; d.status = r.status; return d; }); });
  }
  function voice(n) { while (n && typeof n === 'object') n = n._; return typeof n === 'string' ? n : ''; }
  function digits(n) { return n && typeof n === 'object' ? Object.keys(n).filter(function (k) { return /^[1-9]$/.test(k); }).sort() : []; }

  /* READ — every entry the vault holds, opened where the key opens it. An entry appended by a page is
   * {_: label, 1: envelope}; an entry the router wrote whole is an envelope itself (its text may carry
   * its own label). Entries that do not open under this key are listed as sealed. */
  function read(origin, handle, secret) {
    var salt = origin.replace(/\/+$/, '');
    return getJSON(wire(origin) + '?block=' + encodeURIComponent('vault:' + handle) + '&_t=' + Date.now()).then(function (block) {
      if (!block) return { exists: false, law: '', entries: [] };
      var out = [];
      digits(block).forEach(function (k) {
        var e = block[k];
        if (isEnvelope(e)) out.push({ slot: k, label: '', whole: true, envelope: e });
        else if (e && typeof e === 'object') out.push({ slot: k, label: typeof e._ === 'string' ? e._ : '', whole: false, envelope: isEnvelope(e['1']) ? e['1'] : null });
      });
      return Promise.all(out.map(function (e) {
        if (!e.envelope) return Promise.resolve(e);
        return open(e.envelope, secret, salt).then(function (text) { e.text = text; e.opened = text !== null; return e; });
      })).then(function (entries) { return { exists: true, law: voice(block), entries: entries }; });
    });
  }

  /* FOUND — a vault born locked whole under the sovereign (ways:vault 4.2), then proved at 9 with a
   * canary three ways (4.3): the sealed text opens under the key, and not under a wrong one. */
  function found(origin, handle, secret, law) {
    var salt = origin.replace(/\/+$/, '');
    return post(origin, { block: 'vault:' + handle, content: { _: law }, new_lock: secret }).then(function (w) {
      if (!w.ok) throw new Error(w.code === 'handle_bound' ? 'a vault answers to the same key as your passport — this key does not open passport:' + handle : (w.error || 'could not found the vault (' + w.status + ')'));
      var canary = 'canary — sealed ' + new Date().toISOString() + ' by ' + handle + ' at ' + salt + '; if this reads, the key opens the vault';
      return seal(canary, secret, salt).then(function (env) {
        return post(origin, { block: 'vault:' + handle, spindle: '9', content: env, secret: secret });
      }).then(function (w2) {
        if (!w2.ok) throw new Error(w2.error || 'the canary was refused');
        return getJSON(wire(origin) + '?block=' + encodeURIComponent('vault:' + handle) + '&spindle=9&_t=' + Date.now());
      }).then(function (env) {
        return Promise.all([open(env, secret, salt), open(env, secret + 'x', salt)]);
      }).then(function (r) {
        if (r[0] !== canary) throw new Error('the canary did not read back under the key');
        if (r[1] !== null) throw new Error('the canary opened under a wrong key — refusing to trust this vault');
        return true;
      });
    });
  }

  /* KEEP — one key-group: the label plain at the entry, the key sealed at its 1. A slot given rewrites
   * that entry (a rotation rewrites one entry, never the table); none given appends. */
  function keep(origin, handle, secret, label, plaintext, slot) {
    var salt = origin.replace(/\/+$/, '');
    return seal(plaintext, secret, salt).then(function (env) {
      if (slot) return post(origin, { block: 'vault:' + handle, spindle: String(slot), content: { _: label, '1': env }, secret: secret }).then(function (w) { if (!w.ok) throw new Error(w.error || 'the vault refused the entry'); return String(slot); });
      return post(origin, { block: 'vault:' + handle, content: { _: label }, append: true, secret: secret }).then(function (w) {
        if (!w.ok) throw new Error(w.code === 'lock_required' ? 'that is not the key this vault answers to' : (w.error || 'the vault refused the entry'));
        var at = String(w.slot);
        return post(origin, { block: 'vault:' + handle, spindle: at + '.1', content: env, secret: secret }).then(function (w2) { if (!w2.ok) throw new Error(w2.error || 'the key could not be sealed'); return at; });
      });
    });
  }

  root.vault = { seal: seal, open: open, read: read, found: found, keep: keep, isEnvelope: isEnvelope, forget: forget, NOTE: NOTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.vault;
})(typeof globalThis !== 'undefined' ? globalThis : this);
