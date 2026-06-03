// floor.js — pure helpers for the floor invariant. No side effects (no redis,
// no env read at import) so the handler AND the one-shot scripts can import them.
//
// THE INVARIANT (sunstone:1.1, 1.51): every stored pscale block has a floor —
// the root carries a `_` whose chain reaches an identity string. A block born
// from a first digit-slot write (marks, presence, liquid, …) must be seeded an
// identity, or it is floor-0: no pscale 0, invisible to floor alignment,
// un-supernestable. See proposals/2026-06-03-block-floor-invariant-and-malformed-repair.md
// in bsp-mcp-server.

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
