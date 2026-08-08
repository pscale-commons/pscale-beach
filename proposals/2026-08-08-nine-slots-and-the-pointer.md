# Nine slots and the pointer — a digit position stops pretending to be an accumulator

**Date**: 2026-08-08
**Status**: adopted (design chosen by David 2026-08-08; code in this PR, `ways:grain:5` re-voiced with `archive:ways:grain:2026-08-08` taken first)
**Supersedes**: the node-supernest added 2026-08-06 (#54), live for two days

## The fault

A root append grows a block correctly, because a root supernest raises the
**floor**: every address re-pads at once, entries stay peers at pscale 0, and
detail written beneath an entry travels with it.

A node cannot do that. Floor is one per block, derived from the root's underscore
chain. So wrapping a node gives it a **private depth the block never records**,
and an address below that node stops being a number and becomes a path only its
own history can parse — which is the one thing sunstone:1.5 says an address is
not.

Three consequences, all observed live on `grain:3b5aba1f7b962a67`:

1. **Citations rot silently.** `2.5` walks nowhere; `2.05` holds the message.
   Prose already standing in that grain cites `2.5` and `2.6` into the void.
2. **Addresses turn ambiguous.** `2.11` is either entry eleven or detail one of
   entry one, and nothing records which. Seen manifest in `lanes:weft`, where
   field-shaped content (`weft.o-pages`, `spine:views`) sits at entry addresses.
3. **Depth grows without end** — one level per nine entries. That is archive
   behaviour on a surface whose purpose is what is happening *now*.

David's diagnosis, which is the sharp form: *subnesting isn't supernesting.*
`1.10` and `1.11` are nested **under** `1.1`; they are not its peers, however the
accumulator chooses to read them.

## Options weighed

- **Super-subnesting** (`1.1`-`1.9` fold to `1.11`-`1.19`, then `1.21`; `1.99` to
  `1.199`). **Rejected.** It formalises the private floor, so a block would carry
  a second floor its address cannot express, and it churns *every* existing
  address on each rollover — citations would rot on a schedule rather than once.
- **Tidal clean alone.** Right mechanism, one flaw: a recycled slot means "see
  2.3" silently resolves to a different message later. A broken citation
  announces itself; a rotated one does not.
- **Nine slots holding pointers.** Fixes the flaw, because the citation targets
  the letter block, not the slot. Already law at `ways:grain:6` (THE LETTER),
  written for fidelity — it happens to solve accumulation too, since a letter
  block is an ordinary root-level block where supernest works.

**Adopted: pointers + tide.** And the general law they rest on: *accumulate only
at a block root; a digit position holds nine and is for semantics.* Every
accumulator that works here — marks, history, daily, pools, lanes — is a block
root. The grain side was the only one hung under a digit, and the only one that
broke. `appendAtNode` was built for that single case.

## What this PR does

`appendAtNode` no longer wraps. A node's counting line is nine, fixed. When all
nine are taken it returns `{full, slots, oldest}` and the handler answers **409
`node_full`** carrying what the writer needs to act in the same turn:

```json
{ "code": "node_full", "node": "2",
  "slots": [{"address":"2.1","ts":null}, …],
  "oldest": "2.1",
  "error": "\"2\" of \"grain:…\" is full: nine slots, all taken (2.1, …, 2.9).
            Longest-standing is 2.1 (2026-01-01T00:00:00Z). A digit position holds
            nine and does not grow — accumulation belongs at a block root… Overwrite
            a slot with an ordinary write to its address, or let the tide clear one.
            If this is a channel rather than a store, put a POINTER in the slot…" }
```

`oldest` comes from the entry's own position 3 (`block-conventions:9`, stamped on
append) and is reported **only when every occupied slot carries a date** — after
one overwrite, slot order says nothing about age, so guessing would be worse than
declining.

The way out needs no new mechanism: freeing a slot is an ordinary write to its
address. The tide sweep (age-based clearing, as `tide` already does for marks) is
a **separate pass**, deliberately not in this PR — it is a host-side script with
real delete power and wants its own review.

## Not in scope

- No bsp-mcp change. The refusal reaches the agent verbatim — `errOf` parses
  `p.error` from the body — and the dropped `supernested` field was only ever read
  as a truthy flag, so its absence prints nothing.
- No tide sweep yet (above).
- No migration. Both sides of `grain:3b5aba1f7b962a67` are one wrap deep and are
  to be flattened, but each side answers to its own holder's key.

## Verification

`smoke:append-spindle` 68/68 — rewritten around the refusal: the tenth is
declined, the reach text stays **at** the side underscore, the nine keep their
single-decimal addresses, nothing is invented at `2.11`, no spill to root 3,
undated slots decline to name an oldest while dated ones name it, and an ordinary
overwrite frees a slot. `smoke:append` 20, `smoke:floor` 18, `smoke:locks` 40,
`smoke:lighthouse` 16 unchanged.

Pre-existing, untouched: `smoke:voicing` fails 7 identically on clean
`origin/main`.
