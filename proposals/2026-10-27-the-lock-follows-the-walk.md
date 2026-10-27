# The lock follows the walk — a sed's places and a grain's sides answer to one latch however they are spelled

**Date**: 2026-10-27
**Status**: proposed in this PR (weft, at David's word: "close the holes and prepare a PR for these fixes"); the holes were named in the coloured-stigmergy proposal on 26 October (`spine:coloured-stigmergy` 1.116, "For weft to close")
**Touches**: `api/pscale-beach.js` (lock-key derivation for `sed:`/`grain:`, the governing latch, what a sed or a grain takes by hand, sed allocation), `scripts/smoke-substrate-authority.mjs` (new), one case of `scripts/smoke-append-spindle.js`. The lock salt formulas and the shape gate are untouched, and no stored latch changes meaning: places keep their keys at `11`, `12`, …, sides at `1` and `2`, roots at `_`.

## The fault

A sed's places and a grain's sides are nodes of a walk. In a floor-1 sed, place 11 is the node 1→1 and place 111 the node 1→1→1 beneath it; the fifth line of grain side 1 is the node 1→5. The walk goes digit by digit, but the lock was read off the spindle as typed, its first dotted segment. So one node answered to as many locks as it had spellings, and every node nobody had latched one by one stood open. The proposal named three holes, reproduced offline against a copy of this handler:

1. A write at a sed's 1 carries no lock and replaced the places 11 to 14; whoever holds place 11 controls the places 111 to 119 beneath it.
2. A sed born by its first settle has no root latch, so a whole write with confirm and no key replaced it, a hole already closed for grains on 2026-08-09.
3. In a floor-1 sed, '9.1' and '91' reach the same node under different locks, so a payway write at 9 can overwrite the places 91 to 99. The reverse holds too: settling reaches 91 after 89 and lands on the payway's issuer line.

The rest of the class, found beside them:

- **Every position a founder had not latched one by one was open.** A sed's root latch bound only the whole block and its underscore. On the beach today that left `sed:genus-hatch` 9 and its purchase address at 92 writable by any hand, and every line of `sed:lero-nnh`, the check-in protocol members' assistants follow among them.
- **A place's own lines were open beneath it.** A registrant's ticket grain at 11's 1 is the node of place 111. Its lock was '111', which nobody held.
- **A grain's sides answered to one spelling only.** '1.5' needed side 1's key, while '15' reached the same node and needed none. A grain's 9 also stood open: it records who holds which side, and it is what the connector seals a grain line to (`encryptGrainLeaf` in bsp-mcp's `src/tools/bsp.ts`). A keyless write naming a third party there would have sealed the next line to that party.
- **A grain could be squatted.** A side nobody had accepted could be written or latched by hand, after which the partner's accept was refused. A grain could also be made by a plain write, with parties of the writer's choosing at 9.
- **A root append wrapped the block.** On a sed it lands at a container, and the tenth supernests the sed, moving every place under the underscore, where the floor-aware parse of '11' no longer finds it. On a grain it moves the record at 9 the same way.

Replaying the 24 October nightly image (24 seds, 62 grains) through the handler as it stands, 681 of 919 keyless writes landed: one scalar at every position of every block, plus a whole-block replace and a root append on each.

## The change

Three rules, all in the handler's own vocabulary:

1. **The lock follows the walk.** For `sed:` and `grain:`, the lock key is the parsed walk joined (`lockKeyForWrite`), so '1.1' and '11' are one position. The latch that governs a write is the nearest one on the walk (`governingKey`): the position's own lock, else the nearest latched position above it. A sed's root latch, its founder's, governs only what no registrant holds, never a member's place. A grain has no root latch, and only its sides are anyone's. This is the 2026-07-26 inheritance rule carried to the depth where these positions sit; ordinary blocks, whose positions are first digits, are unchanged.
2. **Fine locks bind the coarse** (`substrateWriteRefusal`, extending the grain gate's principle). A write never removes or moves a position held by another latch. A sed holding places is never replaced whole. An object written at a position with places beneath it is refused, while a string still re-voices it. A write into the root's underscore chain, beyond a line at 0, is refused while places stand, because it would raise the floor beneath them. Neither a sed nor a grain takes a root append.
3. **Positions are born by their own actions.** A place is born by settling and a side by reaching. So a place nobody has settled is not written or latched by hand (founding latches a sed's root; a latch elsewhere only rotates or delegates). A grain's 8, its 9 and its underscore belong to the reach action. A side nobody has accepted is taken by accepting. A grain is never made by a plain write. Settling never lands beneath 9, which block-conventions 7.3 keeps for the collective's metadata, and never where something already stands, such as a place's own lines at the addresses of the places beneath it.

## Proof

- `npm run smoke:substrate`: 55 checks, the holes and their class plus everything legitimate. Against the unpatched handler, 38 fail and every attack answers `ok:true`; with the change, all 55 pass.
- Every existing battery passes unchanged, on the in-process rig or the local beach: grain-integrity, append-spindle (one case re-aimed, below), floor, append, temporal, set-aside, handle-bound, passport-whole, born, caps, index-sizes, backup-restore, one-bus, world-routes, tables, lighthouse, locks, voicing and subbeach.
- The same replay of the 24 October image with the change: 18 of 919 keyless writes land. All are scalar re-voicings of the root or container underscore of the nine seds nobody founded (beachcombers, general, hatch-tickets-audit-2026-07, hsu-commons, test, test-collective, test_collective, visiting, weft-audit-2026-08). No place, metadata line or grain position is among them.
- No sign the open 9 was used: in all 34 grains whose 9 names both sides, the two handles hash to the grain's pair id.

`smoke-append-spindle` case (d) used a grain's 5 as its example of a missing node. That position is now refused before the walk, because it lies inside no side. The case now uses a missing node inside side 1 for the 404, and a second line asserts the new refusal at 5.

## What changes on the live beach

Each item below needs a key where it needed none before:

- **`sed:genus-hatch`**: 9 and 91 to 94 (the payway config) now need the collective's admin key, the root latch. A registrant's lines beneath their place (111, 112, 121, 122) need that place's key. A fulfiller writing a line beneath a member's place, as the FULFILLED lines at 112 and 122 were written, needs that place's key too. Payway §2.3 already assumed the place's lock covers its children.
- **`sed:lero-nnh`**: every position now needs its root key (the latch Matthew claimed). Before, none of them did.
- **`sed:happyseaurchin-commons`** 9, **`sed:beach-venture-cast`** 11 (written under the shared lock, never settled), and the containers and sub-lines of every founded sed: the root's key.
- **Grains**: unchanged for every write made under a side's key. A pending side is taken by accepting the reach, as it always was meant to be.
- **Settling**: the next place changes only where something already stood at it. `sed:lero-nnh` would land at 13 instead of over Matthew's 11, and `sed:beach-venture-cast` at 12. Places 91 to 99 and everything beneath 9 are never allocated; no live sed has reached them.

## Left open, said plainly

- **The nine seds nobody founded** keep their root and container underscores open to a re-voicing by any hand, and their root can still be latched by the first hand to found it after the fact. Such a founder then governs what no place holds, never a place.
- **block-conventions 7.1** (bsp-mcp sentinel) still lists "…, 99, 111, …, 999" as the registrant sequence, and payway.md §2.1 "11..99". Both should read "never beneath 9", agreeing with 7.3 and with this code. That is a sentinel and docs change in bsp-mcp, which redeploys the router, so it is not in this PR.
- **The connector could check the pair id before sealing.** A grain's 9 is now the reach's alone, but `encryptGrainLeaf` could also refuse to seal unless the handles at 9 hash to the grain's pair id. That would defend a reader of any beach, including one still running the old handler. It is a bsp-mcp change, not in this PR.
