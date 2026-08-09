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

// ── Node-scoped append — NINE SLOTS, and no wrap (ways:grain 5) ──
//
// The root append above grows a BLOCK, and grows it correctly, because a root
// supernest raises the FLOOR: every address re-pads at once, entries stay peers
// at pscale 0, and detail written beneath an entry travels with it.
//
// A node cannot do that. Floor is one per block, derived from the root's
// underscore chain, so wrapping a node gives it a private depth the block never
// records — and an address below that node stops being a number and becomes a
// path only its own history can parse. This function used to wrap anyway. Three
// things followed, all observed live: citations rotted silently (2.5 walked
// nowhere while 2.05 held the message); 2.11 became ambiguous between "entry 11"
// and "detail 1 of entry 1", with no record of which; and the node deepened by
// one every nine entries, forever, which is archive behaviour on a surface whose
// whole point is what is happening NOW.
//
// So: A DIGIT POSITION HOLDS NINE, and does not grow. Accumulation belongs at a
// block root, where the floor can absorb it. A full node REFUSES, and the
// refusal is the useful moment — the writer overwrites a slot (an ordinary
// write, no new mechanism), or does the thing the convention actually asks for
// and puts a POINTER in the slot with the letter itself in a block of their
// own, where accumulating works.
//
// NOT an option, though the tide block reads as though it were: nothing on this
// substrate expires by itself. The age-based tide is specified there and has
// never been implemented — no sweeper in this package or in any operator clone,
// no age values set, nothing scheduling one. Freeing a slot is always somebody
// choosing which one goes. (Corrected 2026-08-09: this comment and the refusal
// it describes both offered a tide that does not exist.)
//
// `nodeDigits` is a parseSpindle walk ('0' steps into '_'), so the node keeps
// its semantic address across ROOT supernests — the caller re-parses against the
// live floor and this function just walks.
//
// Returns {slot, node_floor} on success — slot is the zero-free path WITHIN the
// node; the caller composes the full address. {missing: true} when the walk
// dead-ends; {leaf: true} when the addressed position holds a scalar; and
// {full: true, slots, oldest} when all nine are taken.
export function appendAtNode(block, nodeDigits, content) {
  if (block == null || typeof block !== 'object' || Array.isArray(block)) return { missing: true };
  let parent = null, node = block;
  for (const d of nodeDigits) {
    const k = d === '0' ? '_' : d;
    if (node == null || typeof node !== 'object' || Array.isArray(node) || !(k in node)) {
      return { missing: true };
    }
    parent = node; node = node[k];
  }
  if (parent === null) return { missing: true };  // empty walk = the root — that is appendWithSupernest's job
  if (node == null || typeof node !== 'object' || Array.isArray(node)) return { leaf: true };
  const slot = nextZeroFreeSlot(node, 1);
  if (slot === null) return { full: true, ...nodeOccupancy(node) };
  rawSet(node, slot, content);
  return { slot, node_floor: 1 };
}

// Who is sitting in the nine, and which of them has been there longest. The age
// comes from the entry's own position 3 (block-conventions:9, stamped on append
// for object entries); a slot holding bare prose carries no date, so `oldest` is
// only reported when it can be known rather than guessed at from slot order —
// after one overwrite, slot order says nothing about age.
export function nodeOccupancy(node) {
  const slots = [];
  for (let d = 1; d <= 9; d++) {
    const v = node[String(d)];
    if (v === undefined) continue;
    const ts = v && typeof v === 'object' && typeof v['3'] === 'string' ? v['3'] : null;
    slots.push({ slot: String(d), ts });
  }
  const dated = slots.filter((s) => s.ts).sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return { slots, oldest: dated.length === slots.length && dated.length ? dated[0] : null };
}
