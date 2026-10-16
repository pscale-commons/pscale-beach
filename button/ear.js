/* ear.js — what reaches a person from this beach, in the beach's own window.
 *
 * Opened from the button's settings ('what reaches you'), top-level, so no page can frame it,
 * cover it or read it. The button's frame hands it the person's handle and passphrase — the
 * beach's origin to the beach's origin, to this window alone, once it has said it is ready — and
 * it shows their ear (ear:<handle>), each watch as the sentence it is, and changes it under their
 * own key: a room followed, a watch ended. The law is the beach's own (ways:push), read here and
 * never hardcoded in spirit: a watch is {_: the sentence a person reads, 1: the kind, 2: the
 * parameter, 3: channel kinds}; ending one removes its position whole, behind the confirm gate;
 * scale past nine is depth, never supernest. Where a person is reached — an email, a phone — is
 * never here: it lives at the push engine, enrolled by proof, and the engine's address is read
 * from the law.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(location.search);
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  /* the beach is the one that serves this window; only a window served from this computer — a
   * builder's test — may be pointed at another */
  var BEACH = (LOCAL && q.get('beach')) || location.origin;
  var nonce = q.get('n') || '';
  var asker = (q.get('for') || '').slice(0, 120);
  var KINDS = ['parlour', 'named', 'located', 'room', 'wake'];

  /* Shown nothing unless the button's own frame opened it: a page of another origin that opens
   * this window, or frames it, is not its opener, and gets no answer and no person. */
  var opener = null;
  try {
    if (window.top === window && window.opener && window.opener.location.origin === location.origin) opener = window.opener;
  } catch (e) { opener = null; }
  if (!opener || !nonce) return;

  var who = null, ear = null, busy = false;
  function say(t) { $('msg').textContent = t || ''; }

  addEventListener('message', function (e) {
    var m = e.data || {};
    if (who || e.source !== opener || e.origin !== location.origin || m.type !== 'beach:ear' || m.n !== nonce) return;
    if (!/^[^\s:/?#]{1,64}$/.test(String(m.handle || ''))) return;
    who = { handle: String(m.handle), secret: String(m.secret || '') };
    begin();
  });
  opener.postMessage({ type: 'beach:ear-ready', n: nonce }, location.origin);
  $('done').onclick = function () { window.close(); };

  /* ── the wire: the same /.well-known/pscale-beach every client calls ── */
  function url(block, pscale) {
    var u = new URL(BEACH + '/.well-known/pscale-beach');
    u.searchParams.set('block', block);
    if (pscale != null) u.searchParams.set('pscale', String(pscale));
    return u.href;
  }
  function read(block, pscale) {
    return fetch(url(block, pscale), { cache: 'no-store', headers: { Accept: 'application/json' } }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('the beach answered ' + r.status);
      return r.json();
    });
  }
  function post(body) {
    return fetch(BEACH + '/.well-known/pscale-beach', {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        return { ok: r.ok && !j.error, status: r.status, error: j.error || null, code: j.code || null };
      });
    }, function () { return { ok: false, status: 0, error: 'the beach did not answer' }; });
  }

  /* ── an ear, read as every reader reads one (ways:push 1): a position whose 1 is a kind-word is
   * a watch; an object without one is a category, walked three levels deep ── */
  function kindOf(n) { return n && typeof n === 'object' ? String(n['1'] || '').trim().toLowerCase() : ''; }
  function isWatch(n) { return KINDS.indexOf(kindOf(n)) >= 0; }
  function sentence(n) {
    return typeof n._ === 'string' && n._.trim() ? n._.trim() : kindOf(n) + (n['2'] ? ' ' + n['2'] : '');
  }
  function room(s) { return String(s || '').trim().replace(/^pool:/, ''); }
  function same(n, w) {
    if (kindOf(n) !== w['1']) return false;
    if (w['1'] === 'parlour') return true;
    return room(n['2']) === room(w['2']);
  }
  function each(node, fn, path, depth) {
    path = path || []; depth = depth || 0;
    if (!node || typeof node !== 'object' || depth > 2) return;
    for (var d = 1; d <= 9; d++) {
      var k = String(d), n = node[k];
      if (!n || typeof n !== 'object') continue;
      if (isWatch(n)) fn(n, path.concat(k), depth, false);
      else { fn(n, path.concat(k), depth, true); each(n, fn, path.concat(k), depth + 1); }
    }
  }
  function has(node, w) { var found = false; each(node, function (n, p, d, group) { if (!group && same(n, w)) found = true; }); return found; }
  function at(node, path) { for (var i = 0; i < path.length && node; i++) node = node[path[i]]; return node; }

  function begin() {
    $('lead').textContent = 'What reaches ' + who.handle + ' from this beach: each line is one watch, read by the push engine' +
      (asker ? '. Opened from the button on ' + asker : '') + '.';
    $('ear').hidden = false;
    $('reading').hidden = !!who.secret;
    $('add').hidden = !who.secret;
    read('ways:push').then(function (law) {
      var m = law && typeof law._ === 'string' && /The engine:\s*(https:\/\/[^\s()]+)/.exec(law._);
      if (!m) return;
      $('engine').href = m[1].replace(/[.,;]+$/, '') + '/push?handle=' + encodeURIComponent(who.handle);
      $('where').hidden = false;
    }, function () {});
    look();
  }

  function look() {
    return read('ear:' + who.handle).then(function (cur) { ear = cur; paint(); }, function (err) {
      say('Could not read your ear: ' + (err && err.message || err));
    });
  }

  function paint() {
    var list = $('watches'), any = false;
    list.textContent = '';
    each(ear, function (n, path, depth, group) {
      var li = document.createElement('li');
      li.style.paddingLeft = (depth * 14) + 'px';
      if (group) {
        li.className = 'group';
        li.textContent = typeof n._ === 'string' ? n._ : '';
        return list.appendChild(li);
      }
      any = true;
      li.className = 'watch';
      var s = document.createElement('span'); s.textContent = sentence(n); li.appendChild(s);
      if (who.secret) {
        var end = document.createElement('button');
        end.type = 'button'; end.className = 'link'; end.textContent = 'end';
        end.onclick = function () { ask(li, n, path); };
        li.appendChild(end);
      }
      list.appendChild(li);
    });
    $('none').hidden = any;
    var h = who.handle;
    $('parlour').hidden = has(ear, { 1: 'parlour' });
    $('named').hidden = has(ear, { 1: 'named', 2: h });
  }

  function hold(v) {
    busy = v;
    Array.prototype.forEach.call(document.querySelectorAll('main button'), function (b) { if (b.id !== 'done') b.disabled = v; });
  }

  /* Ending a watch is asked once more, in place: a watch ended is a voice no longer heard. */
  function ask(li, n, path) {
    if (busy) return;
    var row = document.createElement('span'); row.className = 'sure';
    var keep = document.createElement('button'); keep.type = 'button'; keep.className = 'link'; keep.textContent = 'keep';
    var go = document.createElement('button'); go.type = 'button'; go.className = 'link'; go.textContent = 'end it';
    row.append(keep, go);
    li.replaceChild(row, li.lastChild);
    keep.onclick = paint;
    go.onclick = function () { end(n, path); };
  }

  /* The position goes whole, under the confirm gate (ways:push 1): a scalar written at a watch
   * would only blank its sentence and leave it standing. The ear is read again first, so a change
   * made elsewhere since this window looked is never written over. */
  function end(n, path) {
    hold(true); say('');
    read('ear:' + who.handle).then(function (cur) {
      var there = at(cur, path);
      if (!there || !same(there, { 1: kindOf(n), 2: n['2'] })) {
        ear = cur; paint();
        return { ok: false, error: 'your ear changed elsewhere since this window looked; look again' };
      }
      var next = JSON.parse(JSON.stringify(cur)), parent = at(next, path.slice(0, -1));
      delete parent[path[path.length - 1]];
      return post({ block: 'ear:' + who.handle, content: next, secret: who.secret, confirm: true });
    }).then(function (r) {
      hold(false);
      if (!r.ok) return say('Not ended: ' + (r.error || r.status) + (r.status === 403 ? ' — unlock the button again if your words were wrong.' : ''));
      changed('Ended: that no longer reaches you.');
    }, function (err) { hold(false); say('Not ended: ' + (err && err.message || err)); });
  }

  /* The ear a first watch founds: the engine's own default (parlour and the person's name, ways:push
   * 2), locked under the person's own words — which the beach ties to their passport. */
  function bornEar(h) {
    return {
      _: 'What ' + h + ' hears about from this beach — each digit position one subscription, machine-read by the push engine; where to reach me lives at the engine by proof, never here. Shapes and law: ways:push at this beach.',
      1: { _: 'A voice landing in my parlour reaches me.', 1: 'parlour', 3: 'all' },
      2: { _: 'My name voiced in any pool here reaches me.', 1: 'named', 2: h, 3: 'all' }
    };
  }
  function found(block) {
    var body = { block: 'ear:' + who.handle, content: block, new_lock: who.secret };
    return post(body).then(function (w) {
      if (w.ok || w.code !== 'handle_bound') return w;
      body.secret = who.secret;
      return post(body);
    });
  }

  function follow(w, what) {
    if (busy) return;
    hold(true); say('');
    read('ear:' + who.handle).then(function (cur) {
      if (!cur) {
        var born = bornEar(who.handle);
        if (!has(born, w)) born['3'] = w;
        return found(born);
      }
      if (has(cur, w)) return { ok: true, already: true };
      var free = '';
      for (var d = 1; d <= 9 && !free; d++) { var v = cur[String(d)]; if (v === undefined || v === null || v === '') free = String(d); }
      if (!free) return { ok: false, error: 'your ear holds nine at its top already — end one first' };
      return post({ block: 'ear:' + who.handle, spindle: free, content: w, secret: who.secret });
    }).then(function (r) {
      hold(false);
      if (!r.ok) return say('Not followed: ' + (r.error || r.status) + (r.status === 403 ? ' — unlock the button again if your words were wrong.' : ''));
      changed(r.already ? what + ' already reaches you.' : 'Following ' + what + ': a voice there now reaches you, wherever you are enrolled.');
    }, function (err) { hold(false); say('Not followed: ' + (err && err.message || err)); });
  }

  function changed(text) {
    look().then(function () { say(text); });
    try { opener.postMessage({ type: 'beach:ear-changed', n: nonce }, location.origin); } catch (e) {}
  }

  $('parlour').onclick = function () {
    follow({ _: 'A voice landing in my parlour reaches me.', 1: 'parlour', 3: 'all' }, 'your parlour');
  };
  $('named').onclick = function () {
    follow({ _: 'My name voiced in any pool here reaches me.', 1: 'named', 2: who.handle, 3: 'all' }, 'your name');
  };
  /* a room is followed only where one stands, so a misspelt name never watches nothing */
  $('roomf').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var name = room($('room').value);
    if (!/^[^\s:][^:]{0,62}$/.test(name)) return say('A room is pool:<name> — a name with no spaces or colons.');
    var block = 'pool:' + name;
    hold(true);
    read(block, 0).then(function (r) {
      hold(false);
      if (!r) return say('No room called ' + block + ' stands on this beach.');
      $('room').value = '';
      follow({ _: 'Any voice landing in ' + block + ' reaches me.', 1: 'room', 2: block, 3: 'all' }, block);
    }, function (err) { hold(false); say('Could not look for ' + block + ': ' + (err && err.message || err)); });
  });
})();
