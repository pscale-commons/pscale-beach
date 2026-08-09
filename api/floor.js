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

// Zero-slot dues — which container underscores are owed a summary, and unpaid.
//
// The law (block-conventions:3.5, shell-genome:1): zero-carrying numbers are
// summary slots and never entries, N0 is container N's own address by
// trailing-zero canonicalisation, and the voicing is +0 INDUCTIVE — N0 voices
// the PREVIOUS completed nine, not the nine nested inside N. So 10 voices 1-9,
// 20 voices 11-19, 110 voices the last pre-wrap leaves 91-99. A due falls the
// moment the NEXT span opens: the tenth entry slots at 11 and 10 becomes owed.
//
// Reported so the debt is visible where it is incurred. It was not, and the
// cost was measurable: ten folds stood unpaid across two accumulators for
// months because nothing ever announced them, and marks reached 82 entries and
// nine unvoiced containers on a board written mostly by people with no LLM in
// the loop. The writer never owes this — canon assigns payment to the
// requesting LLM as service-payment — so an ack that says nothing leaves a
// keyless human's perfectly good append accruing a debt no one can see.
//
// Dues settle oldest first, and the returned list is already in that order.
export function owedSummaries(block) {
  if (block == null || typeof block !== 'object') return [];
  const floor = floorDepth(block);
  if (floor < 2) return [];        // never wrapped — no completed span exists yet
  const prefixLen = floor - 1;
  const span = p => rawWalk(block, p);
  const complete = node =>
    node != null && typeof node === 'object' &&
    Array.from({ length: 9 }, (_, k) => String(k + 1)).every(d => d in node);
  const out = [];
  for (let i = 0; i < 9 ** prefixLen; i++) {
    const container = zeroFreePath(i, prefixLen);
    const node = span(container);
    if (node == null || typeof node !== 'object') continue;   // this span never opened
    // The span this container's underscore voices: the one before it. For the
    // first container that is the pre-wrap era, which supernest moved under the
    // root underscore — reached by the same path with every digit read as `_`.
    const prevPath = i === 0
      ? '_'.repeat(prefixLen)
      : zeroFreePath(i - 1, prefixLen);
    if (!complete(span(prevPath))) continue;                  // nothing due yet
    if (typeof node._ === 'string' && node._.trim() !== '') continue; // already paid
    const p = prevPath.replace(/_/g, '');   // a wrapped era reads at its bare addresses
    out.push({ slot: `${container}0`, over: `${p}1-${p}9` });
  }
  return out;
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
// write, no new mechanism), or lets the tide clear one, or does the thing the
// convention actually asks for and puts a POINTER in the slot with the letter
// itself in a block of their own, where accumulating works.
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
