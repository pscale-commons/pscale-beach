/* latch.js — THE DERIVED LATCH at the beach's own doors, the voice and the button's frame (bsp-mcp proposals/
 * 2026-11-05-the-derived-latch.md §4, §5; coloured stigmergy §4.2: one word, two keys).
 *
 * A word typed once makes two keys: the sealing pair no beach sees, and the latch a beach checks, beachSeal.latch(word,
 * handle) (seal.js, loaded first). Which one a handle's latches are in is said by its passport, at 9.3 beside the
 * published halves: "latch: derived …". latchFor gives what a write sends in place of a string: the derived latch where
 * the passport at that surface says so and the string derives the halves there, else the string itself, so a shared
 * key is never derived. A hand seen switched is kept on the device (beach-form:<beach>|<hand>, its published half
 * beside it), and a passport there without the marker is then refused with nothing sent (§4.4). The proof, which comes
 * before any read at a members' beach, goes in the form kept, else the derived latch first.
 *
 * switchTo is THE SWITCH (§5.2), and it runs only when the holder asks: the marker first, then the passport, then a
 * sweep of the blocks named for the handle, each probed with no key so an open block is never latched, then the marker
 * says swept. Run again, it sweeps what still answers to the word. back: true runs it the other way; to: a new word
 * moves every latch onto the latch derived from that word, its halves published in the marker's own write.
 *
 *   <script src="seal.js"></script><script src="latch.js"></script>   → window.beachLatch
 */
(function (root) {
  'use strict';
  if (root.beachLatch) return;
  var MARK = /^latch: derived\b/, SWEPT = / · swept \d{4}-\d{2}-\d{2}T/, FORM = 'beach-form:', NAME = /^[A-Za-z0-9_-]{1,64}$/;
  var JSONH = { 'Content-Type': 'application/json', Accept: 'application/json' };
  var nines = {};
  function S() { if (!root.beachSeal) throw new Error('the seal is not loaded'); return root.beachSeal; }
  function door(base) { return String(base || '').replace(/\/\.well-known\/pscale-beach.*$/i, '').replace(/\/+$/, '').toLowerCase(); }
  function wire(base) { return door(base) + '/.well-known/pscale-beach'; }
  function stamp() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function marker(h, since, swept) { return 'latch: derived — this word reaches a beach only as the latch derived from it (seal.js latch: Argon2id, salt latch:' + h + '), never as itself · since ' + since + (swept ? ' · swept ' + swept : ''); }
  function isDerived(n) { return !!n && typeof n === 'object' && typeof n['3'] === 'string' && MARK.test(n['3']); }
  function handIn(block) { block = String(block || ''); if (/^(sed|grain|archive):/.test(block)) return ''; var i = block.lastIndexOf(':'), h = i > 0 ? block.slice(i + 1) : ''; return NAME.test(h) ? h : ''; }
  function formOf(base, h) { try { return root.localStorage.getItem(FORM + door(base) + '|' + h) || ''; } catch (e) { return ''; } }
  function keepForm(base, h, v) { try { if (v) root.localStorage.setItem(FORM + door(base) + '|' + h, v); else root.localStorage.removeItem(FORM + door(base) + '|' + h); } catch (e) {} }
  function with_(h, extra) { var o = {}, k; for (k in (h || JSONH)) o[k] = (h || JSONH)[k]; for (k in extra) o[k] = extra[k]; return o; }
  /* the hand's 9 at a surface, read once a page: the node, null where none, 'unread' behind a wall or with no answer */
  function nineAt(base, h, headers) {
    var k = door(base) + '|' + h;
    if (!nines[k]) nines[k] = fetch(wire(base) + '?block=' + encodeURIComponent('passport:' + h), { cache: 'no-store', headers: with_(headers, { Accept: 'application/json' }) })
      .then(function (r) { return r.ok ? r.json().then(function (p) { return (p && p['9']) || null; }) : r.status === 404 ? null : 'unread'; }, function () { return 'unread'; });
    return nines[k];
  }
  function forget(base, h) { if (!base) nines = {}; else delete nines[door(base) + '|' + h]; }
  function halfOf(word, h) { return S().pair(word, h).then(function (p) { return S().published(p)['2']; }); }
  function gone(base, h) { var e = new Error(door(base).replace(/^https?:\/\//, '') + ' no longer says ' + h + '’s key is derived, though this device saw it say so: nothing was sent.'); e.code = 'form_gone'; e.refused = true; return e; }

  /* what a write to `block` sends in place of s: { send, hand?, swept? } */
  function latchFor(base, block, s, hands, headers) {
    if (typeof s !== 'string' || !s) return Promise.resolve({ send: s });
    var hs = [handIn(block)].concat(hands || []).filter(function (h, i, a) { return h && NAME.test(h) && a.indexOf(h) === i; });
    function next(i) {
      if (i >= hs.length) return { send: s };
      var h = hs[i];
      return nineAt(base, h, headers).then(function (nine) {
        var derived = nine !== 'unread' && isDerived(nine), kept = formOf(base, h);
        if (nine === 'unread' || (!derived && kept.indexOf('derived:') !== 0)) return next(i + 1);
        return halfOf(s, h).then(function (mine) {
          if (!derived) { if (kept === 'derived:' + mine) throw gone(base, h); return next(i + 1); }
          var has = S().publishedOf(nine);
          if (!has) return next(i + 1);
          keepForm(base, h, 'derived:' + has.x25519);
          return has.x25519 === mine ? S().latch(s, h).then(function (L) { return { send: L, hand: h, swept: SWEPT.test(nine['3']) }; }) : next(i + 1);
        });
      });
    }
    return Promise.resolve().then(function () { return next(0); });
  }
  /* a write's body with its keys in the form each hand's passport names */
  function body(base, b, hands, headers) {
    if (!b || !((typeof b.secret === 'string' && b.secret) || (typeof b.new_lock === 'string' && b.new_lock))) return Promise.resolve(b);
    return Promise.all([latchFor(base, b.block, b.secret, hands, headers), latchFor(base, b.block, b.new_lock, hands, headers)]).then(function (r) {
      var o = {}, k; for (k in b) o[k] = b[k];
      if (typeof b.secret === 'string') o.secret = r[0].send;
      if (typeof b.new_lock === 'string') o.new_lock = r[1].send;
      return o;
    });
  }
  /* the proof's forms, in order: the form kept here for the name, else the derived latch first */
  function proofForms(base, h, s) {
    var kept = formOf(base, h);
    return S().latch(s, h).then(function (L) { return kept.indexOf('derived:') === 0 ? [L] : kept === 'word' ? [s, L] : [L, s]; });
  }
  function proved(base, h, key, s) { if (key === s) keepForm(base, h, 'word'); else if (formOf(base, h).indexOf('derived:') !== 0) keepForm(base, h, 'derived:'); }

  /* the switch's own posts: a lock-only post (the probe, no secret and new_lock null; or a rotation), or a write */
  function post(base, b, headers) {
    return fetch(wire(base) + '?block=' + encodeURIComponent(b.block), { method: 'POST', cache: 'no-store', headers: with_(headers, JSONH), body: JSON.stringify(b) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (d) { return { ok: r.ok && !(d && d.error), status: r.status, error: d && (d.error || d.message) }; }); },
        function (e) { return { ok: false, status: 0, error: String((e && e.message) || e) }; });
  }
  function sweep(base, blocks, from, to, movedFirst, headers) {
    var out = { moved: [], already: [], open: [], refused: [], skipped: [] }, queue = blocks.slice();
    function one(b) {
      if (/^(sed|grain):/.test(b)) { out.skipped.push(b); return Promise.resolve(); }
      return post(base, { block: b, new_lock: null }, headers).then(function (p) {
        if (p.ok) { out.open.push(b); return; }
        if (p.status !== 403) { out.skipped.push(b); return; }
        var first = movedFirst ? post(base, { block: b, secret: to, new_lock: to }, headers) : Promise.resolve({ ok: false });
        return first.then(function (a) {
          if (a.ok) { out.already.push(b); return; }
          return post(base, { block: b, secret: from, new_lock: to }, headers).then(function (r) { (r.ok ? out.moved : out.refused).push(b); });
        });
      });
    }
    function worker() { return queue.length ? one(queue.shift()).then(worker) : Promise.resolve(); }
    return Promise.all([worker(), worker(), worker(), worker()]).then(function () { return out; });
  }
  /* THE SWITCH, when the holder asks: { ok, swept, moved, already, open, refused, skipped } or { ok: false, error } */
  function switchTo(base, h, word, op, headers) {
    op = op || {};
    var P = 'passport:' + h;
    forget(base, h);
    return Promise.all([nineAt(base, h, headers), fetch(wire(base), { cache: 'no-store', headers: with_(headers, { Accept: 'application/json' }) }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })])
      .then(function (r) {
        var nine = r[0], ix = r[1];
        if (nine === 'unread' || !nine || !S().publishedOf(nine)) return { ok: false, error: P + ' has no halves at 9 here: put the word on first (wear, or prove at a members’ beach)' };
        var was = isDerived(nine), since = (was && /since (\S+)/.exec(nine['3']) || [])[1] || stamp();
        var named = ((ix && ix.blocks) || []).map(function (b) { return typeof b === 'string' ? b : (b && b.name) || ''; })
          .filter(function (n) { return n !== P && handIn(n) === h; }).concat(op.blocks || []);
        return Promise.all([S().latch(word, h), op.to ? S().latch(op.to, h) : null, op.to ? S().pair(op.to, h) : null, halfOf(word, h)]).then(function (k) {
          var L = k[0], Lnew = k[1], pairNew = k[2], mine = k[3], has = S().publishedOf(nine);
          if (has.x25519 !== mine) return { ok: false, error: 'that word does not derive the halves at ' + P + ' 9' };
          if (op.back) {
            if (!was) return { ok: false, error: P + ' says nothing of a derived latch: its latches stand on the word already' };
            return sweep(base, named, L, word, false, headers).then(function (s) {
              return post(base, { block: P, secret: L, new_lock: word }, headers).then(function (root_) {
                if (!root_.ok) { s.ok = false; s.error = 'the passport did not move back: ' + root_.error; return s; }
                return post(base, { block: P, spindle: '9', content: { _: nine._, '1': nine['1'], '2': nine['2'] }, secret: word }, headers).then(function (w) {
                  keepForm(base, h, 'word'); forget(base, h); s.ok = w.ok; if (!w.ok) s.error = '9.3 still stands: ' + w.error; return s;
                });
              });
            });
          }
          var cur = was ? L : word, to = Lnew || L;   // the form the latches stand in now, and the one they move to
          var mark = op.to ? (function () { var n = S().published(pairNew); n['3'] = marker(h, since); return { spindle: '9', content: n }; })() : { spindle: '9.3', content: marker(h, since) };
          var first = (!was || op.to) ? post(base, { block: P, spindle: mark.spindle, content: mark.content, secret: cur }, headers) : Promise.resolve({ ok: true });
          return first.then(function (m) {
            if (!m.ok) return { ok: false, error: 'nothing was switched: the marker could not be written (' + m.error + ')' };
            forget(base, h);
            var moveRoot = cur !== to ? post(base, { block: P, secret: cur, new_lock: to }, headers) : Promise.resolve({ ok: true });
            return moveRoot.then(function (rt) {
              if (!rt.ok) return { ok: false, error: 'the marker stands but the passport did not move (' + rt.error + '): ask again with the same word' };
              return sweep(base, named, was && !op.to ? word : cur, to, was && !op.to, headers).then(function (s) {
                return post(base, { block: P, spindle: '9.3', content: marker(h, since, stamp()), secret: to }, headers).then(function (w) {
                  forget(base, h);
                  keepForm(base, h, 'derived:' + (op.to ? S().published(pairNew)['2'] : has.x25519));
                  s.ok = true; s.swept = w.ok; return s;
                });
              });
            });
          });
        });
      });
  }

  root.beachLatch = { latchFor: latchFor, body: body, proofForms: proofForms, proved: proved, switchTo: switchTo, isDerived: isDerived, marker: marker, forget: forget };
})(typeof globalThis !== 'undefined' ? globalThis : this);
