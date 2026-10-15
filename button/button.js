/* button.js — the beach button, carried by any page.
 *
 * A page that wants the button adds one line, and may name its place on the beach:
 *
 *   <script src="https://beach.happyseaurchin.com/button/button.js" data-place="w/community-recovery" async></script>
 *
 * This file runs INSIDE the host page, with the host's privileges, so it holds nothing worth
 * taking. It makes one iframe whose page comes from the beach that served this script, and everything a
 * person types — handle, passphrase, API key, a question — is typed there or in the beach's own
 * window, never here. The browser keeps the host out of that frame (the same-origin policy): no
 * script on this page can read its fields, its storage, its keystrokes or what it fetches.
 *
 * What crosses between the two is only what the frame chooses to say, and it says it to anyone
 * listening: its size, a reply to a request, and the person's name once they have said this page
 * may know it. A passphrase or a key never crosses. The page tells the frame only where it stands:
 * its own address and title.
 *
 * It is MOVED BY A GRIP beside it, here on the page, as xstream's construction button is: the
 * circle only opens, and the grip carries the drag with the page's own pointer events. A frame
 * from another origin cannot follow a pointer that leaves it, and moving it under its own pointer
 * fights the browser's guard against frames slid under a finger; a grip on the page has neither
 * problem. The grip holds nothing — it moves a frame the page could always move.
 *
 * The host may ask the button for things (window.beachButton.request). The person decides, in
 * the frame, where the host cannot see or forge the answer.
 */
(function () {
  'use strict';
  if (window.beachButton) return;
  var me = document.currentScript;
  if (!me || !me.src) return;

  var BASE = new URL('.', me.src);
  var ORIGIN = BASE.origin;
  var SIZES = { shut: [64, 64], open: [360, 560] };
  var GRIP = [28, 44], GAP = 6;
  var AT = 'beach-button:at';   // where the person last left it, on this site — not sensitive

  var params = new URLSearchParams();
  var place = (me.getAttribute('data-place') || '').replace(/^\/+|\/+$/g, '');
  if (place) params.set('place', place);
  // a builder's test: the frame honours these only when it is itself served from this computer,
  // so no page can point a person's passphrase at another beach
  ['beach', 'llm'].forEach(function (k) { var v = me.getAttribute('data-' + k); if (v) params.set(k, v); });

  var frame = null, grip = null, open = false, ready = false, queue = [], waiting = {}, n = 0;
  var at = { r: 16, b: 16 };
  try { var saved = JSON.parse(localStorage.getItem(AT)); if (saved && saved.r >= 0 && saved.b >= 0) at = saved; } catch (e) {}

  function size() { return SIZES[open ? 'open' : 'shut']; }
  function shown() { var s = size(); return [Math.min(s[0], innerWidth), Math.min(s[1], innerHeight)]; }
  /* anchored by its bottom-right corner, so opening grows up and to the left, and never off-screen */
  function settle(p) {
    var s = shown();
    return { r: Math.max(0, Math.min(p.r, innerWidth - s[0])), b: Math.max(0, Math.min(p.b, innerHeight - s[1])) };
  }
  function fit() {
    if (!frame) return;
    var s = shown(), p = settle(at);
    frame.style.width = s[0] + 'px'; frame.style.height = s[1] + 'px';
    frame.style.right = p.r + 'px'; frame.style.bottom = p.b + 'px';
    placeGrip(p.r, p.b, s[0], s[1]);
  }
  /* The grip stands beside the frame and never touches it: the frame refuses a yes while anything
   * lies over it, so a grip against its edge, or its shadow, would read as a page covering it. Left
   * of the circle, or right of it at the left edge; beside the open panel's top, or above it where
   * a phone leaves no room at its sides; hidden only where nothing fits. */
  function placeGrip(r, b, w, h) {
    if (!grip) return;
    var gw = GRIP[0] + GAP, gh = GRIP[1], gr = null, gb;
    if (!open) {
      gb = b + 32 - gh / 2;   // level with the circle, which sits 4px in from the frame's corner
      if (r + w + gw <= innerWidth) gr = r + w + GAP; else if (r >= gw) gr = r - gw;
    } else {
      gb = b + h - gh - 8;
      if (r + w + gw <= innerWidth) gr = r + w + GAP;
      else if (r >= gw) gr = r - gw;
      else if (b + h + gh + GAP <= innerHeight) { gr = r + w - GRIP[0]; gb = b + h + GAP; }
    }
    grip.style.display = gr === null ? 'none' : 'block';
    if (gr !== null) { grip.style.right = gr + 'px'; grip.style.bottom = gb + 'px'; }
  }
  function keep() { try { localStorage.setItem(AT, JSON.stringify(at)); } catch (e) {} }

  function makeGrip() {
    grip = document.createElement('div');
    grip.setAttribute('data-beach-button-grip', '');
    grip.style.cssText = 'position:fixed;z-index:2147483647;display:block;width:' + GRIP[0] + 'px;height:' + GRIP[1] +
      'px;margin:0;padding:0;border:0;background:transparent;touch-action:none;cursor:grab;user-select:none;' +
      '-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent';
    var root = grip.attachShadow ? grip.attachShadow({ mode: 'closed' }) : grip;
    root.innerHTML =
      '<style>:host{all:initial}' +
      '.g{box-sizing:border-box;width:' + GRIP[0] + 'px;height:' + GRIP[1] + 'px;border-radius:14px;' +
      'background:#0A2129;border:1px solid rgba(196,219,223,.3);' +
      'color:#82A0A8;display:flex;align-items:center;justify-content:center;outline:none}' +
      '.g:hover,.g:focus-visible{color:#33C2D2}.g:focus-visible{border-color:#33C2D2}' +
      '@media (prefers-color-scheme: light){.g{background:#F3EEE3;border-color:rgba(60,90,99,.24);color:#6B848D}' +
      '.g:hover,.g:focus-visible{color:#0D6B79}.g:focus-visible{border-color:#0D6B79}}</style>' +
      '<div class="g" role="button" tabindex="0" aria-label="move the beach button — drag it, or use the arrow keys" title="drag to move">' +
      '<svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true" fill="currentColor">' +
      '<circle cx="3" cy="3" r="1.6"/><circle cx="9" cy="3" r="1.6"/><circle cx="3" cy="9" r="1.6"/>' +
      '<circle cx="9" cy="9" r="1.6"/><circle cx="3" cy="15" r="1.6"/><circle cx="9" cy="15" r="1.6"/></svg></div>';

    /* the drag, as xstream moves its construction button: where the pointer went from where it
     * pressed, applied once a frame, clamped to the screen, and kept when it lets go */
    var g0 = null, next = null, raf = 0;
    function step() { raf = 0; if (next) { at = settle(next); fit(); } }
    grip.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      g0 = { x: e.clientX, y: e.clientY, r: settle(at).r, b: settle(at).b, id: e.pointerId };
      try { grip.setPointerCapture(e.pointerId); } catch (err) {}
      grip.style.cursor = 'grabbing';
    });
    grip.addEventListener('pointermove', function (e) {
      if (!g0 || e.pointerId !== g0.id) return;
      next = { r: g0.r - (e.clientX - g0.x), b: g0.b - (e.clientY - g0.y) };
      if (!raf) raf = requestAnimationFrame(step);
    });
    function drop(e) {
      if (!g0 || e.pointerId !== g0.id) return;
      g0 = null; grip.style.cursor = 'grab';
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      step(); next = null;
      keep();
    }
    grip.addEventListener('pointerup', drop);
    grip.addEventListener('pointercancel', drop);
    grip.addEventListener('lostpointercapture', drop);
    grip.addEventListener('keydown', function (e) {
      var s = e.shiftKey ? 64 : 16;
      var d = e.key === 'ArrowLeft' ? [s, 0] : e.key === 'ArrowRight' ? [-s, 0] : e.key === 'ArrowUp' ? [0, s] : e.key === 'ArrowDown' ? [0, -s] : null;
      if (!d) return;
      e.preventDefault();
      at = settle({ r: settle(at).r + d[0], b: settle(at).b + d[1] });
      fit(); keep();
    });
    (document.body || document.documentElement).appendChild(grip);
  }

  function make() {
    frame = document.createElement('iframe');
    frame.src = BASE.href + 'frame.html' + (params.toString() ? '?' + params : '');
    frame.title = 'beach button';
    frame.allow = 'microphone';               // the ask box's dictation, nothing else
    frame.referrerPolicy = 'origin';          // the button learns which site, never which page
    frame.style.cssText = 'position:fixed;border:0;margin:0;padding:0;z-index:2147483647;background:transparent';
    (document.body || document.documentElement).appendChild(frame);
    makeGrip();
    fit();
  }

  function hide() {
    if (!frame) return;
    frame.remove(); frame = null; open = false; ready = false;
    if (grip) { grip.remove(); grip = null; }
    Object.keys(waiting).forEach(function (id) { waiting[id]({ ok: false, error: 'the button was put away' }); delete waiting[id]; });
  }

  function send(m) {
    if (frame && ready) frame.contentWindow.postMessage(m, ORIGIN);
    else queue.push(m);
  }

  addEventListener('message', function (e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== ORIGIN) return;
    var m = e.data || {};
    if (m.type === 'ready') { ready = true; queue.splice(0).forEach(send); where(); }
    else if (m.type === 'size') { open = !!m.open; fit(); }
    else if (m.type === 'hide') hide();
    else if (m.type === 'hello') document.dispatchEvent(new CustomEvent('beachbutton:hello', { detail: { handle: m.handle || null } }));
    else if (m.type === 'reply' && waiting[m.id]) { waiting[m.id](m.result || {}); delete waiting[m.id]; }
  });
  addEventListener('resize', fit);

  /* The page says where the button stands — its own address and title, nothing a person typed —
   * so 'this page' means something to the person asking. The frame believes it only within this
   * page's origin, drops its query and fragment, and sends it to the beach only inside a card the
   * person says yes to. */
  function where() { if (frame && ready) send({ type: 'page', href: location.href, title: document.title }); }
  addEventListener('hashchange', where);
  addEventListener('popstate', where);

  window.beachButton = {
    /* Ask the person, through the button, for something only they can give:
     *   { kind: 'who' }  — their handle, if they say this page may know it
     *   { kind: 'write', block, spindle, content }  — a write AS them, to a block named for them,
     *                                                 at this page's place; they see it and say yes
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
