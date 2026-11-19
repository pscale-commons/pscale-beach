/* The plug — a game's side of the beach, in one script tag beside the voice (26 Oct 2026, the arcade's
 * steps 4 and 5; the maker's path at spine:game-arcade 1.1111114, the recipe at ways:arcade).
 *
 *   <script src="https://beach.happyseaurchin.com/button/voice.js"></script>
 *   <script src="https://beach.happyseaurchin.com/button/game.js" data-game="ghost-wire"></script>
 *
 * A game is a family on the beach: spine:<game> (its days or its stops), its law (function:<game>, or
 * game:<game> as Matthew's Arcade keeps it), its room (pool:<game>), and each player's results in their
 * own mirror <game>:<handle> at the spine's own addresses. The board is the fold across the mirrors at one
 * address. Nothing of a game passes through anyone's hands: the maker founds the family under their own
 * key, hosts their page where they like (GitHub Pages works), and adds the two tags. The plug makes:
 *
 *   beachGame.today()                             the day's address on the beach's clock: the first eight
 *                                                 digits of the sundial's ten, then '00' (game:ghost-wire 1)
 *   beachGame.result({ at, line, proof, name })   a run ended: the line (opening with the board's word, 'FINISHED
 *                                                 2.38s') into the player's own mirror at the address, the
 *                                                 proof into the room; a newcomer named and keyed in one tap
 *   beachGame.top({ at, n, verify })              the board: every player's mirror at the address, one cached
 *                                                 read, each player's best, sorted as the law says; verify is
 *                                                 the page's own re-run of a proof, and only what it passes counts
 *   beachGame.room({ n })                         the room's last lines, and beachGame.note({ text, name }) leaves one
 *   beachGame.here()                              who is playing now, where presence stands; beachGame.present(on)
 *                                                 says this player is, while the page is open
 *   beachGame.wave()                              who came when: each player at the moment they first kept a result
 *   beachGame.law()                               the game's law as the plug reads it (board, room, page, briefing)
 *   beachGame.made()                              the name and key the voice made for a newcomer, handed back once
 *
 * and two ready-made elements for a maker who wants no code: <beach-board> and <beach-room>.
 *
 * THE PROOF stands in the room, as Ghost Wire keeps it ({_: the line, 1: '<name>, a visitor', 2: the
 * address, 3: when, 6: who brought them, 7: the proof, 8: which try}; function:arcade 6, game:ghost-wire 4),
 * and the player's line in their mirror names its slot ('… · proof pool:ghost-wire 143'). Why: a said line is
 * capped at 2,000 characters, twelve seconds of a Ghost Wire replay, and a proof is never trusted, only
 * re-run, so where it stands makes no difference to an honest board; the room is open, so a result lands
 * even for a player whose key the browser has not been given; the mirror's digits stay the clock's, with
 * nothing of the plug's beneath a day; and Ghost Wire's own page keeps reading its room exactly as before.
 * The signed claim is the mirror's; the room holds what anyone may check.
 *
 * THE BOARD counts only what it can check: with a verify the page passes, a line whose proof fails is
 * dropped; without one, every line is shown as a claim, and says so (spine:game-arcade 1.13). The law's
 * board line decides the rest: 'board: FINISHED, lowest first, best per player' — the word a result opens
 * with, the order, and whether a player's best or last stands.
 *
 * THE FOLD is one cached read for a crowd where the beach has one (data-fold, or /api/mirrors on
 * happyseaurchin.com for this beach; mirrors.js there), and the beach's own index and mirrors read straight
 * where it has none, so the plug works against any beach: a script served from a builder's own computer may
 * name the beach with data-beach, as the voice does; served by a beach, it talks to that beach alone. */
(function () {
  'use strict';
  if (window.beachGame) return;
  var me = document.currentScript;
  var BASE = new URL('.', (me && me.src) || location.href);
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(BASE.hostname);
  var ROOT = ((LOCAL && me && me.getAttribute('data-beach')) || BASE.origin).replace(/\/+$/, '');
  var BEACH = ROOT + '/.well-known/pscale-beach';
  var FOLD = (me && me.getAttribute('data-fold')) || (ROOT === 'https://beach.happyseaurchin.com' ? 'https://happyseaurchin.com/api/mirrors' : '');
  var GAME = fieldOf(me && me.getAttribute('data-game'));
  var FRESH = 120000;      // presence this old is gone (beach.js here)
  var HELD = 15000;        // a fold or a room read is kept this long on the page

  function fieldOf(f) { f = String(f || '').trim().toLowerCase(); return /^[a-z0-9][a-z0-9-]{0,63}$/.test(f) ? f : ''; }
  function voiceOf(v) { while (v && typeof v === 'object') v = v._; return typeof v === 'string' ? v : ''; }
  function clean(v) { return String(v || '').replace(/[^a-z0-9_\s-]/gi, '').replace(/\s+/g, ' ').trim(); }
  function nameOf(s) { return String(s || '').replace(/,\s*a (visitor|player)\s*$/i, '').trim(); }
  function fail(msg) { return Promise.resolve({ ok: false, error: msg }); }
  function failed(e) { return { ok: false, error: e && e.refused ? e.message : 'the beach could not be reached: ' + ((e && e.message) || e) }; }

  // ── the beach, and its clock ──
  var clock = null;   // the sundial's now as the beach last stamped a reply: { iso, address, at: Date.now() then }
  function stamp(r) {
    var h = r && r.headers && r.headers.get('X-Pscale-Now');
    var p = (h || '').split('|').map(function (x) { return x.trim(); });
    if (p.length === 3 && /^\d{10}$/.test(p[1]) && !isNaN(Date.parse(p[0]))) clock = { iso: p[0], address: p[1], at: Date.now() };
  }
  function read(block, query) {
    var u = BEACH + (block ? '?block=' + encodeURIComponent(block) + (query || '') : '');
    return fetch(u, { cache: 'no-store', headers: { Accept: 'application/json' } }).then(function (r) {
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
          return { ok: r.ok && !(d && d.error), status: r.status, code: d && d.code, error: d && (d.error || d.message), slot: d && d.slot, body: d };
        });
      });
  }
  /* the sundial's day, written full width: year, season, month in season, week band, day in band, '00' */
  function dayAddress(d) {
    var y = d.getUTCFullYear(), m0 = d.getUTCMonth(), dd = d.getUTCDate();
    return String(y) + (Math.floor(m0 / 3) + 1) + (m0 % 3 + 1) + (Math.floor((dd - 1) / 7) + 1) + ((dd - 1) % 7 + 1) + '00';
  }
  /* the day's address: from the beach's own clock where a reply has stamped it, moved on by the time since;
   * the device's clock, in UTC, until one has */
  function today(d) {
    if (d instanceof Date) return dayAddress(d);
    if (clock) {
      if (Date.now() - clock.at < 60000) return clock.address.slice(0, 8) + '00';
      return dayAddress(new Date(Date.parse(clock.iso) + (Date.now() - clock.at)));
    }
    return dayAddress(new Date());
  }
  function now() { return clock ? new Date(Date.parse(clock.iso) + (Date.now() - clock.at)) : new Date(); }

  // ── addresses in a mirror ──
  /* the node an address names: its digits walked from the root, a zero stepping into the underscore, the
   * floor's trailing zeros left off (2026414500 is 2 _ 2 6 4 1 4 5) */
  function nodeAt(tree, addr) {
    var s = String(addr).replace('.', '');
    if (String(addr).indexOf('.') < 0) s = s.replace(/0+$/, '');
    var n = tree;
    s.split('').forEach(function (d) { n = n && typeof n === 'object' ? n[d === '0' ? '_' : d] : undefined; });
    return n;
  }
  function lineAt(tree, addr) { return voiceOf(nodeAt(tree, addr)); }
  /* every line at or beneath an address, each with the digits that reach it, so a week's board gathers its
   * days' lines and a month's its weeks' */
  function linesUnder(tree, addr) {
    var out = [], n = nodeAt(tree, addr);
    (function walk(node, path) {
      if (typeof node === 'string') { if (node.trim()) out.push({ at: path, line: node }); return; }
      if (!node || typeof node !== 'object') return;
      if (typeof node._ === 'string' && node._.trim()) out.push({ at: path, line: node._ });
      else if (node._ && typeof node._ === 'object') walk(node._, path);
      Object.keys(node).forEach(function (k) { if (/^[1-9]$/.test(k)) walk(node[k], path + k); });
    })(n, String(addr).replace('.', '').replace(/0+$/, ''));
    return out;
  }

  // ── the law ──
  var LAW = null;
  /* the game's law, as the plug reads it: function:<game> ('mode: game' at 1), else game:<game> as Matthew's
   * Arcade keeps a law. Lines are found by their opening word wherever they stand: 'board: FINISHED, lowest
   * first, best per player', 'room: pool:<game>', 'page: https://…', 'proof: …'. Where the law names no room
   * the room is pool:<game>; where it names no page, the first address in its words; where it names no board,
   * FINISHED, lowest first, best per player. */
  function parseLaw(block, name) {
    var lines = [];
    (function walk(n) {
      if (typeof n === 'string') { lines.push(n); return; }
      if (!n || typeof n !== 'object') return;
      Object.keys(n).forEach(function (k) { walk(n[k]); });
    })(block);
    function find(word) {
      for (var i = 0; i < lines.length; i++) { var m = new RegExp('^\\s*' + word + '\\s*:\\s*(.+)$', 'i').exec(lines[i]); if (m) return m[1].trim(); }
      return '';
    }
    var b = find('board') || 'FINISHED, lowest first, best per player';
    var word = (/^([A-Za-z][A-Za-z0-9_-]*)/.exec(b) || [, 'FINISHED'])[1].toUpperCase();
    var room = (/^(pool:[a-z0-9][a-z0-9-]*)/i.exec(find('room')) || [, 'pool:' + GAME])[1].toLowerCase();
    var urls = (lines.join(' ').match(/https?:\/\/[^\s'")\]]+/g) || []).map(function (u) { return u.replace(/[;,.]+$/, ''); });
    var page = (/^(https?:\/\/\S+)/.exec(find('page')) || [, urls[0] || ''])[1];
    var mode = find('mode') || '';
    return {
      block: name, mode: mode, game: GAME, room: room, page: page,
      briefing: find('briefing') || voiceOf(block['2']) || '',
      proof: find('proof'),
      board: { line: b, word: word, lowest: !/highest first/i.test(b), best: !/last per player/i.test(b) },
      root: voiceOf(block)
    };
  }
  function law(fresh) {
    if (!GAME) return fail('no game named: the plug\'s tag wants data-game="<game>"');
    if (LAW && !fresh) return LAW;
    return LAW = read('function:' + GAME).then(function (f) {
      if (f && typeof f === 'object') return parseLaw(f, 'function:' + GAME);
      return read('game:' + GAME).then(function (g) {
        if (g && typeof g === 'object') return parseLaw(g, 'game:' + GAME);
        var e = new Error('no law for ' + GAME + ' stands on the beach (neither function:' + GAME + ' nor game:' + GAME + ')'); e.refused = true; throw e;
      });
    }).catch(function (e) { LAW = null; throw e; });
  }

  // ── the voice, which the plug writes through ──
  var loading = null;
  function voice() {
    if (window.beachVoice) return Promise.resolve(window.beachVoice);
    if (!loading) loading = new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = BASE.href + 'voice.js'; s.async = true;
      if (LOCAL && me && me.getAttribute('data-beach')) s.setAttribute('data-beach', me.getAttribute('data-beach'));
      s.onload = function () { window.beachVoice ? ok(window.beachVoice) : no(new Error('the beach\'s voice did not load')); };
      s.onerror = function () { no(new Error('the beach\'s voice did not load')); };
      (document.head || document.documentElement).appendChild(s);
    });
    return loading;
  }

  // ── a result ──
  /* the score in a line: the first number after the board's word ('FINISHED 2.38s' is 2.38; 'CAUGHT 14 bats' is 14) */
  function scoreOf(line, word) {
    var m = new RegExp('^\\s*' + word + '\\b\\s*(-?\\d+(?:\\.\\d+)?)', 'i').exec(line || '');
    return m ? +m[1] : NaN;
  }
  function proofOf(line) { var m = /proof\s+(pool:[a-z0-9][a-z0-9-]*)\s+(\d+)/i.exec(line || ''); return m ? { room: m[1], slot: m[2] } : null; }
  function better(a, b, lowest) { return isNaN(b) || (lowest ? a < b : a > b); }
  /* a run ended. The proof goes into the room first, as Ghost Wire keeps one, and the line into the player's
   * own mirror at the address, naming the proof's slot; a newcomer is named and keyed by the voice in one
   * tap (a typed name is a claim, and a name on the beach is asked its key). Where the law keeps each player's
   * best, a line no better than the one standing leaves it, and only the room grows. Resolves { ok, name,
   * address, slot, said, made } or { ok: false, error }. */
  function result(op) {
    op = op || {};
    var line = String(op.line || '').trim().slice(0, 1600), proof = op.proof == null ? '' : String(op.proof);
    if (!line) return fail('nothing to keep: a result is a line opening with the board\'s word, such as FINISHED 2.38s');
    var address = String(op.at || today()).trim();
    if (!/^[1-9][0-9]*(\.[0-9]+)?$/.test(address)) return fail('not an address: ' + address);
    return Promise.all([law(), voice()]).then(function (got) {
      var L = got[0], V = got[1];
      if (line.toUpperCase().indexOf(L.board.word) !== 0) return { ok: false, error: 'a result opens with the board\'s word, ' + L.board.word + ' (the law says: board: ' + L.board.line + ')' };
      var given = clean(op.name), name = given || V.name();
      return V.enter({ field: GAME, name: name || undefined, intro: op.intro }).then(function (r) {
        if (!r || !r.ok) return r || { ok: false, error: 'the voice did not answer' };
        name = r.name;
        var standing = r.standing ? lineAt(r.mirror, address) : '';
        var was = scoreOf(standing, L.board.word), mine = scoreOf(line, L.board.word);
        var keepLine = !L.board.best || !standing || isNaN(was) || better(mine, was, L.board.lowest);
        var entry = { _: line, 1: name + ', a visitor', 2: address, 3: now().toISOString() };
        if (op.from) entry['6'] = String(op.from).slice(0, 40);
        if (proof) entry['7'] = proof;
        if (op.tries != null && /^\d{1,5}$/.test(String(op.tries))) entry['8'] = String(op.tries);
        return post({ block: L.room, append: true, content: entry }).then(function (w) {
          if (!w.ok) return { ok: false, error: 'the room ' + L.room + ' would not take the run: ' + (w.error || w.status), name: name };
          var slot = w.slot == null ? '' : String(w.slot);
          var out = { ok: true, name: name, address: address, slot: slot, room: L.room, made: !!r.made, born: !!r.born, said: false, standing: standing || '' };
          if (!keepLine) return out;
          var text = line + (slot ? ' · proof ' + L.room + ' ' + slot : '');
          return V.say({ field: GAME, at: address, text: text, name: name }).then(function (s) {
            if (!s || !s.ok) { out.ok = false; out.error = (s && s.error) || 'the line did not land'; out.quiet = !!(s && s.quiet); return out; }
            out.said = true; out.line = text; return out;
          });
        });
      });
    }).catch(failed);
  }

  // ── the fold: every player's mirror, read once for a crowd ──
  var held = { fold: null, at: 0, room: null, roomAt: 0, index: null, indexAt: 0 };
  function index(fresh) {
    if (!fresh && held.index && Date.now() - held.indexAt < HELD) return held.index;
    held.indexAt = Date.now();
    return held.index = read('').then(function (ix) {
      var names = ((ix && ix.blocks) || []).map(function (b) { return typeof b === 'string' ? b : (b && b.name) || ''; });
      return { blocks: names, touched: (ix && ix.touched) || {}, born: (ix && ix.born) || {}, now: ix && ix.now };
    }, function (e) { held.index = null; throw e; });
  }
  /* the family's mirrors, as /api/mirrors answers ({ mirrors: { <handle>: block }, born, touched }): through the
   * fold where the beach has one, else the index and each mirror straight from the beach */
  function fold(fresh) {
    if (!fresh && held.fold && Date.now() - held.at < HELD) return held.fold;
    held.at = Date.now();
    var p = FOLD
      ? fetch(FOLD + '?family=' + encodeURIComponent(GAME), { headers: { Accept: 'application/json' } }).then(function (r) {
        if (!r.ok) throw new Error('the fold answered ' + r.status);
        return r.json();
      }).then(function (d) { return { mirrors: d.mirrors || {}, born: d.born || {}, touched: d.touched || {}, now: d.now, through: FOLD }; })
      : index(fresh).then(function (ix) {
        var mine = ix.blocks.filter(function (n) { return n.indexOf(GAME + ':') === 0 && n.indexOf(':', GAME.length + 1) < 0; });
        var out = { mirrors: {}, born: {}, touched: {}, now: ix.now, through: 'beach' };
        return Promise.all(mine.slice(0, 600).map(function (n) {
          return read(n).then(function (b) {
            if (!b) return;
            var h = n.slice(GAME.length + 1);
            out.mirrors[h] = b; if (ix.born[n]) out.born[h] = ix.born[n]; if (ix.touched[n]) out.touched[h] = ix.touched[n];
          }, function () {});
        })).then(function () { return out; });
      });
    return held.fold = p.catch(function (e) { held.fold = null; throw e; });
  }
  function roomBlock(name, fresh) {
    if (!fresh && held.room && held.roomName === name && Date.now() - held.roomAt < HELD) return held.room;
    held.roomAt = Date.now(); held.roomName = name;
    return held.room = read(name).catch(function (e) { held.room = null; throw e; });
  }
  /* every line of a room with its slot, the digits walked from the root, as /api/board reads them */
  function roomLines(block) {
    var out = [];
    (function walk(node, path) {
      if (!node || typeof node !== 'object') return;
      if (typeof node['1'] === 'string' && typeof node['3'] === 'string' && (typeof node._ === 'string' || typeof node['7'] === 'string')) {
        out.push({ slot: path.replace(/^0+/, '') || '0', entry: node }); return;
      }
      Object.keys(node).forEach(function (k) { if (k === '_' || /^[1-9]$/.test(k)) walk(node[k], path + (k === '_' ? '0' : k)); });
    })(block, '');
    return out;
  }
  /* the board at an address: each player's line there (or their best beneath it), parsed by the law, its proof
   * read from the room and re-run by the page's verify where one is passed. Resolves { ok, at, top, players,
   * checked, through, read } — top is [{ name, line, score, at, proof, checked, when }], sorted as the law says,
   * cut at n (ten); checked is true, false (dropped), or null where nothing could check it. */
  function top(op) {
    op = op || {};
    var address = String(op.at || today()).trim(), n = +op.n > 0 ? +op.n : 10, verify = typeof op.verify === 'function' ? op.verify : null;
    return Promise.all([law(), fold(op.fresh)]).then(function (got) {
      var L = got[0], F = got[1], word = L.board.word;
      var rows = [];
      Object.keys(F.mirrors).forEach(function (h) {
        var cands = linesUnder(F.mirrors[h], address).map(function (x) { return { name: h, line: x.line, at: x.at, score: scoreOf(x.line, word) }; })
          .filter(function (x) { return !isNaN(x.score); });
        if (!cands.length) return;
        var pick = L.board.best ? cands.reduce(function (a, b) { return better(b.score, a.score, L.board.lowest) ? b : a; }) : cands[cands.length - 1];
        pick.proof = proofOf(pick.line); pick.when = F.touched[h] || ''; pick.born = F.born[h] || '';
        rows.push(pick);
      });
      var rooms = {};
      rows.forEach(function (r) { if (r.proof) rooms[r.proof.room] = 1; });
      return Promise.all(Object.keys(rooms).map(function (name) {
        return roomBlock(name, op.fresh).then(function (b) { rooms[name] = b ? roomLines(b) : []; }, function () { rooms[name] = []; });
      })).then(function () {
        rows.forEach(function (r) {
          if (!r.proof) return;
          var hit = (rooms[r.proof.room] || []).filter(function (x) { return x.slot === r.proof.slot; })[0];
          r.proof.text = hit && typeof hit.entry['7'] === 'string' ? hit.entry['7'] : '';
          r.proof.tries = hit ? hit.entry['8'] || '' : '';
        });
        if (!verify) { rows.forEach(function (r) { r.checked = null; }); return rows; }
        return Promise.all(rows.map(function (r) {
          return Promise.resolve().then(function () { return verify({ proof: r.proof ? r.proof.text : '', line: r.line, at: r.at, name: r.name, score: r.score }); })
            .then(function (v) { r.checked = v === true || (v && v.ok === true) ? true : v === null || v === undefined ? null : false; }, function () { r.checked = false; });
        })).then(function () { return rows.filter(function (r) { return r.checked !== false; }); });
      }).then(function (kept) {
        kept.sort(function (a, b) { return (L.board.lowest ? a.score - b.score : b.score - a.score) || String(a.when).localeCompare(String(b.when)); });
        return { ok: true, game: GAME, at: address, top: kept.slice(0, n), players: kept.length, checked: !!verify, through: F.through, read: now().toISOString(), board: L.board };
      });
    }).catch(failed);
  }

  // ── the room ──
  function room(op) {
    op = op || {};
    var n = +op.n > 0 ? +op.n : 20;
    return law().then(function (L) {
      return roomBlock(L.room, op.fresh).then(function (b) {
        var lines = roomLines(b || {}).map(function (x) {
          var e = x.entry;
          return { slot: x.slot, name: nameOf(voiceOf(e['1'])), text: voiceOf(e._), at: voiceOf(e['2']), when: voiceOf(e['3']), proof: typeof e['7'] === 'string' ? e['7'] : '', tries: voiceOf(e['8']), from: voiceOf(e['6']) };
        }).sort(function (a, b) { return String(a.when).localeCompare(String(b.when)); });
        return { ok: true, room: L.room, lines: lines.slice(-n), count: lines.length, purpose: voiceOf(b) };
      });
    }).catch(failed);
  }
  /* a line in the room that carries no run: said about the address at 2 (the day, by default) */
  function note(op) {
    op = op || {};
    var text = String(op.text || '').trim().slice(0, 2000);
    if (!text) return fail('nothing to say');
    return Promise.all([law(), voice()]).then(function (got) {
      var L = got[0], name = clean(op.name) || got[1].name() || '';
      var entry = { _: text, 1: (name || 'a visitor') + (name ? ', a visitor' : ''), 2: String(op.at || today()), 3: now().toISOString() };
      return post({ block: L.room, append: true, content: entry }).then(function (w) {
        if (!w.ok) return { ok: false, error: 'the room would not take the line: ' + (w.error || w.status) };
        held.room = null;
        return { ok: true, room: L.room, slot: w.slot == null ? '' : String(w.slot), name: name };
      });
    }).catch(failed);
  }

  // ── presence: who is playing now ──
  function presenceSlots(node, out, path) {
    out = out || []; path = path || '';
    if (!node || typeof node !== 'object') return out;
    if (node._ && typeof node._ === 'object') presenceSlots(node._, out, path + '0');
    for (var i = 1; i <= 9; i++) {
      var s = node[String(i)];
      if (!s || typeof s !== 'object') continue;
      if (typeof s['1'] === 'string' && typeof s['3'] === 'string') out.push({ slot: (path + i).replace(/^0+/, ''), entry: s });
      else presenceSlots(s, out, path + i);
    }
    return out;
  }
  function here() {
    return Promise.all([law(), read('presence')]).then(function (got) {
      var L = got[0], t = now().getTime(), who = [];
      presenceSlots(got[1]).forEach(function (x) {
        var e = x.entry, age = t - Date.parse(e['3']);
        if (String(e['2'] || '').trim() !== L.room || !(age < FRESH && age > -FRESH)) return;
        var h = clean(e['1']); if (h && who.indexOf(h) < 0) who.push(h);
      });
      return { ok: true, room: L.room, here: who };
    }).catch(failed);
  }
  var beat = 0;
  /* this player is here: one slot in the beach's presence block, overwritten every minute while the page is
   * open and in view, as block-conventions 4.6 keeps presence ({1: handle, 2: where, 3: when}); off, nothing
   * more is written and the slot ages out of the beach's own sweep */
  function present(on) {
    clearInterval(beat); beat = 0;
    if (on === false) return Promise.resolve({ ok: true, present: false });
    function pulse() {
      if (document.hidden) return Promise.resolve({ ok: true, present: false });
      return Promise.all([law(), voice()]).then(function (got) {
        var L = got[0], name = got[1].name();
        if (!name) return { ok: false, error: 'no name to be present as' };
        var entry = { 1: name, 2: L.room, 3: now().toISOString() };
        return read('presence').then(function (b) {
          var mine = presenceSlots(b).filter(function (x) { return x.entry['1'] === name; })[0];
          return mine ? post({ block: 'presence', spindle: mine.slot, content: entry }) : post({ block: 'presence', append: true, content: entry });
        }).then(function (w) { return { ok: !!w.ok, present: !!w.ok, error: w.error }; });
      }).catch(failed);
    }
    beat = setInterval(pulse, 55000);
    return pulse();
  }

  // ── the wave: who came when ──
  /* each player at the moment their mirror was born (their first result), in the order they came; the three
   * parts named as Ghost Wire names them: the tinder before it caught, the spark when people came fastest
   * (the third of the players who came in the shortest span), the flame since. Early is not better, and the
   * wave ranks nobody. */
  function wave(op) {
    return fold(op && op.fresh).then(function (F) {
      var players = Object.keys(F.mirrors).map(function (h) { return { name: h, at: F.born[h] || F.touched[h] || '' }; })
        .filter(function (p) { return p.at; }).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
      var k = Math.max(2, Math.ceil(players.length / 3)), start = 0, span = Infinity;
      for (var i = 0; i + k <= players.length; i++) {
        var s = Date.parse(players[i + k - 1].at) - Date.parse(players[i].at);
        if (s < span) { span = s; start = i; }
      }
      var parts = players.length >= 3
        ? { tinder: players.slice(0, start), spark: players.slice(start, start + k), flame: players.slice(start + k) }
        : { tinder: players, spark: [], flame: [] };
      return { ok: true, game: GAME, players: players, parts: parts, caught: parts.spark.length ? parts.spark[0].at : '', count: players.length };
    }).catch(failed);
  }

  // ── the ready-made elements ──
  var css = '.beach-board,.beach-room{font:inherit;color:inherit}.beach-board ol{margin:0;padding:0;list-style:none;counter-reset:beach-rank}' +
    '.beach-board li{display:grid;grid-template-columns:2ch 1fr auto;gap:10px;align-items:baseline;padding:6px 0;border-top:1px solid currentColor;opacity:.95}' +
    '.beach-board li::before{counter-increment:beach-rank;content:counter(beach-rank);opacity:.6;font-size:.85em}' +
    '.beach-board .who,.beach-room .who{overflow-wrap:anywhere}.beach-board .score{font-variant-numeric:tabular-nums;white-space:nowrap}' +
    '.beach-board p,.beach-room p{margin:6px 0;opacity:.75;font-size:.9em}.beach-room ul{margin:0;padding:0;list-style:none}' +
    '.beach-room li{padding:6px 0;border-top:1px solid currentColor}.beach-room li .when{opacity:.6;font-size:.85em;margin-left:6px}' +
    '.beach-room form{display:grid;gap:6px;margin-top:10px}.beach-room input,.beach-room textarea{font:inherit;padding:6px 8px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit}' +
    '.beach-room button{font:inherit;padding:6px 12px;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;cursor:pointer;justify-self:start}';
  function styled() { if (document.getElementById('beach-game-style')) return; var s = document.createElement('style'); s.id = 'beach-game-style'; s.textContent = css; (document.head || document.documentElement).appendChild(s); }
  function text(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }
  function whenWords(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function every(el, fn, ms) {
    var t = setInterval(function () { if (!document.hidden && el.isConnected) fn(); }, ms);
    el.__stop = function () { clearInterval(t); };
  }
  if (window.customElements && !customElements.get('beach-board')) {
    customElements.define('beach-board', (function () {
      function Board() { return Reflect.construct(HTMLElement, [], Board); }
      Board.prototype = Object.create(HTMLElement.prototype);
      Board.prototype.constructor = Board;
      Board.prototype.connectedCallback = function () {
        styled(); this.classList.add('beach-board');
        var el = this;
        function draw() {
          var verify = el.getAttribute('verify') && typeof window[el.getAttribute('verify')] === 'function' ? window[el.getAttribute('verify')] : null;
          return top({ at: el.getAttribute('at') || undefined, n: +el.getAttribute('n') || 10, verify: verify }).then(function (b) {
            el.textContent = '';
            if (!b.ok) { el.appendChild(text('p', 'none', 'The board can\'t be read just now: ' + b.error)); return; }
            if (!b.top.length) { el.appendChild(text('p', 'none', el.getAttribute('empty') || 'No result at ' + b.at + ' yet: the first is yours to make.')); return; }
            var ol = document.createElement('ol');
            b.top.forEach(function (r) {
              var li = document.createElement('li');
              li.appendChild(text('span', 'who', r.name));
              li.appendChild(text('span', 'score', r.line.replace(/\s*·\s*proof\s+pool:\S+\s+\d+\s*$/i, '')));
              ol.appendChild(li);
            });
            el.appendChild(ol);
            el.appendChild(text('p', 'note', (b.checked ? 'Each player\'s best, every proof re-run here.' : 'Each player\'s best, as their own mirror keeps it: a claim, re-run by nobody on this page.') + ' ' + b.players + (b.players === 1 ? ' player' : ' players') + ' at ' + b.at + '.'));
          });
        }
        draw(); every(el, draw, 30000);
        el.refresh = draw;
      };
      Board.prototype.disconnectedCallback = function () { if (this.__stop) this.__stop(); };
      return Board;
    })());
  }
  if (window.customElements && !customElements.get('beach-room')) {
    customElements.define('beach-room', (function () {
      function Room() { return Reflect.construct(HTMLElement, [], Room); }
      Room.prototype = Object.create(HTMLElement.prototype);
      Room.prototype.constructor = Room;
      Room.prototype.connectedCallback = function () {
        styled(); this.classList.add('beach-room');
        var el = this, list = document.createElement('ul'), form = document.createElement('form'), status = text('p', 'status', '');
        var who = document.createElement('input'), box = document.createElement('textarea'), send = text('button', '', el.getAttribute('send') || 'Leave a line');
        who.placeholder = 'your name'; who.maxLength = 32; box.placeholder = el.getAttribute('placeholder') || 'Say anything about the game'; box.rows = 2; send.type = 'submit';
        form.appendChild(who); form.appendChild(box); form.appendChild(send);
        el.appendChild(list); el.appendChild(form); el.appendChild(status);
        function draw() {
          return room({ n: +el.getAttribute('n') || 5 }).then(function (r) {
            list.textContent = '';
            if (!r.ok) { list.appendChild(text('li', 'none', 'The room can\'t be read just now: ' + r.error)); return; }
            if (!r.lines.length) { list.appendChild(text('li', 'none', el.getAttribute('empty') || 'Nothing said in the room yet.')); return; }
            r.lines.slice().reverse().forEach(function (x) {
              var li = document.createElement('li');
              li.appendChild(text('strong', 'who', x.name || 'a visitor'));
              li.appendChild(document.createTextNode(' ' + (x.text || (x.proof ? 'kept a run' : ''))));
              li.appendChild(text('span', 'when', whenWords(x.when)));
              list.appendChild(li);
            });
          });
        }
        voice().then(function (V) { if (!who.value) who.value = V.name() || ''; }, function () {});
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!box.value.trim()) return;
          send.disabled = true; status.textContent = 'Sending…';
          note({ text: box.value, name: who.value }).then(function (r) {
            status.textContent = r.ok ? 'Thank you. Your line is in the room.' : 'That didn\'t reach the beach: ' + r.error;
            if (r.ok) { box.value = ''; draw(); }
            send.disabled = false;
          });
        });
        draw(); every(el, draw, 30000);
        el.refresh = draw;
      };
      Room.prototype.disconnectedCallback = function () { if (this.__stop) this.__stop(); };
      return Room;
    })());
  }

  window.beachGame = {
    game: GAME, beach: ROOT, fold: FOLD,
    today: today, now: now,
    result: result, top: top, room: room, note: note, here: here, present: present, wave: wave,
    law: function (fresh) { return law(fresh).catch(failed); },
    name: function () { return window.beachVoice ? window.beachVoice.name() : ''; },
    made: function () { return window.beachVoice ? window.beachVoice.made({ field: GAME }) : null; },
    lineAt: lineAt, linesUnder: linesUnder, scoreOf: scoreOf
  };
  // the law is read once at load, which also sets the clock from the beach's stamp, so today() answers from it
  if (GAME) law().catch(function () {});
})();
