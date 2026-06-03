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
