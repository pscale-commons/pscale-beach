/* The room plug — a game's players introduced, then playing player to player (27 Oct 2026, the first piece
 * of the relay: spine:tronic-glass 1.1.1.1.3, David's GO; the scope in bsp-mcp proposals/2026-10-22-the-
 * relay-for-live-play.md §8 step 1). A third script beside the voice and the plug:
 *
 *   <script src="https://beach.happyseaurchin.com/button/voice.js"></script>
 *   <script src="https://beach.happyseaurchin.com/button/game.js" data-game="ghost-wire"></script>
 *   <script src="https://beach.happyseaurchin.com/button/room.js" data-game="ghost-wire"></script>
 *
 * The beach is where a room is found; the bytes of play go player to player. The players of a room are
 * introduced over the room's WIRE, and each pair opens one RTCPeerConnection with two data channels: STATE,
 * unordered and never retransmitted (a late position is dropped, the next supersedes it), and EVENTS,
 * ordered (a move, a finish, a word). A pair the direct path cannot join is carried by the wire instead,
 * so the room always plays, only slower. Each pair's ping is measured both ways, direct and relayed.
 *
 *   beachRoom.join({ room, name, direct })   enter the room (the game's, pool:<game>, or one named); resolves
 *                                            { ok, id, name, room, wire } — wire is 'vapour' or 'beach'
 *   beachRoom.peers()                        who is in the room: [{ id, name, direct, status, ping }], ping being
 *                                            { direct, relayed, theirs: { direct, relayed } } in milliseconds
 *   beachRoom.send(kind, body, { to, reliable })  a message to one peer or all, direct where a channel is open,
 *                                            else over the wire; returns where it went, 'direct' or 'relayed'
 *   beachRoom.on(event, fn)                  'peer' (arrived), 'direct' (channel open), 'gone', 'message'
 *                                            ({ from, name, kind, body, via }), 'ping' (a pair's numbers moved)
 *   beachRoom.ping()                         one ping round now (one runs every two seconds while joined)
 *   beachRoom.leave()                        out of the room, the slot blanked, every connection closed
 *
 * THE WIRE IS THE RELAY THE BEACH NAMES. A beach says at its own address where its introductions go (the
 * fourth decision at tronic-glass 1.1.1.1.5, GO), in its settings block under 1, the vapour subsystem:
 * 1.3 'vapour_url=<the realtime host>' and 1.4 'vapour_key=<its publishable key>' — the mirror's Supabase
 * Realtime, which this script speaks over one raw WebSocket in the Phoenix shape, with no library; and 1.5
 * 'turn_url=<a route answering { iceServers }>' for the pairs that cannot connect without TURN. Where the
 * beach names no vapour, the room's own LIQUID carries the introductions: liquid:<room>, one slot per
 * player, overwriting (block-conventions 4.5), each slot a pending intention ('ann is in the room, reaching
 * bob') with the player's mailbox at 7, polled every second — a hop takes a second or two, so a pair that
 * cannot connect directly plays slowly there, and the page should say so. Nothing of the wire is play's
 * record: a slot is blanked on leaving, and the beach keeps nothing of what crossed it.
 *
 * WHO OFFERS: of a pair, the lower id offers and the higher answers (the voice's perfect negotiation, the
 * polite side by name); candidates are gathered before the offer is sent, so an introduction is one offer
 * and one answer over any wire. STUN is Google's public server until the beach names TURN. */
(function () {
  'use strict';
  if (window.beachRoom) return;
  var me = document.currentScript;
  var BASE = new URL('.', (me && me.src) || location.href);
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(BASE.hostname);
  var ROOT = ((LOCAL && me && me.getAttribute('data-beach')) || BASE.origin).replace(/\/+$/, '');
  var BEACH = ROOT + '/.well-known/pscale-beach';
  var GAME = fieldOf(me && me.getAttribute('data-game'));
  var ROOM_TAG = roomOf(me && me.getAttribute('data-room'));
  var FRESH = 25000;        // a slot or a hello older than this is a player gone
  var POLL_FAST = 1000, POLL_SLOW = 4000, HEART = 10000, PING_EVERY = 2000, GATHER = 2000;
  var STUN = [{ urls: 'stun:stun.l.google.com:19302' }];

  function fieldOf(f) { f = String(f || '').trim().toLowerCase(); return /^[a-z0-9][a-z0-9-]{0,63}$/.test(f) ? f : ''; }
  function roomOf(r) { r = String(r || '').trim().toLowerCase(); return /^pool:[a-z0-9][a-z0-9-]{0,63}$/.test(r) ? r : ''; }
  function voiceOf(v) { while (v && typeof v === 'object') v = v._; return typeof v === 'string' ? v : ''; }
  function clean(v) { return String(v || '').replace(/[^a-z0-9_\s-]/gi, '').replace(/\s+/g, ' ').trim().slice(0, 40); }
  function fail(msg) { return Promise.resolve({ ok: false, error: msg }); }
  function failed(e) { return { ok: false, error: 'the beach could not be reached: ' + ((e && e.message) || e) }; }
  function rand(n) { var s = ''; while (s.length < n) s += Math.random().toString(36).slice(2); return s.slice(0, n); }
  function b64(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(s) { try { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); } catch (e) { return ''; } }

  // ── the beach, and its clock ──
  var clock = null;
  function stamp(r) {
    var h = r && r.headers && r.headers.get('X-Pscale-Now');
    var p = (h || '').split('|').map(function (x) { return x.trim(); });
    if (p.length === 3 && /^\d{10}$/.test(p[1]) && !isNaN(Date.parse(p[0]))) clock = { iso: p[0], address: p[1], at: Date.now() };
  }
  function now() { return clock ? new Date(Date.parse(clock.iso) + (Date.now() - clock.at)) : new Date(); }
  function read(block) {
    return fetch(BEACH + '?block=' + encodeURIComponent(block), { cache: 'no-store', headers: { Accept: 'application/json' } }).then(function (r) {
      stamp(r);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('the beach answered ' + r.status);
      return r.json();
    });
  }
  function post(body) {
    return fetch(BEACH, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        stamp(r);
        return r.json().catch(function () { return null; }).then(function (d) {
          return { ok: r.ok && !(d && d.error), status: r.status, code: d && d.code, error: d && (d.error || d.message), slot: d && d.slot };
        });
      });
  }

  // ── what the beach names: its vapour, its TURN ──
  var named = null;
  /* settings 1.3 'vapour_url=…', 1.4 'vapour_key=…', 1.5 'turn_url=…' — each a 'word=value' line at its leaf;
   * a script served from a builder's own computer may name them itself, data-vapour="<url> <key>" and
   * data-turn="<url>" */
  function naming() {
    if (named) return named;
    function pair(v) { var m = /^\s*[a-z_]+\s*=\s*(\S.*)$/i.exec(voiceOf(v) || ''); return m ? m[1].trim() : ''; }
    var own = LOCAL && me && me.getAttribute('data-vapour') ? me.getAttribute('data-vapour').trim().split(/\s+/) : null;
    var p = own ? Promise.resolve({ url: own[0] || '', key: own[1] || '', turn: (me.getAttribute('data-turn') || '').trim() })
      : read('settings').then(function (s) {
        var v = s && typeof s === 'object' && s['1'] && typeof s['1'] === 'object' ? s['1'] : {};
        return { url: pair(v['3']), key: pair(v['4']), turn: pair(v['5']) };
      }, function () { return { url: '', key: '', turn: '' }; });
    return named = p.then(function (n) {
      n.vapour = !!(n.url && n.key);
      return n;
    });
  }
  function iceServers(n) {
    if (!n.turn) return Promise.resolve(STUN);
    return fetch(n.turn, { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && Array.isArray(d.iceServers) && d.iceServers.length ? STUN.concat(d.iceServers) : STUN; }, function () { return STUN; });
  }

  // ── the wires ──
  /* Every wire takes a message { from, name, to, kind, body, t } to one peer (to its id) or to the room
   * ('*'), and hands each arriving message to the room with the id and name it came from. */

  /* THE BEACH'S LIQUID — liquid:<room>, one slot per player, overwriting. The slot: {_: the pending
   * intention in words, 1: name, 2: the room, 3: now, 6: first staged, 7: the mailbox}. The mailbox at 7 is
   * base64url of { id, name, out: { <peer id>: [{ s, m }] }, seen: { <peer id>: last s taken } }: a message
   * to a peer waits in out until their slot's seen says they took it; a message to the room is sent to every
   * peer standing. A blank slot (no 7) is a player gone. */
  function BeachWire(self, liquidName, deliver) {
    var w = this;
    w.kind = 'beach';
    var slot = '', first = '', seq = 0, out = {}, seen = {}, known = {}, timer = 0, flushTimer = 0, heart = 0, dirty = false, stopped = false, writing = null;
    function blob() { return b64(JSON.stringify({ v: 1, id: self.id, name: self.name, out: out, seen: seen })); }
    function line() {
      var others = Object.keys(known).map(function (k) { return known[k].name; }).filter(Boolean);
      return self.name + ' is in the room' + (others.length ? ', reaching ' + others.slice(0, 6).join(', ') : '') + ' — the room plug, button/room.js';
    }
    function entry(blank) {
      var e = { _: blank ? '' : line(), 1: self.name, 2: liquidName.replace(/^liquid:/, ''), 3: now().toISOString() };
      if (!blank) { if (first) e['6'] = first; e['7'] = blob(); }
      return e;
    }
    function write(blank) {
      if (writing) return writing.then(function () { return write(blank); });
      dirty = false;
      var e = entry(blank);
      if (!first) first = e['3'];
      if (!e['6'] && !blank) e['6'] = first;
      return writing = (slot ? post({ block: liquidName, spindle: slot, content: e }) : post({ block: liquidName, append: true, content: e })).then(function (r) {
        writing = null;
        if (r.ok && !slot && r.slot != null) slot = String(r.slot);
        if (!r.ok && slot && r.status === 404) { slot = ''; return write(blank); }
        return r;
      }, function (e) { writing = null; throw e; });
    }
    function slots(block) {
      var found = [];
      (function walk(node, path) {
        if (!node || typeof node !== 'object') return;
        Object.keys(node).forEach(function (k) {
          if (!/^[1-9]$/.test(k) && k !== '_') return;
          var s = node[k], at = path + (k === '_' ? '0' : k);
          if (s && typeof s === 'object' && typeof s['1'] === 'string' && typeof s['3'] === 'string') found.push({ slot: at.replace(/^0+/, ''), entry: s });
          else if (s && typeof s === 'object') walk(s, at);
        });
      })(block, '');
      return found;
    }
    function poll() {
      if (stopped) return Promise.resolve();
      return read(liquidName).then(function (block) {
        var t = now().getTime(), live = {};
        slots(block || {}).forEach(function (x) {
          var e = x.entry;
          if (e['1'] === self.name) { if (typeof e['7'] === 'string') { try { if (JSON.parse(unb64(e['7'])).id === self.id) slot = x.slot; } catch (err) {} } return; }
          if (typeof e['7'] !== 'string') return;
          var age = t - Date.parse(e['3']);
          if (!(age < FRESH && age > -FRESH)) return;
          var m; try { m = JSON.parse(unb64(e['7'])); } catch (err) { return; }
          if (!m || m.id === self.id || typeof m.id !== 'string') return;
          live[m.id] = 1;
          if (!known[m.id]) { known[m.id] = { name: clean(e['1']) || m.name, at: t }; deliver({ from: m.id, name: known[m.id].name, to: self.id, kind: 'hello', body: null, t: t }); }
          known[m.id].at = t;
          // what they took of mine is done with
          var took = m.seen && m.seen[self.id] || 0;
          if (out[m.id]) { out[m.id] = out[m.id].filter(function (x) { return x.s > took; }); if (!out[m.id].length) delete out[m.id]; }
          // what they have for me, past what I have taken
          var box = m.out && m.out[self.id] || [], last = seen[m.id] || 0, moved = false;
          box.forEach(function (x) { if (x.s > last) { last = x.s; moved = true; deliver(x.m); } });
          if (moved) { seen[m.id] = last; dirty = true; }
        });
        Object.keys(known).forEach(function (id) {
          if (!live[id] && t - known[id].at > POLL_FAST * 2) { var k = known[id]; delete known[id]; delete out[id]; delete seen[id]; deliver({ from: id, name: k.name, to: self.id, kind: 'bye', body: null, t: t }); }
        });
        if (dirty) flush();
      }).catch(function () {});
    }
    function flush() {
      if (flushTimer || stopped) return;
      flushTimer = setTimeout(function () { flushTimer = 0; write(false); }, 150);
    }
    function loop() {
      if (stopped) return;
      poll().then(function () { if (!stopped) timer = setTimeout(loop, w.fast ? POLL_FAST : POLL_SLOW); });
    }
    w.fast = true; w.pingEvery = 6000;
    w.start = function () {
      return read(liquidName).then(function (block) {
        slots(block || {}).forEach(function (x) { if (x.entry['1'] === self.name && !slot) slot = x.slot; });
        return write(false);
      }).then(function (r) {
        if (!r.ok) throw new Error('the room\'s liquid would not take a slot: ' + (r.error || r.status));
        loop();
        heart = setInterval(function () { if (!stopped && !document.hidden) write(false); }, HEART);
        return w;
      });
    };
    w.send = function (to, msg) {
      var ids = to === '*' ? Object.keys(known) : [to];
      ids.forEach(function (id) { (out[id] = out[id] || []).push({ s: ++seq, m: msg }); if (out[id].length > 60) out[id] = out[id].slice(-60); });
      if (ids.length) flush();
    };
    w.stop = function () {
      stopped = true; clearTimeout(timer); clearTimeout(flushTimer); clearInterval(heart);
      return (writing || Promise.resolve()).then(function () { return slot ? post({ block: liquidName, spindle: slot, content: entry(true) }) : null; }).catch(function () {});
    };
  }

  /* THE VAPOUR — the realtime the beach names, spoken in the Phoenix shape over one WebSocket: join the
   * room's topic, a heartbeat every twenty-five seconds, every message a broadcast event 'room' to the topic,
   * taken where it is to this id or to the room. A hello on joining and every ten seconds says who is here;
   * a peer silent for FRESH is gone. */
  function VapourWire(self, n, topic, deliver) {
    var w = this;
    w.kind = 'vapour';
    var ws = null, ref = 0, stopped = false, heart = 0, hello = 0, known = {}, sweep = 0, backoff = 1000, joined = false, queue = [];
    var host = n.url.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/.*$/, '');
    var url = (LOCAL && /^(ws|http):\/\//.test(n.url) ? 'ws://' : 'wss://') + host + '/realtime/v1/websocket?apikey=' + encodeURIComponent(n.key) + '&vsn=1.0.0';
    var TOPIC = 'realtime:' + topic;
    function push(event, payload, top) { if (!ws || ws.readyState !== 1) return false; ws.send(JSON.stringify({ topic: top || TOPIC, event: event, payload: payload, ref: String(++ref) })); return true; }
    function say(msg) { if (!joined) { queue.push(msg); return; } push('broadcast', { type: 'broadcast', event: 'room', payload: msg }); }
    function greet() { say({ from: self.id, name: self.name, to: '*', kind: 'hello', body: null, t: Date.now() }); }
    function open() {
      if (stopped) return;
      try { ws = new WebSocket(url); } catch (e) { return retry(); }
      ws.onopen = function () {
        backoff = 1000;
        push('phx_join', { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [] }, access_token: n.key });
      };
      ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.event === 'phx_reply' && m.topic === TOPIC && m.payload && m.payload.status === 'ok' && !joined) {
          joined = true; greet(); queue.splice(0).forEach(say); return;
        }
        if (m.event === 'phx_error' || m.event === 'phx_close') { joined = false; return; }
        if (m.event !== 'broadcast' || !m.payload || m.payload.event !== 'room') return;
        var msg = m.payload.payload;
        if (!msg || msg.from === self.id || (msg.to !== '*' && msg.to !== self.id)) return;
        var t = Date.now();
        if (!known[msg.from]) { known[msg.from] = { name: clean(msg.name), at: t }; if (msg.kind === 'hello') say({ from: self.id, name: self.name, to: msg.from, kind: 'hello', body: null, t: t }); }
        known[msg.from].at = t;
        if (msg.kind === 'bye') { delete known[msg.from]; }
        deliver(msg);
      };
      ws.onclose = function () { joined = false; retry(); };
      ws.onerror = function () {};
    }
    function retry() { if (stopped) return; setTimeout(open, backoff); backoff = Math.min(backoff * 2, 15000); }
    w.fast = true; w.pingEvery = PING_EVERY;
    w.start = function () {
      return new Promise(function (ok, no) {
        var waited = setTimeout(function () { if (!joined) no(new Error('the vapour the beach names did not answer at ' + host)); }, 8000);
        open();
        var tick = setInterval(function () { if (joined) { clearInterval(tick); clearTimeout(waited); ok(w); } }, 50);
        heart = setInterval(function () { push('heartbeat', {}, 'phoenix'); }, 25000);
        hello = setInterval(greet, HEART);
        sweep = setInterval(function () {
          var t = Date.now();
          Object.keys(known).forEach(function (id) { if (t - known[id].at > FRESH) { var k = known[id]; delete known[id]; deliver({ from: id, name: k.name, to: self.id, kind: 'bye', body: null, t: t }); } });
        }, 5000);
      });
    };
    w.send = function (to, msg) { say(msg); };
    w.stop = function () {
      stopped = true; clearInterval(heart); clearInterval(hello); clearInterval(sweep);
      say({ from: self.id, name: self.name, to: '*', kind: 'bye', body: null, t: Date.now() });
      try { if (ws) ws.close(); } catch (e) {}
      return Promise.resolve();
    };
  }

  // ── the room ──
  var self = null, wire = null, peers = {}, handlers = {}, pinger = 0, ice = STUN, DIRECT = true, ROOM = '', joined = null, lastOp = null, hidden = false;
  window.addEventListener('pagehide', function (ev) { if (self && !ev.persisted) { hidden = true; leave(); } });
  window.addEventListener('pageshow', function () { if (hidden && !self && lastOp) { hidden = false; join(lastOp); } });
  function emit(ev, x) { (handlers[ev] || []).slice().forEach(function (f) { try { f(x); } catch (e) {} }); }
  function on(ev, f) { (handlers[ev] = handlers[ev] || []).push(f); return function () { off(ev, f); }; }
  function off(ev, f) { handlers[ev] = (handlers[ev] || []).filter(function (g) { return g !== f; }); }
  function envelope(to, kind, body) { return { from: self.id, name: self.name, to: to, kind: kind, body: body, t: Date.now() }; }

  function peerOf(id, name) {
    if (peers[id]) { if (name && !peers[id].name) peers[id].name = name; return peers[id]; }
    var p = peers[id] = { id: id, name: name || '', pc: null, state: null, events: null, direct: false, status: 'introduced', tries: 0, seen: Date.now(),
      ping: { direct: null, relayed: null, theirs: { direct: null, relayed: null } }, open: {} };
    emit('peer', view(p));
    return p;
  }
  function view(p) { return { id: p.id, name: p.name, direct: p.direct, status: p.status, ping: { direct: p.ping.direct, relayed: p.ping.relayed, theirs: { direct: p.ping.theirs.direct, relayed: p.ping.theirs.relayed } } }; }
  function offers(p) { return self.id < p.id; }

  function gathered(pc) {
    return new Promise(function (ok) {
      if (pc.iceGatheringState === 'complete') return ok();
      var done = false, t = setTimeout(function () { if (!done) { done = true; ok(); } }, GATHER);
      pc.addEventListener('icegatheringstatechange', function () { if (pc.iceGatheringState === 'complete' && !done) { done = true; clearTimeout(t); ok(); } });
    });
  }
  function attach(p, ch) {
    var name = ch.label === 'state' ? 'state' : 'events';
    p[name] = ch;
    ch.onopen = function () { p.open[name] = true; if (p.open.events && !p.direct) { p.direct = true; p.status = 'direct'; emit('direct', view(p)); ping(p, true); } };
    ch.onclose = function () { p.open[name] = false; if (name === 'events' && p.direct) { p.direct = false; p.status = 'relayed'; emit('direct', view(p)); } };
    ch.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      take(p, m, 'direct');
    };
  }
  function connection(p) {
    if (p.pc) { try { p.pc.close(); } catch (e) {} }
    var pc = p.pc = new RTCPeerConnection({ iceServers: ice });
    p.open = {}; p.direct = false;
    pc.ondatachannel = function (ev) { attach(p, ev.channel); };
    pc.onconnectionstatechange = function () {
      if (pc !== p.pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
        if (p.direct) { p.direct = false; p.status = 'relayed'; emit('direct', view(p)); }
        if (pc.connectionState === 'failed' && offers(p) && p.tries < 3 && peers[p.id]) setTimeout(function () { if (peers[p.id] && p.pc === pc) offer(p); }, 3000);
      }
    };
    return pc;
  }
  function offer(p) {
    if (!DIRECT) return;
    p.tries++; p.status = 'connecting';
    var pc = connection(p);
    attach(p, pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }));
    attach(p, pc.createDataChannel('events', { ordered: true }));
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { return gathered(pc); }).then(function () {
      if (pc !== p.pc) return;
      wire.send(p.id, envelope(p.id, 'offer', { sdp: pc.localDescription.sdp, type: pc.localDescription.type, try: p.tries }));
    }).catch(function () {});
  }
  function answer(p, body) {
    if (!DIRECT) { p.status = 'relayed'; wire.send(p.id, envelope(p.id, 'answer', { refused: true, try: body.try })); return; }
    p.status = 'connecting';
    var pc = connection(p);
    pc.setRemoteDescription({ type: 'offer', sdp: body.sdp }).then(function () { return pc.createAnswer(); }).then(function (a) { return pc.setLocalDescription(a); })
      .then(function () { return gathered(pc); }).then(function () {
        if (pc !== p.pc) return;
        wire.send(p.id, envelope(p.id, 'answer', { sdp: pc.localDescription.sdp, type: pc.localDescription.type, try: body.try }));
      }).catch(function () {});
  }

  /* a message arrived, over a channel or the wire */
  function take(p, m, via) {
    p.seen = Date.now();
    if (m.kind === 'ping') {
      var reply = envelope(p.id, 'pong', { t: m.body.t, via: m.body.via, mine: { direct: p.ping.direct, relayed: p.ping.relayed } });
      if (m.body.via === 'direct' && p.events && p.events.readyState === 'open') p.events.send(JSON.stringify(reply)); else wire.send(p.id, reply);
      return;
    }
    if (m.kind === 'pong') {
      var rtt = Date.now() - m.body.t;
      if (m.body.via === 'direct') p.ping.direct = rtt; else p.ping.relayed = rtt;
      if (m.body.mine) { p.ping.theirs.direct = m.body.mine.direct; p.ping.theirs.relayed = m.body.mine.relayed; }
      emit('ping', view(p));
      return;
    }
    if (m.kind === 'relay') { emit('message', { from: p.id, name: p.name, kind: m.body.k, body: m.body.b, via: 'relayed', t: m.t }); return; }
    if (m.kind === 'data') { emit('message', { from: p.id, name: p.name, kind: m.body.k, body: m.body.b, via: via, t: m.t }); return; }
  }
  function arrived(msg) {
    if (!self || !msg || msg.from === self.id) return;
    if (msg.kind === 'bye') { var g = peers[msg.from]; if (!g) return; delete peers[msg.from]; if (g.pc) { try { g.pc.close(); } catch (e) {} } g.status = 'gone'; emit('gone', view(g)); return; }
    var p = peerOf(msg.from, clean(msg.name));
    p.seen = Date.now();
    if (msg.kind === 'hello') { if (!p.pc && offers(p)) offer(p); else if (!p.pc && !offers(p) && !DIRECT) p.status = 'relayed'; return; }
    if (msg.kind === 'offer') { if (!p.pc || !p.direct || (msg.body && msg.body.try > p.tries)) { p.tries = msg.body.try || p.tries; answer(p, msg.body); } return; }
    if (msg.kind === 'answer') {
      if (msg.body && msg.body.refused) { if (p.pc) { try { p.pc.close(); } catch (e) {} } p.pc = null; p.tries = 9; p.status = 'relayed'; emit('direct', view(p)); return; }
      if (p.pc && p.pc.signalingState === 'have-local-offer') p.pc.setRemoteDescription({ type: 'answer', sdp: msg.body.sdp }).catch(function () {});
      return;
    }
    take(p, msg, 'relayed');
  }

  var lastRelayed = {};
  function ping(p, both) {
    if (!self) return;
    if (p.events && p.events.readyState === 'open') { try { p.events.send(JSON.stringify(envelope(p.id, 'ping', { t: Date.now(), via: 'direct' }))); } catch (e) {} }
    if (both || !lastRelayed[p.id] || Date.now() - lastRelayed[p.id] >= wire.pingEvery) { lastRelayed[p.id] = Date.now(); wire.send(p.id, envelope(p.id, 'ping', { t: Date.now(), via: 'relayed' })); }
  }
  function pingAll(both) { Object.keys(peers).forEach(function (id) { ping(peers[id], both === true); }); if (wire) wire.fast = Object.keys(peers).some(function (id) { return !peers[id].direct; }); return Promise.resolve({ ok: true, peers: list() }); }
  function list() { return Object.keys(peers).map(function (id) { return view(peers[id]); }); }

  /* a message to one peer or all: direct where the channel is open, else relayed over the wire */
  function send(kind, body, op) {
    op = op || {};
    if (!self) return 'dropped';
    var ids = op.to ? [op.to] : Object.keys(peers), via = 'dropped';
    ids.forEach(function (id) {
      var p = peers[id]; if (!p) return;
      var ch = op.reliable === false ? (p.state && p.state.readyState === 'open' ? p.state : null) : null;
      if (!ch && p.events && p.events.readyState === 'open') ch = p.events;
      if (ch) { try { ch.send(JSON.stringify(envelope(id, 'data', { k: kind, b: body }))); via = via === 'relayed' ? 'mixed' : 'direct'; return; } catch (e) {} }
      wire.send(id, envelope(id, 'relay', { k: kind, b: body })); via = via === 'direct' ? 'mixed' : 'relayed';
    });
    return via;
  }

  function join(op) {
    op = op || {};
    if (joined) return joined;
    ROOM = roomOf(op.room) || (fieldOf(op.room) ? 'pool:' + fieldOf(op.room) : '') || ROOM_TAG || (GAME ? 'pool:' + GAME : '');
    if (!ROOM) return fail('no room named: data-game="<game>" or data-room="pool:<name>" on the tag, or join({ room })');
    DIRECT = op.direct !== false;
    var name = clean(op.name) || (window.beachVoice && window.beachVoice.name()) || '';
    if (!name) { try { name = sessionStorage.getItem('beach-room:guest') || ''; } catch (e) {} }
    if (!name) { name = 'guest-' + Math.floor(1000 + Math.random() * 9000); try { sessionStorage.setItem('beach-room:guest', name); } catch (e) {} }
    self = { id: rand(10), name: name };
    return joined = naming().then(function (n) {
      return iceServers(n).then(function (servers) {
        ice = servers;
        var host = new URL(ROOT).hostname;
        wire = n.vapour ? new VapourWire(self, n, 'beach-room:' + host + ':' + ROOM, arrived) : new BeachWire(self, 'liquid:' + ROOM, arrived);
        return wire.start();
      }).then(function () {
        pinger = setInterval(pingAll, PING_EVERY);
        lastOp = op;
        return { ok: true, id: self.id, name: self.name, room: ROOM, wire: wire.kind, named: n.vapour, turn: ice.length > STUN.length };
      });
    }).catch(function (e) { joined = null; self = null; return failed(e); });
  }
  function leave() {
    if (!self) return Promise.resolve({ ok: true });
    clearInterval(pinger);
    Object.keys(peers).forEach(function (id) { var p = peers[id]; if (p.pc) { try { p.pc.close(); } catch (e) {} } });
    peers = {};
    var w = wire; wire = null; self = null; joined = null;
    return (w ? w.stop() : Promise.resolve()).then(function () { return { ok: true }; });
  }

  window.beachRoom = {
    join: join, leave: leave, peers: list, send: send, on: on, off: off, ping: pingAll,
    wire: function () { return wire ? { kind: wire.kind } : null; },
    me: function () { return self ? { id: self.id, name: self.name } : null; },
    room: function () { return ROOM; },
    game: GAME, beach: ROOT
  };
})();
