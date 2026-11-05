// lib/key-guard.js — ported from pscale-commons/bsp-mcp-server src/db.ts refuseKeyInPayload —
// the key guard; re-port, never fork.
//
// THE KEY GUARD: a key is a pointer, never a value (whetstone 9.1). On 2026-10-24 keys were found
// standing in plain text in public blocks, written there mostly by the sessions that had just used
// them, and every one had to be scrubbed and rolled. The router refuses, before anything is sent, a
// payload that carries as a whole word a key the same call presents. This is its twin at the door
// every write reaches (bsp-mcp proposals/2026-10-24-security-in-the-core.md, "the next door"; the
// security schematic's 1.21), so a write through the mirror, the pages, the button, the voice, the
// pocket, the genus kernel or a direct post is held to it as the router's own tools are.
//
// The keys a request presents are its secret, new_lock, passphrase and my_passphrase. A cipher key
// never travels, so it cannot be checked here, which is right: a gray write is sealed before it
// arrives, so a key kept in a vault entry passes. Keys shorter than six characters are not checked
// (they would match ordinary words). It never guesses: it flags only the keys the request presents,
// as a whole word, case and all. The refusal never repeats the key.
//
// One change from the router's: the router throws, and this returns the refusal the handler sends
// ({status, body}, as every refusal of the handler is shaped), or null when the payload passes.

const SECURITY_PAGE = 'https://happyseaurchin.com/beach-security#practice';

export function refuseKeyInPayload(payload, keys) {
  const held = [...new Set((keys || []).filter((k) => typeof k === 'string' && k.length >= 6))];
  if (held.length === 0 || payload == null) return null;
  const words = held.map((k) => new RegExp(`(?<![A-Za-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`));
  // The kernel's blocks are ordered Maps (bsp-mcp src/genus.ts, its #604), walked like any object; a JSON body holds none.
  const carries = (n) =>
    typeof n === 'string' ? words.some((w) => w.test(n))
      : n instanceof Map ? [...n.values()].some(carries)
      : typeof n === 'object' && n !== null ? Object.values(n).some(carries) : false;
  if (!carries(payload)) return null;
  return {
    status: 422,
    body: {
      error:
        'refused at the door, and nothing was written: this write carries its own key in plain words (the secret, ' +
        'new_lock, passphrase or my_passphrase the request presents). A key is a pointer, never a value: name it ' +
        '(whose key, kept where) and never quote it. If the text already stands on the beach, scrub it first; if the ' +
        'key is simply a word the text needs, it is too easy to guess, so change it. Why: ' + SECURITY_PAGE +
        ' · the law: bsp(agent_id="pscale", block="whetstone", spindle="9").',
      code: 'key_in_payload',
    },
  };
}
