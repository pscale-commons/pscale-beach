/* unlock.js — the beach's own window, where a person's words are typed.
 *
 * Opened by the button's frame, top-level, so its address bar shows whose window it is and the
 * person's password manager fills it only here. It hands what was typed to the frame that opened
 * it — and to nothing else: the message is addressed to this origin, so a page that opened this
 * window itself, hoping to catch the answer, receives nothing (and is refused before anything is
 * typed). What "remember on this device" keeps stays in this origin's own storage, which no page
 * carrying the button can reach; any site's button can then be unlocked with one tap.
 *
 * The words are not tried here. The beach has no act that proves a passphrase without writing:
 * the only proof, latching the passport again with the same words, would claim a passport that
 * stands open. So the first real write proves them, and says so if they are wrong.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(location.search);
  var REM = 'beach-button:remembered';
  var nonce = q.get('n') || '';
  var asker = (q.get('for') || 'a page').slice(0, 120);

  var opener = null;
  try {
    if (window.top === window && window.opener && window.opener.location.origin === location.origin) opener = window.opener;
  } catch (e) { opener = null; }   // a page of another origin opened this: refuse
  if (!opener || !nonce) return;

  function say(t) { $('msg').textContent = t || ''; }
  /* REMEMBERED ON THIS DEVICE, NEVER PLAIN (coloured stigmergy step 4; Matthew's condition at 1.18): the person this device
   * remembers is wrapped under a key the browser will not hand out (seal.js keep) before it goes to this origin's storage;
   * one remembered plain before this is read once and wrapped from then on; where the browser offers no such key, nobody
   * is remembered and the words are typed each time. */
  var S = window.beachSeal || null;
  function parse(t) { try { return JSON.parse(t) || null; } catch (e) { return null; } }
  function recall() {
    var v = null;
    try { v = localStorage.getItem(REM); } catch (e) { v = null; }
    if (!v) return Promise.resolve(null);
    if (S && S.keep.wrapped(v)) return S.keep.unwrap(v).then(parse, function () { return null; });
    var p = parse(v);
    if (p) remember(p);
    return Promise.resolve(p);
  }
  function remember(person) {
    if (!S || !S.keep.able()) { try { localStorage.removeItem(REM); } catch (e) {} return Promise.resolve(false); }
    return S.keep.wrap(JSON.stringify(person)).then(function (w) { try { localStorage.setItem(REM, w); } catch (e) {} return true; }, function () { try { localStorage.removeItem(REM); } catch (e) {} return false; });
  }

  var who = document.createElement('b');
  who.textContent = asker;
  $('asker').textContent = '';
  $('asker').append(who, ' would like the beach button to act as you there. Check that the address bar above reads ' + location.host + ' before you type.');

  function hand(person) {
    opener.postMessage({ type: 'beach:unlocked', n: nonce, handle: person.handle, secret: person.secret || '', key: person.key || '' }, location.origin);
    window.close();
  }

  var known = null;
  function showForm() { $('known').hidden = true; $('f').hidden = false; $('h').focus(); }
  recall().then(function (k) {
    known = k;
    if (known && known.handle) {
      $('kname').textContent = known.handle;
      $('kname2').textContent = known.handle;
      $('known').hidden = false;
      $('wipe').hidden = false;
    } else showForm();
  });

  $('useknown').onclick = function () { hand(known); };
  $('other').onclick = showForm;
  $('no').onclick = function () { window.close(); };
  $('wipe').onclick = function () {
    try { localStorage.removeItem(REM); } catch (e) {}
    known = null; $('wipe').hidden = true; showForm();
    say('This device remembers no one now.');
  };
  $('f').addEventListener('submit', function (e) {
    e.preventDefault();
    var handle = $('h').value.trim();
    if (!/^[^\s:/?#]{1,64}$/.test(handle)) return say('A handle has no spaces, colons or slashes.');
    var person = { handle: handle, secret: $('s').value, key: $('k').value.trim() };
    ($('rem').checked ? remember(person) : Promise.resolve(false)).then(function () { hand(person); });
  });
})();
