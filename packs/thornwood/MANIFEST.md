# Cartridge: thornwood

A self-contained pscale-block bundle — the reference RPG cartridge. Seed it into
an empty beach (a local folder, or a sub-beach on a shared host) to get a
complete, playable world; dump it to snapshot; reset it to roll back. This is the
proof that a game is just a bundle of blocks: the engine (bsp + the beach
handler) never changes — the cartridge is the data.

## The three legs (on the beach)

- **Source** — this directory, in git (`pscale-beach/packs/thornwood/`).
- **Snapshot** — a frozen copy on CORSAIR, pinned to the substrate commit below.
- **Run-time** — the cartridge seeded into a beach. Locally a beach is a folder
  (`scripts/local-beach.mjs`); remotely it's a sub-beach. Play mutates the
  run-time; `pack-reset` restores it from this source. One beach = one reality.

## Substrate (the engine this cartridge runs against)

- **bsp-mcp-server** `cd5c9c7` (origin/main) — the walker + sentinel registry (router).
- **pscale-beach** `ddbc46d` (main) — the `/.well-known/pscale-beach` handler.
- Portable across any beach: internal refs use the `{{BEACH}}` placeholder,
  substituted at seed. There are **no absolute host refs** in the cartridge.

## Contents

**`definition/`** — the cartridge proper (designer + author content); each `_`-locked under `THORN_GM`:

| Block | Role |
|---|---|
| `function:thornwood` | the three aperture directives (soft / resolve / hard) |
| `rules:nomad` | resolution system — CF + SF + dice − difficulty, bands |
| `rules:thornwood` | place physics — perception, conflict, pacing, night-wood difficulty |
| `frame-spec:thornwood` | the CADO manifest; `:9` holds frame metadata + the **window duration** |
| `spatial:thornwood` | the world — Oakhollow, the Beaten Drum, the Thornwood deer-paths |

**`initial/`** — the opening save (authored in Phase 1); each character `_`-locked under its own secret:

| Block(s) | Role |
|---|---|
| `passport:<h>` | capability (CF), wants, location, identity |
| `witnessed:<h>` | the character's **floor-1 spine** (beats at digits 1,2,3,…; append-clean) |
| `knows:<h>` | the naming index — people (`1`) and places (`2`) the character can recognise |
| `pool:111` | the room's public event-skeleton stream (opens empty) |
| `liquid:pool:111` | the staging window (opens empty) |

Characters: **cyrus**, **anya**, **fenn**.

## Lock policy (secret *values* are out-of-band — env vars, never committed)

| Blocks | Position | Secret env |
|---|---|---|
| all `definition/` | `_` | `THORN_GM` |
| `passport`/`witnessed`/`knows:cyrus` | `_` | `THORN_CYRUS` |
| …`:anya` | `_` | `THORN_ANYA` |
| …`:fenn` | `_` | `THORN_FENN` |
| `pool:` / `liquid:` | (open) | — |

## XYZ configuration (Thornwood)

- **X (persistence) = 1** — runs are snapshot-able; reset is a total rollback.
- **Y (temporality) = 0** — bleeding-edge: one live present, no block-universe past.
- **Z (mutability) = 1** — mutable: the hard tier folds durable events into the place.

## Harness (run from `pscale-beach/`)

```sh
export THORN_GM=… THORN_CYRUS=… THORN_ANYA=… THORN_FENN=…
# a beach (local folder):
node scripts/local-beach.mjs --dir ./.beaches/thornwood --port 8788 &
# seed / dump / reset:
node scripts/pack-seed.mjs  --beach http://localhost:8788 --pack packs/thornwood
node scripts/pack-dump.mjs  --beach http://localhost:8788 --out ./snap --blocks <list> --rewrite-beach http://localhost:8788
node scripts/pack-reset.mjs --beach http://localhost:8788 --pack packs/thornwood
```
