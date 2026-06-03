# Every block has a floor — the invariant, the creation bug, the one-shot repair

**Date**: 2026-06-03
**Status**: IMPLEMENTED + DEPLOYED. Canonical fix in this PR; live migration run against both beaches; survey confirms 0 malformed.
**Touches**: `pscale-beach` (handler creation path, `saveBlock` backstop, migration script), the two live beaches (one-shot repair), and — as a deferred tail — bsp-mcp's `sunstone:1.51` / whetstone to state the invariant substrate-side.

## The finding

A live survey of both federated beaches found blocks with **no floor at all** — the root object has no `_`, so there is no underscore-chain to an identity string, no pscale 0, and every entry sits at negative pscale.

| beach | blocks | malformed (floor 0, no root `_`) |
|---|---|---|
| beach.happyseaurchin.com | 75 | **11** — `marks`, `presence`, `liquid`, `liquid:pool:beach-testing`, `liquid:pool:living-space`, `liquid:pool:living-spaces`, `liquid:pool:rpg`, `liquid:pool:visiting`, `pool:beach-testing`, `beach-log:waer`, `witnessed:the broad stranger` |
| beach.idiothuman.com | 47 | **1** — `presence` |

Every malformed block is an **open-append accumulator**. Every block created through a dedicated flow (passport, shell, history, `sed`, `grain`, `frame`, pools via `pscale_pool_engage`) has a proper floor. The split is exact and it points straight at the cause.

## Why it is malformed, not merely ugly

`sunstone:1.1` — *"at every node, an underscore occupies the zero position carrying meaning."* The root is a node; it must carry a `_`. A floor-0 block breaks three things concretely:

- **No pscale 0.** The disc at pscale 0 is empty; entries sit at pscale −1, −2. "All marks flat at pscale 0" is false.
- **`bsp-floor` cannot align it.** Cross-block alignment indexes by pscale 0; a block with no pscale 0 is invisible to the n-ary operation.
- **Supernest cannot wrap it cleanly.** `{_: old}` assumes `old` has a floor.

## Root cause — the one creation path that forgot the floor

`api/pscale-beach.js` `handleStandardWrite`: a first write at a digit slot to a non-existent block created `{}` and wrote the slot — producing `{1: <mark>}`, floor 0. `sed` register, `grain` reach, and the surface index all seeded `_`; only the open-append path omitted the identity. (A second, narrower route: a raw `bsp()` whole-block write whose payload lacked a `_` — how `pool:beach-testing` got in.)

## The invariant

> **A stored pscale block always has a floor: the root carries a `_`, and following `_` reaches an identity string.** The write path is responsible for this — a block is never persisted without it.

## The fix — three mechanisms (all shipped)

1. **Seed on creation** (`handleStandardWrite`): a sub-position create seeds `{ _: defaultIdentity(name, ORIGIN) }` — never born floor-0. `defaultIdentity` is convention-aware (`marks`, `presence`, `liquid`) and generic otherwise; the owner may overwrite `_` later.
2. **Gate floorless whole-block writes**: rejected with `code: no_floor` — closes the raw-`bsp()` route.
3. **`saveBlock` backstop**: self-heal + `console.error` if any future path saves a floor-0 block. Self-heal (not throw) so the invariant always holds without ever failing a write. All five `saveBlock` callers were audited — each already seeds a floor — so this only trips on a regression.

Pure helpers live in `api/floor.js` (`floorDepth`, `hasFloor`, `defaultIdentity`, `repairFloor`), side-effect-free so the handler and the script share one definition. `scripts/smoke-floor.js` — 18 unit assertions, `npm run smoke:floor`.

## `bsp-floor` — check yes, repair no

`bsp-floor` is read-only pure compute. A read-only floor-health report fits its contract; **correct/create are writes and must not go in it.** Prevention lives in the write path (mechanisms 1–3); cure is the one-shot. `bsp-floor` stays read-only.

## The one-shot repair — `scripts/repair-floor.js`

Over HTTP (no redis creds — only the beach URL), dry-run by default, per-block backups, idempotent, self-scoping from the index. **Address-preserving**: prepends `_`, moves no entry; the pscale label snaps from negative to 0. **Well-formedness only** — it does *not* convert the fixed-floor subnest shape to supernest (separate, deferred work).

## Outcome (2026-06-03)

Deployed to both operator clones (Vercel). Verified the new handler serves floor-1 blocks. Ran `repair:floor --apply`: **11 repaired on happyseaurchin, 1 on idiothuman, 0 failed**, backups saved. Re-survey: **0 malformed on both beaches.** Spot-check of `marks` — floor 1, identity seeded, all nine entries intact, entry `1` preserved.

## Remaining (deferred tail, bsp-mcp, low-priority)

- State the invariant in `sunstone:1.51` and whetstone's storage branch.
- `bsp-fn.ts` `writeAt` parity seed (non-load-bearing — the beach handler is authoritative for beach blocks).
- The separate supernest-writer work (floor-growth growth model) tracked in bsp-mcp's `2026-06-03-supernest-floor-growth-and-positional-ladder.md`.
