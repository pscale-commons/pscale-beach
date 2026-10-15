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
 *
 * THE VAULT (ways:vault). A person's other keys can live sealed at vault:<handle> on this beach,
 * so a key kept there once is found again from any device. When no Anthropic key is typed, this
 * window opens the vault for one — here, never in the frame or the page — with the passphrase (a
 * vault a page founds answers to the passport key) or, where the vault answers to a key of its
 * own, with that. Nothing is sent: the block is read as any reader reads it, and the key that
 * opens it never leaves this window and is never kept. It opens the canary at 9 to prove the key,
 * then ONE entry, the one labelled for the beach's model key ('llm key — anthropic, …'), and
 * nothing else the vault holds.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(location.search);
  var REM = 'beach-button:remembered';
  var nonce = q.get('n') || '';
  var asker = (q.get('for') || 'a page').slice(0, 120);
  // the beach this window belongs to; only a window served from this computer (a builder's test,
  // as the frame allows) may be pointed at another
  var BEACH = ((/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && q.get('beach')) || location.origin).replace(/\/+$/, '');
  var LABEL = /^\s*llm key\s*[—–-]\s*anthropic\b/i;

  var opener = null;
  try {
    if (window.top === window && window.opener && window.opener.location.origin === location.origin) opener = window.opener;
  } catch (e) { opener = null; }   // a page of another origin opened this: refuse
  if (!opener || !nonce) return;

  function say(t) { $('msg').textContent = t || ''; }
  function remembered() { try { return JSON.parse(localStorage.getItem(REM)); } catch (e) { return null; } }
  function remember(person) { try { localStorage.setItem(REM, JSON.stringify(person)); } catch (e) {} }

  var who = document.createElement('b');
  who.textContent = asker;
  $('asker').textContent = '';
  $('asker').append(who, ' would like the beach button to act as you there. Check that the address bar above reads ' + location.host + ' before you type.');

  // vault: 'key' (the key came from the vault), 'empty' (it opened and holds none), or absent
  function hand(person, vault) {
    opener.postMessage({ type: 'beach:unlocked', n: nonce, handle: person.handle, secret: person.secret || '', key: person.key || '', vault: vault || '' }, location.origin);
    window.close();
  }

  /* Opens vault:<handle> with one key, for one thing. Resolves to {state: 'none'} (no vault here),
   * 'shut' (it does not open under this key), 'empty' (it opens and holds no key for the beach),
   * or 'key' with the key. */
  function fromVault(handle, key) {
    var u = BEACH + '/.well-known/pscale-beach?block=' + encodeURIComponent('vault:' + handle) + '&_t=' + Date.now();
    return fetch(u, { cache: 'no-store', referrerPolicy: 'no-referrer' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('the beach answered ' + r.status);
      return r.json();
    }).then(function (block) {
      if (!block || typeof block !== 'object') return { state: 'none' };
      var entry = null;
      Object.keys(block).filter(function (k) { return /^[1-9]$/.test(k); }).sort().forEach(function (k) {
        var e = block[k];
        if (!entry && e && typeof e === 'object' && typeof e._ === 'string' && LABEL.test(e._) && vault.isEnvelope(e['1'])) entry = e['1'];
      });
      var canary = vault.isEnvelope(block['9']) ? block['9'] : null;
      return (canary ? vault.open(canary, key, BEACH) : Promise.resolve('')).then(function (proof) {
        if (proof === null) return { state: 'shut' };
        if (!entry) return { state: canary ? 'empty' : 'none' };
        return vault.open(entry, key, BEACH).then(function (k) { return k ? { state: 'key', key: k.trim() } : { state: 'shut' }; });
      });
    });
  }

  var opening = false;
  function open(person, vkey, rem) {
    opening = true; $('yes').disabled = true;
    say('Opening your vault at vault:' + person.handle + ' — a second or two.');
    return fromVault(person.handle, vkey || person.secret).then(function (r) {
      opening = false; $('yes').disabled = false;
      if (r.state === 'key') {
        // a remembered device keeps the passphrase, never the key (nor a vault's own key): the
        // vault is opened again at each unlock
        if (rem) remember({ handle: person.handle, secret: person.secret, vault: true });
        return hand({ handle: person.handle, secret: person.secret, key: r.key }, 'key');
      }
      if (r.state === 'shut') {
        showForm(); $('h').value = person.handle; $('s').value = person.secret;
        $('vrow').hidden = false; $('v').value = ''; $('v').focus();
        return say(vkey ? 'That key does not open your vault.' : 'Your vault does not open with that passphrase. If it answers to a key of its own, type it below; leave it empty to unlock without a key.');
      }
      if (rem) remember({ handle: person.handle, secret: person.secret });
      hand(person, r.state === 'empty' ? 'empty' : '');
    }).catch(function (err) {
      opening = false; $('yes').disabled = false;
      say('Your vault could not be read (' + err.message + '). Unlock with a key typed, or try again.');
    });
  }

  var known = remembered();
  function showForm() { $('known').hidden = true; $('f').hidden = false; $('h').focus(); }
  if (known && known.handle) {
    $('kname').textContent = known.handle;
    $('kname2').textContent = known.handle;
    $('known').hidden = false;
    $('wipe').hidden = false;
  } else showForm();

  $('useknown').onclick = function () {
    if (known.vault && !known.key && known.secret) return open(known, '', false);
    hand(known);
  };
  $('other').onclick = showForm;
  $('no').onclick = function () { window.close(); };
  $('wipe').onclick = function () {
    try { localStorage.removeItem(REM); } catch (e) {}
    known = null; $('wipe').hidden = true; showForm();
    say('This device remembers no one now.');
  };
  $('f').addEventListener('submit', function (e) {
    e.preventDefault();
    if (opening) return;
    var handle = $('h').value.trim();
    if (!/^[^\s:/?#]{1,64}$/.test(handle)) return say('A handle has no spaces, colons or slashes.');
    var person = { handle: handle, secret: $('s').value, key: $('k').value.trim() };
    var vkey = $('vrow').hidden ? '' : $('v').value;
    var rem = $('rem').checked;
    // a key typed is used as typed; with nothing to open the vault with, or the vault's own key
    // left empty when asked for, the button is unlocked without one
    if (person.key || !(person.secret || vkey) || (!$('vrow').hidden && !vkey)) {
      if (rem) remember(person);
      return hand(person);
    }
    open(person, vkey, rem);
  });
})();
