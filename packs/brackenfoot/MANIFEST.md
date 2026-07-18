# Cartridge: brackenfoot

A **resettable starter scenario** — the URB holding of Brackenfoot, seeded as a
self-contained pscale-block bundle. A poor village at the foot of the bracken
slopes, held by six of the Lord's men; the party arrives the day it breaks. Hard,
grounded, no magic shown — the one cold note (Pell and the Master he answers to)
is left unexplained by design. Seed it into an empty beach to get a complete,
playable world; reset it to roll back; spin a fresh sub-beach per player-group.

Source scenario: `brackenfoot.md` (the dense authored seed this cartridge is a
faithful conversion of). Its sequel thread — Pell carried up the valley to the
Magus at Thornmere — is a separate cartridge, not this one.

## What makes this cartridge different from `thornwood`

- **GRIT-native.** No `function:brackenfoot` — every room pool's underscore points
  at the canonical `pscale:grit` sentinel (the play loop). The per-world directive
  copy is redundant with the sentinel, so it is omitted (as in `thousand-valleys`).
- **Genesis, not a pre-placed cast.** The `initial/` save holds **no characters** —
  only the arrival room (`pool:211`, the Slip). Players are created by walking
  genesis (the substrate `char-creation` passage), which avoids the pre-seeded
  double-presence problem (a pack character placed at an address loads as a live,
  co-present figure *and* doubles the authored scenery).
- **An adopt-a-seed roster.** `roster:brackenfoot` offers four ready ROLES a
  newcomer may adopt (steel / tongue / back-ways / mercy — a party's spread and
  Brackenfoot's four ways through). The seeds are **unplaced** (no location, no
  lock): a role becomes a person only when a player takes it up at genesis and the
  role's capability/want/look/knowings are copied into their OWN locked passport.
- **A world-hosted `char-creation` override.** A thin delta over the substrate
  passage: it changes only the interview (offer the roster; name the arrival at the
  Slip) and defers the write/arrival ceremony to `pscale:char-creation` — no
  duplication to drift.
- **The identity coordinate.** `identity:brackenfoot` mirrors the spatial skeleton
  and fans each contested place into how each 'we' holds it (villagers / crew /
  newcomer / — at the count alone — the Master). The S·T·I demonstration.

## Contents

**`definition/`** — designer + author content; each `_`-locked under `BRACK_GM`:

| Block | Role |
|---|---|
| `spatial:brackenfoot` | the holding — floor 3; the Village (1), the Road In (2), the Slopes & Diggings (3); a three-digit address lands in a room. Crew and villagers are standing figures in the room prose. |
| `rules:brackenfoot` | place physics + the tactical spine: the occupation, the reinforcement clock (a rider out = three-day burn), the crew's night-weakness (−2 difficulty after dark), the cold thread |
| `rules:nomad` | resolution system — CF + SF + dice − difficulty, bands (zero-band disambiguated) |
| `frame-spec:brackenfoot` | the CADO manifest; `:9` holds the window duration; GRIT-native |
| `roster:brackenfoot` | four adopt-a-seed roles (unplaced templates) |
| `char-creation` | world-hosted genesis override — the roster offer + the Slip arrival |
| `identity:brackenfoot` | the identity coordinate — group perspectives fanned on the spatial skeleton |

**`initial/`** — the opening save (open, unlocked):

| Block | Role |
|---|---|
| `pool:211` | the Slip crossing — the arrival room's event stream (opens empty, mounts `pscale:grit`) |
| `liquid:pool:211` | its staging window (opens empty; slot position 2 = first-staged arrival stamp) |

**No `parked/`** — there are no pre-authored characters; genesis makes them.

## Lock policy (secret *values* are out-of-band — env vars, never committed)

| Blocks | Position | Secret env |
|---|---|---|
| all `definition/` | `_` | `BRACK_GM` |
| `pool:211` / `liquid:pool:211` | (open) | — |
| characters (`passport`/`knows`/`purpose`/`witnessed:<h>`) | `_` | player-chosen at genesis (not in this pack) |

## Arrival

The road delivers newcomers to **the Slip** — `spatial:brackenfoot:211`, digit-path
`2,1,1` — the ford where the good road gives out and the occupation is first met.
A party arriving together lands here as one (first walker at 211; companions give
that walker's handle at the interview).

## Seed / reset (harness)

```
# seed to a live sub-beach (through the apex cert until the subdomain's own is issued):
BRACK_GM=brack142 node scripts/pack-seed.mjs \
  --beach https://brackenfoot.beach.happyseaurchin.com \
  --via   https://beach.happyseaurchin.com \
  --pack  packs/brackenfoot --subdir both

# roll back a run:  node scripts/pack-reset.mjs  --beach <url> --pack packs/brackenfoot
# snapshot a run:   node scripts/pack-dump.mjs   --beach <url> --out <dir>
# local play:       node scripts/local-beach.mjs --dir <folder>  (then seed --beach http://localhost:PORT)
```

## Substrate (the engine this cartridge runs against)

- **bsp-mcp-server** `origin/main` — the walker + sentinel registry (router); GRIT
  engine at `pscale:grit`, canonical genesis at `pscale:char-creation`.
- **pscale-beach** `origin/main` — the `/.well-known/pscale-beach` handler; sub-beach
  namespaces derived from the request Host.
- Portable across any beach: internal refs use `{{BEACH}}`, substituted at seed.

## Live status

Seeded to the `brackenfoot.beach.happyseaurchin.com` namespace and verified against
the live handler. Direct MCP/browser access to the subdomain is gated on the
operator adding `brackenfoot.beach.happyseaurchin.com` to the Vercel project (DNS +
cert); until then the namespace is reachable via the apex with a `Host:` header
(the `--via` path above).
