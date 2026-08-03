// floor.js — pure helpers for the floor invariant. No side effects (no redis,
// no env read at import) so the handler AND the one-shot scripts can import them.
//
// THE INVARIANT (sunstone:1.1, 1.51): every stored pscale block has a floor —
// the root carries a `_` whose chain reaches an identity string. A block born
// from a first digit-slot write (marks, presence, liquid, …) must be seeded an
// identity, or it is floor-0: no pscale 0, invisible to floor alignment,
// un-supernestable. See proposals/2026-06-03-block-floor-invariant-and-malformed-repair.md.

// Depth of the underscore chain down to a string. 0 means no floor.
export function floorDepth(block) {
  let node = block;
  let depth = 0;
  while (node && typeof node === 'object' && '_' in node) {
    depth++;
    node = node._;
    if (typeof node === 'string') return depth;
  }
  return depth;
}

// True iff following `_` from the root reaches an identity string. This is the
// well-formedness test: floor-0 (no root `_`) AND no-string-terminus both fail.
export function hasFloor(block) {
  let node = block;
  while (node && typeof node === 'object' && '_' in node) {
    node = node._;
    if (typeof node === 'string') return true;
  }
  return false;
}

// Identity string seeded at a block's root on creation. Convention-aware for the
// common open accumulators; generic otherwise. `origin` is the beach's bare
// domain. The owner may overwrite `_` later — the point is a block is never born
// without one.
export function defaultIdentity(name, origin) {
  const base = String(name).split(':')[0];
  const at = ` at ${origin}.`;
  if (base === 'marks')    return `Marks${at} Open stigmergy — each digit-path slot is one contribution (block-conventions:9).`;
  if (base === 'presence') return `Presence${at} One slot per agent, heartbeat-overwritten (block-conventions:4.6).`;
  if (base === 'liquid')   return `Liquid composition buffer${at} Pre-commit slots (block-conventions:4.5).`;
  return `${name}${at}`;
}

// Repair transform for the one-shot: prepend a `_` identity to a floor-0 block
// without moving any entry. Address-preserving — entries keep their addresses,
// only their pscale label snaps from negative to 0. Idempotent: a block that
// already has a floor is returned unchanged. Returns {changed, block}.
export function repairFloor(name, origin, block) {
  if (block == null || typeof block !== 'object' || Array.isArray(block)) {
    return { changed: false, block };
  }
  if (hasFloor(block)) return { changed: false, block };
  return { changed: true, block: { _: defaultIdentity(name, origin), ...block } };
}

// ── Append-with-supernest — the operational accumulator write ──
//
// Append `content` at the next free zero-free digit-path slot at the current
// floor; when the floor is full, SUPERNEST (wrap {_: old}, raise the floor by 1)
// and land at the first slot of the new floor. This is floor-growth supernest
// (sunstone:1.63) made operational: every entry sits at pscale 0, dated
// addresses absorb across each wrap (1 → 01 → 001 …), and the slot number tracks
// the sequence. Marks, history, pools all grow this way. Server-side and atomic,
// so concurrent appends never race on slot allocation.

// Walk a zero-free digit-path (digits 1-9, no floor padding). undefined if absent.
export function rawWalk(block, path) {
  let node = block;
  for (const ch of String(path)) {
    if (node == null || typeof node !== 'object' || !(ch in node)) return undefined;
    node = node[ch];
  }
  return node;
}

// The i-th (0-based) zero-free path of `length` digits, lex order. length 2 →
// 11,12,…,19,21,…,99 (base-9 over digits 1-9, no zeros — x0 slots are reserved
// for the bracket's underscore summary).
export function zeroFreePath(i, length) {
  let s = '';
  for (let k = 0; k < length; k++) { s = String((i % 9) + 1) + s; i = Math.floor(i / 9); }
  return s;
}

// First free zero-free `floor`-digit slot, or null if the floor is full.
export function nextZeroFreeSlot(block, floor) {
  const total = 9 ** floor;
  for (let i = 0; i < total; i++) {
    const p = zeroFreePath(i, floor);
    if (rawWalk(block, p) === undefined) return p;
  }
  return null;
}

// Set a value at a zero-free path, creating intermediates; a string in the way
// migrates to that node's underscore (subnest-on-growth, mirrors writeAt).
function rawSet(block, path, value) {
  const d = String(path).split('');
  let node = block;
  for (let k = 0; k < d.length - 1; k++) {
    const key = d[k];
    if (typeof node[key] === 'string') node[key] = { _: node[key] };
    else if (node[key] == null || typeof node[key] !== 'object' || Array.isArray(node[key])) node[key] = {};
    node = node[key];
  }
  node[d[d.length - 1]] = value;
}

// Append with supernest-on-rollover. Returns { block, slot, supernested, floor }.
export function appendWithSupernest(name, origin, block, content) {
  if (block == null) block = { _: defaultIdentity(name, origin) };
  else if (!hasFloor(block)) block = repairFloor(name, origin, block).block;
  let floor = floorDepth(block);
  let supernested = false;
  let slot = nextZeroFreeSlot(block, floor);
  if (slot === null) {            // floor full → supernest (wrap, raise floor)
    block = { _: block };
    floor += 1;
    supernested = true;
    slot = nextZeroFreeSlot(block, floor);
  }
  rawSet(block, slot, content);
  return { block, slot, supernested, floor };
}

// ── Node-scoped append — the same law, one node down (ways:grain 5) ──
//
// The root append above grows a BLOCK at its floor; this grows ONE NODE of a
// block beneath that node's own underscore chain. The grain-side conversation
// is the named case: side 2's holder writes at 2.1, then 2.2, onward, and at
// the tenth entry the SIDE supernests — the node wraps {_: the old node
// entire}, its underscore (the side's reach text) riding one level deeper
// untouched — and the ladder continues within (first post-wrap slot 11).
// The block root, siblings, and every other position are byte-untouched;
// nothing ever spills to the root (the 2026-08-02 spill this closes).
//
// `nodeDigits` is a parseSpindle walk ('0' steps into '_'), so the node keeps
// its semantic address across ROOT supernests — the caller re-parses against
// the live floor and this function just walks. The node's own ladder depth is
// its underscore-chain depth (floorDepth applied to the node); a bare
// container with no underscore ladders at depth 1 — same slots, no phantom
// wrap, and never a seeded identity (a node's semantic is its author's).
//
// Returns {slot, supernested, node_floor} on success — slot is the zero-free
// path WITHIN the node; the caller composes the full address. {missing: true}
// when the walk dead-ends; {leaf: true} when the addressed position holds a
// scalar — appending beneath prose would bury it under a wrap it never asked
// for, so the caller refuses instead of auto-wrapping.
export function appendAtNode(block, nodeDigits, content) {
  if (block == null || typeof block !== 'object' || Array.isArray(block)) return { missing: true };
  let parent = null, key = null, node = block;
  for (const d of nodeDigits) {
    const k = d === '0' ? '_' : d;
    if (node == null || typeof node !== 'object' || Array.isArray(node) || !(k in node)) {
      return { missing: true };
    }
    parent = node; key = k; node = node[k];
  }
  if (parent === null) return { missing: true };  // empty walk = the root — that is appendWithSupernest's job
  if (node == null || typeof node !== 'object' || Array.isArray(node)) return { leaf: true };
  let nodeFloor = Math.max(floorDepth(node), 1);
  let supernested = false;
  let slot = nextZeroFreeSlot(node, nodeFloor);
  if (slot === null) {            // node full → supernest THE NODE (wrap, ladder deepens)
    node = { _: node };
    parent[key] = node;
    nodeFloor = Math.max(floorDepth(node), 1);
    supernested = true;
    slot = nextZeroFreeSlot(node, nodeFloor);
  }
  rawSet(node, slot, content);
  return { slot, supernested, node_floor: nodeFloor };
}
