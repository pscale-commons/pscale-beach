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
 * listening: its size, a drag, a reply to a request, and the person's name once they have said
 * this page may know it. A passphrase or a key never crosses. The page tells the frame only
 * where it stands: its own address and title.
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
  var AT = 'beach-button:at';   // where the person last left it, on this site — not sensitive

  var params = new URLSearchParams();
  var place = (me.getAttribute('data-place') || '').replace(/^\/+|\/+$/g, '');
  if (place) params.set('place', place);
  // a builder's test: the frame honours these only when it is itself served from this computer,
  // so no page can point a person's passphrase at another beach
  ['beach', 'llm'].forEach(function (k) { var v = me.getAttribute('data-' + k); if (v) params.set(k, v); });

  var frame = null, open = false, ready = false, queue = [], waiting = {}, n = 0;
  var at = { r: 16, b: 16 };
  try { var saved = JSON.parse(localStorage.getItem(AT)); if (saved && saved.r >= 0 && saved.b >= 0) at = saved; } catch (e) {}

  function size() { return SIZES[open ? 'open' : 'shut']; }
  /* anchored by its bottom-right corner, so opening grows up and to the left, and never off-screen */
  function fit() {
    if (!frame) return;
    var s = size(), w = Math.min(s[0], innerWidth), h = Math.min(s[1], innerHeight);
    var r = Math.max(0, Math.min(at.r, innerWidth - w)), b = Math.max(0, Math.min(at.b, innerHeight - h));
    frame.style.width = w + 'px'; frame.style.height = h + 'px';
    frame.style.right = r + 'px'; frame.style.bottom = b + 'px';
  }

  function make() {
    frame = document.createElement('iframe');
    frame.src = BASE.href + 'frame.html' + (params.toString() ? '?' + params : '');
    frame.title = 'beach button';
    frame.allow = 'microphone';               // the ask box's dictation, nothing else
    frame.referrerPolicy = 'origin';          // the button learns which site, never which page
    frame.style.cssText = 'position:fixed;border:0;margin:0;padding:0;z-index:2147483647;background:transparent';
    fit();
    (document.body || document.documentElement).appendChild(frame);
  }

  function hide() {
    if (!frame) return;
    frame.remove(); frame = null; open = false; ready = false;
    Object.keys(waiting).forEach(function (id) { waiting[id]({ ok: false, error: 'the button was put away' }); delete waiting[id]; });
  }

  function send(m) {
    if (frame && ready) frame.contentWindow.postMessage(m, ORIGIN);
    else queue.push(m);
  }

  var drag0 = null;
  addEventListener('message', function (e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== ORIGIN) return;
    var m = e.data || {};
    if (m.type === 'ready') { ready = true; queue.splice(0).forEach(send); where(); }
    else if (m.type === 'size') { open = !!m.open; fit(); }
    else if (m.type === 'drag') {
      if (m.phase === 'start') drag0 = { r: at.r, b: at.b };
      else if (drag0) {
        var s = size();
        at = { r: Math.max(0, Math.min(drag0.r - m.dx, innerWidth - s[0])), b: Math.max(0, Math.min(drag0.b - m.dy, innerHeight - s[1])) };
        fit();
        if (m.phase === 'end') { drag0 = null; try { localStorage.setItem(AT, JSON.stringify(at)); } catch (err) {} }
      }
    }
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
