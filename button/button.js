/* button.js — the beach button, carried by any page, and tapped the way xstream's construction
 * button is tapped.
 *
 * A page that wants the button adds one line, and may name its place on the beach:
 *
 *   <script src="https://beach.happyseaurchin.com/button/button.js" data-place="w/community-recovery" async></script>
 *
 * The circle takes three taps, as xstream's does, its icon naming what the next tap does: + opens
 * the prompt (to speak or type), # opens settings, × closes everything. Escape closes it too, and
 * a tap elsewhere on the page leaves settings for the prompt. The circle, the grip that moves it
 * and the edge that widens its window are drawn here, on the page, so a tap lands at once: a
 * frame from another origin inherits the browser's guards (a tap on one that has just moved is
 * dropped), and nothing a person types ever passes through these three. The window they open —
 * the prompt, the reply and settings — is a frame from the beach's own origin. Everything a
 * person types is typed there or in the beach's own window, and the browser keeps this page out
 * of both (the same-origin policy).
 *
 * This file runs INSIDE the host page, with the host's privileges, so it holds nothing worth
 * taking: where the button stands, how wide its window is, and which view is open — all things
 * the page can see anyway. The frame tells it only how tall its view stands, when it needs the
 * person (a request or a proposal to answer), a reply to a request, and the person's name once
 * they have said this site may know it. The page tells the frame where it stands: its own
 * address and title.
 *
 * The window hangs up and to the left of the circle and flips below it where the top of the
 * screen leaves no room. It stays inside what the person can see: when a phone's keyboard takes
 * the bottom of the screen, the circle and its window rise above it.
 *
 * The host may ask the button for things (window.beachButton.request). The person decides, in
 * the frame, where the host cannot see or forge the answer.
 *
 * Both halves come from the beach on every load, so a change here reaches every page that
 * carries the button, and no page ever changes.
 */
(function () {
  'use strict';
  if (window.beachButton) return;
  var me = document.currentScript;
  if (!me || !me.src) return;

  var BASE = new URL('.', me.src);
  var ORIGIN = BASE.origin;
  var EDGE = 8;                        // kept clear of the screen's edges
  var GAP = 10;                        // between the window and anything of ours: the frame refuses a yes
                                       // while anything lies over it, the circle's shadow included
  var CIRCLE = 56, GRIP = [28, 44];
  var DOCK = [GRIP[0] + 4 + CIRCLE, CIRCLE];   // the grip, then the circle, as xstream sets them
  var WIDE = [280, 352, 0.9];          // the window's width: least, first, most as a share of the screen (xstream's)
  var TALL = 560;                      // the window's height at most; past it the reply scrolls
  var HANDLE = 12;                     // the widening edge
  var AT = 'beach-button:at', WIDTH = 'beach-button:width';   // kept on this site; not sensitive

  var params = new URLSearchParams();
  var place = (me.getAttribute('data-place') || '').replace(/^\/+|\/+$/g, '');
  if (place) params.set('place', place);
  // a builder's test: the frame honours these only when it is itself served from this computer,
  // so no page can point a person's passphrase at another beach
  ['beach', 'llm', 'poll'].forEach(function (k) { var v = me.getAttribute('data-' + k); if (v) params.set(k, v); });

  var frame = null, dock = null, circle = null, edge = null;
  var ready = false, queue = [], waiting = {}, n = 0;
  var view = 'closed';                 // closed · prompt · settings
  var marked = false;                  // something new where the person listens, on a site told their name
  var tall = {};                       // each view's own height, as the frame last said it
  var shown = null;                    // the window as last placed
  var at = { r: 16, b: 16 }, wide = WIDE[1];
  try { var a0 = JSON.parse(localStorage.getItem(AT)); if (a0 && a0.r >= 0 && a0.b >= 0) at = { r: +a0.r, b: +a0.b }; } catch (e) {}
  try { var w0 = parseInt(localStorage.getItem(WIDTH), 10); if (w0 >= WIDE[0]) wide = w0; } catch (e) {}

  /* What the person can see, in the coordinates fixed elements are placed in: the visual viewport,
   * which a phone's keyboard shortens. Pinch-zoomed, the whole layout viewport, so the button does
   * not chase every pan. */
  function sight() {
    var W = document.documentElement.clientWidth || innerWidth, H = innerHeight, v = window.visualViewport;
    if (v && v.scale <= 1.01 && v.width > 0 && v.height > 0) {
      return { x: v.offsetLeft, y: v.offsetTop, w: Math.min(v.width, W), h: Math.min(v.height, H) };
    }
    return { x: 0, y: 0, w: W, h: H };
  }
  /* the grip and circle, held by their bottom-right corner, never off what can be seen */
  function settle(p, s) {
    return { r: Math.max(EDGE, Math.min(p.r, s.w - DOCK[0] - EDGE)), b: Math.max(EDGE, Math.min(p.b, s.h - DOCK[1] - EDGE)) };
  }
  function widest(s) { return Math.min(Math.floor(s.w * WIDE[2]), s.w - 2 * EDGE); }

  function fit() {
    if (!dock) return;
    var s = sight(), p = settle(at, s);
    var left = s.x + s.w - p.r - DOCK[0], top = s.y + s.h - p.b - DOCK[1];
    dock.style.left = left + 'px'; dock.style.top = top + 'px';
    hang(s, { left: left + DOCK[0] - CIRCLE, top: top, right: left + DOCK[0], bottom: top + CIRCLE });
  }

  /* xstream's flyout: its right edge flush with the circle's, resting above it, and below it where
   * the top of the screen leaves no room; slid sideways to stay on screen; never over the circle
   * or its grip; shortened, with the reply scrolling, rather than run off what can be seen. */
  function hang(s, c) {
    if (view === 'closed') { frame.style.display = 'none'; edge.style.display = 'none'; shown = null; return; }
    var w = Math.min(Math.max(wide, WIDE[0]), widest(s));
    var want = Math.min(tall[view] || 160, TALL);
    var above = c.top - GAP - (s.y + EDGE), below = (s.y + s.h - EDGE) - (c.bottom + GAP);
    var up = want <= above ? true : want <= below ? false : above >= below;
    var h = Math.max(0, Math.min(want, up ? above : below));
    var top = up ? c.top - GAP - h : c.bottom + GAP;
    var left = Math.max(s.x + EDGE, Math.min(c.right - w, s.x + s.w - EDGE - w));
    frame.style.display = 'block';
    frame.style.left = left + 'px'; frame.style.top = top + 'px';
    frame.style.width = w + 'px'; frame.style.height = h + 'px';
    shown = { left: left, top: top, w: w, h: h };
    // the edge that widens it stands beside its left side, never against it, and only where it
    // fits clear of the screen's own edge (where a phone's back-swipe lives)
    var el = left - GAP - HANDLE;
    if (el < s.x + EDGE) { edge.style.display = 'none'; return; }
    edge.style.display = 'block';
    edge.style.left = el + 'px'; edge.style.top = top + 'px'; edge.style.height = h + 'px';
  }

  /* ── the circle, its icon naming what the next tap does (David, 2026-10-16): + opens the
   * prompt, to speak or type; # opens settings; × closes everything ── */
  var ICON = {
    closed: '<path d="M5 12h14M12 5v14"/>',
    prompt: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    settings: '<path d="M18 6 6 18M6 6l12 12"/>'
  };
  var SAY = { closed: 'open the beach button, to speak or type', prompt: 'the beach button’s settings', settings: 'close the beach button' };
  function paint() {
    if (!circle) return;
    circle.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[view] + '</svg>' +
      (marked ? '<span class="m" aria-hidden="true"></span>' : '');
    circle.setAttribute('aria-label', SAY[view] + (marked ? ' — something new where you listen' : ''));
    circle.setAttribute('aria-expanded', view === 'closed' ? 'false' : 'true');
    dock.setAttribute('data-view', view);
  }
  function setView(v, tapped) {
    if (!frame || v === view) return;
    var had = document.activeElement === frame;
    view = v;
    paint();
    if (ready) frame.contentWindow.postMessage({ type: 'view', view: v }, ORIGIN);
    fit();
    // a tap that opens the prompt gives the window the keys, so a person may type at once and
    // Escape reaches it; a page's request opens it without taking the keys from whatever the
    // person is typing on the page; closed, the keys come back to the circle
    if (v === 'prompt' && tapped) { try { frame.focus(); } catch (e) {} }
    else if (v === 'closed' && had) { try { circle.focus({ preventScroll: true }); } catch (e) {} }
  }
  function cycle() { setView(view === 'closed' ? 'prompt' : view === 'prompt' ? 'settings' : 'closed', true); }

  var STYLE = '<style>:host{all:initial}' +
    '.d{display:flex;align-items:center;gap:4px;width:' + DOCK[0] + 'px;height:' + DOCK[1] + 'px}' +
    '.g{box-sizing:border-box;flex:none;width:' + GRIP[0] + 'px;height:' + GRIP[1] + 'px;border-radius:14px;' +
    'background:#0A2129;border:1px solid rgba(196,219,223,.3);color:#82A0A8;display:flex;align-items:center;' +
    'justify-content:center;outline:none;cursor:grab;touch-action:none}' +
    '.g:hover,.g:focus-visible{color:#33C2D2}.g:focus-visible{border-color:#33C2D2}' +
    '.c{box-sizing:border-box;flex:none;width:' + CIRCLE + 'px;height:' + CIRCLE + 'px;margin:0;padding:0;border-radius:50%;' +
    'border:1px solid rgba(196,219,223,.3);background:#0A2129;color:#33C2D2;display:flex;align-items:center;' +
    'justify-content:center;cursor:pointer;touch-action:manipulation;box-shadow:0 2px 6px rgba(0,0,0,.35);outline:none;' +
    '-webkit-tap-highlight-color:transparent;position:relative}' +
    '.c:focus-visible{border-color:#33C2D2;box-shadow:0 0 0 2px rgba(51,194,210,.4)}' +
    '.m{position:absolute;top:8px;right:8px;width:10px;height:10px;border-radius:50%;background:#E7B24C;box-shadow:0 0 0 2px #0A2129}' +
    '@media (prefers-color-scheme: light){.g{background:#F3EEE3;border-color:rgba(60,90,99,.24);color:#6B848D}' +
    '.g:hover,.g:focus-visible{color:#0D6B79}.g:focus-visible{border-color:#0D6B79}' +
    '.c{background:#F3EEE3;border-color:rgba(60,90,99,.24);color:#0D6B79;box-shadow:0 2px 6px rgba(0,0,0,.18)}' +
    '.c:focus-visible{border-color:#0D6B79;box-shadow:0 0 0 2px rgba(13,107,121,.35)}' +
    '.m{background:#8E6210;box-shadow:0 0 0 2px #F3EEE3}}</style>';
  var DOTS = '<svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true" fill="currentColor">' +
    '<circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/>' +
    '<circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></svg>';

  /* a part drawn on the page, in a closed shadow root: the page's styles cannot reach in, and
   * focusing the part focuses what it holds */
  function part(attr, css) {
    var el = document.createElement('div');
    el.setAttribute(attr, '');
    el.style.cssText = 'position:fixed;z-index:2147483647;margin:0;padding:0;border:0;background:transparent;' +
      'touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;' +
      '-webkit-tap-highlight-color:transparent;' + css;
    var root = el.attachShadow ? el.attachShadow({ mode: 'closed', delegatesFocus: true }) : el;
    return { el: el, root: root };
  }

  /* a drag carried by the page's own pointer events, captured, applied once a frame and kept
   * when it lets go — as xstream moves its construction button */
  function dragging(handle, start, move, end) {
    var g0 = null, next = null, raf = 0;
    function step() { raf = 0; if (next) move(next); }
    handle.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      g0 = start(e);
      if (!g0) return;
      g0.id = e.pointerId;
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    });
    handle.addEventListener('pointermove', function (e) {
      if (!g0 || e.pointerId !== g0.id) return;
      next = { dx: e.clientX - g0.x, dy: e.clientY - g0.y, g0: g0 };
      if (!raf) raf = requestAnimationFrame(step);
    });
    function drop(e) {
      if (!g0 || e.pointerId !== g0.id) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      step(); next = null; g0 = null;
      end();
    }
    handle.addEventListener('pointerup', drop);
    handle.addEventListener('pointercancel', drop);
    handle.addEventListener('lostpointercapture', drop);
  }

  function makeDock() {
    var d = part('data-beach-button-dock', 'display:block;width:' + DOCK[0] + 'px;height:' + DOCK[1] + 'px');
    dock = d.el;
    d.root.innerHTML = STYLE + '<div class="d">' +
      '<div class="g" role="button" tabindex="0" aria-label="move the beach button — drag it, or use the arrow keys" title="drag to move">' + DOTS + '</div>' +
      '<button class="c" type="button"></button></div>';
    var g = d.root.querySelector('.g');
    circle = d.root.querySelector('.c');
    circle.addEventListener('click', cycle);
    dragging(g, function (e) {
      var p = settle(at, sight());
      g.style.cursor = 'grabbing';
      return { x: e.clientX, y: e.clientY, r: p.r, b: p.b };
    }, function (m) {
      at = settle({ r: m.g0.r - m.dx, b: m.g0.b - m.dy }, sight()); fit();
    }, function () { g.style.cursor = ''; keepAt(); });
    // the arrow keys move it from the grip or the circle, whichever holds the keys
    d.root.querySelector('.d').addEventListener('keydown', function (e) {
      var s = e.shiftKey ? 64 : 16;
      var k = e.key === 'ArrowLeft' ? [s, 0] : e.key === 'ArrowRight' ? [-s, 0] : e.key === 'ArrowUp' ? [0, s] : e.key === 'ArrowDown' ? [0, -s] : null;
      if (!k) return;
      e.preventDefault();
      var v = sight(), p = settle(at, v);
      at = settle({ r: p.r + k[0], b: p.b + k[1] }, v);
      fit(); keepAt();
    });
    (document.body || document.documentElement).appendChild(dock);
  }

  /* the window's left side, which widens it as xstream's panel widens: drag left to grow */
  function makeEdge() {
    var d = part('data-beach-button-edge', 'display:none;width:' + HANDLE + 'px;cursor:ew-resize');
    edge = d.el;
    d.root.innerHTML = '<style>:host{all:initial}' +
      '.e{box-sizing:border-box;width:' + HANDLE + 'px;height:100%;display:flex;align-items:center;justify-content:center;' +
      'outline:none;cursor:ew-resize;touch-action:none}' +
      '.e i{display:block;width:4px;height:40px;max-height:70%;border-radius:2px;background:rgba(196,219,223,.35)}' +
      '.e:hover i,.e:focus-visible i{background:#33C2D2}' +
      '@media (prefers-color-scheme: light){.e i{background:rgba(60,90,99,.35)}.e:hover i,.e:focus-visible i{background:#0D6B79}}</style>' +
      '<div class="e" role="separator" aria-orientation="vertical" tabindex="0" ' +
      'aria-label="widen the beach button’s window — drag it, or use the arrow keys" title="drag to widen"><i></i></div>';
    var e0 = d.root.querySelector('.e');
    function to(w) { wide = Math.max(WIDE[0], Math.min(w, widest(sight()))); fit(); }
    dragging(e0, function (e) {
      return shown ? { x: e.clientX, y: e.clientY, w: shown.w } : null;
    }, function (m) { to(m.g0.w - m.dx); }, keepWidth);
    e0.addEventListener('keydown', function (e) {
      var s = e.shiftKey ? 64 : 16;
      var k = e.key === 'ArrowLeft' ? s : e.key === 'ArrowRight' ? -s : 0;
      if (!k || !shown) return;
      e.preventDefault();
      to(shown.w + k); keepWidth();
    });
    (document.body || document.documentElement).appendChild(edge);
  }

  function keepAt() { try { localStorage.setItem(AT, JSON.stringify(at)); } catch (e) {} }
  function keepWidth() { try { localStorage.setItem(WIDTH, String(wide)); } catch (e) {} }

  function make() {
    frame = document.createElement('iframe');
    frame.src = BASE.href + 'frame.html' + (params.toString() ? '?' + params : '');
    frame.title = 'beach button';
    frame.allow = 'microphone';               // the prompt's dictation, nothing else
    frame.referrerPolicy = 'origin';          // the button learns which site, never which page
    frame.style.cssText = 'position:fixed;display:none;border:0;margin:0;padding:0;z-index:2147483647;background:transparent';
    view = 'closed'; ready = false; tall = {}; marked = false;
    (document.body || document.documentElement).appendChild(frame);
    makeDock(); makeEdge();
    paint(); fit();
  }

  function hide() {
    if (!frame) return;
    frame.remove(); dock.remove(); edge.remove();
    frame = dock = circle = edge = null;
    view = 'closed'; ready = false; queue = []; shown = null;
    Object.keys(waiting).forEach(function (id) { waiting[id]({ ok: false, error: 'the button was put away' }); delete waiting[id]; });
  }

  function send(m) {
    if (frame && ready) frame.contentWindow.postMessage(m, ORIGIN);
    else queue.push(m);
  }

  addEventListener('message', function (e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== ORIGIN) return;
    var m = e.data || {};
    if (m.type === 'ready') {
      ready = true;
      frame.contentWindow.postMessage({ type: 'view', view: view }, ORIGIN);
      queue.splice(0).forEach(send); where();
    }
    else if (m.type === 'height') {
      if ((m.view === 'prompt' || m.view === 'settings') && typeof m.h === 'number' && m.h > 0 && m.h < 4000) { tall[m.view] = Math.ceil(m.h); fit(); }
    }
    else if (m.type === 'open') setView('prompt');       // a request or a proposal waits for the person
    else if (m.type === 'close') setView('closed');      // Escape, pressed in the window
    else if (m.type === 'hide') hide();
    else if (m.type === 'mark') { var v = typeof m.n === 'number' && m.n > 0; if (v !== marked) { marked = v; paint(); } }
    else if (m.type === 'hello') document.dispatchEvent(new CustomEvent('beachbutton:hello', { detail: { handle: m.handle || null } }));
    else if (m.type === 'reply' && waiting[m.id]) { waiting[m.id](m.result || {}); delete waiting[m.id]; }
    // anything else is from a newer or older window than this page part, and is let pass
  });
  addEventListener('resize', fit);
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', fit);
    visualViewport.addEventListener('scroll', fit);
  }
  /* a tap elsewhere on the page leaves settings for the prompt, as xstream's menu does; a tap in
   * the window never reaches this page at all */
  document.addEventListener('pointerdown', function (e) {
    if (view === 'settings' && e.target !== dock && e.target !== edge && e.target !== frame) setView('prompt');
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && view !== 'closed' && (document.activeElement === dock || document.activeElement === edge)) setView('closed');
  });

  /* The page says where the button stands — its own address and title, nothing a person typed —
   * so 'this page' means something to the person asking. The frame believes it only within this
   * page's origin, drops its query and fragment, and sends it to the beach only inside a card the
   * person commits. */
  function where() { if (frame && ready) send({ type: 'page', href: location.href, title: document.title }); }
  addEventListener('hashchange', where);
  addEventListener('popstate', where);

  window.beachButton = {
    /* Ask the person, through the button, for something only they can give:
     *   { kind: 'who' }  — their handle, if they say this page may know it
     *   { kind: 'write', block, spindle, content }  — a write AS them, to a block named for them,
     *                                                 at this page's place; they see it and commit it
     * Resolves to { ok, ... }. Nothing the person types ever comes back. */
    request: function (op) {
      return new Promise(function (resolve) {
        if (!frame) return resolve({ ok: false, error: 'the button is put away' });
        var id = 'r' + (++n);
        waiting[id] = resolve;
        send({ type: 'request', id: id, op: op });
      });
    },
    show: function () { if (!frame) make(); },
    hide: hide
  };

  if (document.body) make(); else addEventListener('DOMContentLoaded', make);
})();
