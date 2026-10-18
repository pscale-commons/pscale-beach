# pscale-beach

## To the next instance — read this before touching anything

This repo is the **habitat package** for the pscale ecology — the federated `/.well-known/pscale-beach` handler + seed content (reference library, operator presence, beach surfaces) + an init wizard + a Vercel deploy template. Drop on a server with Vercel + Upstash, get a Level-1 ecological biome.

This is NOT bsp-mcp. bsp-mcp is the **runtime** side: bsp() walker, sentinel registry, MCP server, six-tool surface. It lives at https://github.com/pscale-commons/bsp-mcp-server with its own CLAUDE.md.

If you're reading this, you've landed on the habitat side. Read the bsp-mcp CLAUDE.md too if you want the substrate-side mental model.

## What this is

A beach is a URL surface that hosts named pscale blocks — `marks`, `pool:<name>`, `sed:<collective>`, `grain:<pair_id>`, `passport:<handle>`, `shell:<handle>`, `history:<handle>`, plus a reference library. Federation works because every beach implements the same v2 wire protocol at `/.well-known/pscale-beach`. bsp-mcp clients call this endpoint to read/write blocks at any federated beach.

Live reference deployment: https://happyseaurchin.com.
First operator-via-this-package deployment: https://beach.idiothuman.com (David, 9 May 2026).

## Wire-frozen — what NOT to modify

`api/pscale-beach.js` implements the wire-frozen v2 protocol — part of the L1 kernel approaching freeze. See bsp-mcp's `evolution.json:_.6` for the kernel definition. Specifically:

1. **Lock salt formulas** (lines 60-78): three salt namespaces (ordinary, sed:, grain:) with sha256 formulas. **Don't change these.** Locks set under one beach must verify under any other; the salt formulas are part of the kernel freeze.
2. **GET/POST/DELETE wire shapes** (handler entry, lines 432+): the protocol surface. Adding new endpoints is fine; changing existing ones breaks federation.
3. **Shape gate** (lines 142-184): rejects `_word` keys and JSON-stringified subtrees. Don't relax — the gate is what protects beaches from agents importing non-pscale patterns from training.

If a real bug surfaces in any of these (as the spore.json shape-gate violation did during 9 May testing), fix the **content** that violates the gate, not the gate itself. The gate is correct. The seed bug was the seed.

## What can evolve (forkable)

Above the wire-frozen kernel, everything in this repo is forkable per operator:

- `seeds/library/` — the library (reflexive, spore, vision, grit, rpg, state, systemic-kernel, federation-protocol, state-block-reflexive-spark). Each operator can curate variants.
- `seeds/config/` — operational config every beach needs by spec (`tide` for the host's mark-wipe schedule, `settings` for per-beach xstream client knobs). Shape is defined by xstream's kernel readers (see `xstream-bsp/src/kernel/settings-reader.ts` for the settings schema and `beach-kernel.ts`'s `readTideConfig` for the tide schema). Operators tune leaf positions later; empty positions fall through to kernel defaults.
- `seeds/templates/` — operator-presence and beach-surface scaffolds. Each starter package can iterate the placeholder text.
- `init/seed-beach.js` — the wizard. Iterations expected as friction surfaces.
- `vercel.json`, `package.json`, deploy templates — operational evolution.
- `README.md` onboarding flow — friction-finding work continues.
- `button/` — the beach button: static files served beside the handler, so any page can carry `<beach>/button/button.js` and a person's handle, passphrase and key stay in a frame from the beach's own origin, out of the page's reach. It adds no endpoint and never touches the wire (it calls `/.well-known/pscale-beach` like any client). It is tapped as xstream's construction button is (+ prompt → # settings → × close): the circle, its grip and the widening edge are drawn on the page, and the beach's frame is one window holding the reply, staged writes (commit / not now) and the prompt. Settings opens the person's ear (`ear:<handle>`, its law at `ways:push`) in a window of the beach's own (`ear.html`), as unlocking does, and while a page is open the frame looks at the rooms they follow (the index's `touched`, then only what moved) and shows what is new inside the window. Its security case is `button/README.md`, proven by `npm run smoke:button` (headless Chromium against a hostile page; needs Playwright). Beside it, `voice.js` is the page's side (18 Oct 2026): one script a page carries, whose `beachVoice.say/keep/ask/drop` take a person's words through the button where it is on the page and through the page's own text entry where it is not (the key the browser keeps or asks for once), and which brings the button only where the person has turned it on, their choice kept in `settings:<handle>` at 9.1 (the per-person layer of the beach's `settings` block; 9 is pages). Any other page setting of the person's is read and kept the same way (`beachVoice.setting` / `set`, at 9.1 to 9.9; 9.2 is the light or the dark). Proven by `npm run smoke:voice`.

## What NOT to do

1. **Don't modify `api/pscale-beach.js`'s lock salt formulas or shape gate.** Wire-frozen.
2. **Don't auto-patch upstream files when init fails** — surface and stop. Already codified — the Option A prompt in README has explicit boundaries; this discipline came from a real incident on 9 May 2026 where a Claude Code session silently patched `seeds/library/spore.json` when init hit a shape-gate violation. Don't do that.
3. **Don't write multi-dot pscale addresses** — sunstone:1.5 is one decimal point. bsp-mcp's parser is fragile around multi-dot writes (see `bsp-mcp/proposals/2026-05-09-parser-dot-handling.md`). Use dot-free (`"912"`) or single-dot (`"9.12"`).
4. **Don't sync content across beaches** — each beach is sovereign. Library updates are pulled manually by operators if they want; no central sync.
5. **Don't add tools/endpoints beyond the v2 protocol** — additions might land in v3; after the kernel freezes, they'd break compatibility.
6. **Don't take destructive actions on a deployed beach without operator authorisation** — DELETEs, whole-block overwrites with `confirm: true`, lock rotations all need explicit go-ahead.

## What TO do

1. **Read the README** — it documents both Option A (Claude Code paste prompt) and Option B (manual CLI). The Option A prompt is the canonical onboarding flow for fresh operators.
2. **If init fails on a seed**, surface the exact error response from the handler verbatim. Identify it as upstream's responsibility (the seed lives here, in this repo). Offer options. Let the operator pick.
3. **Honour the Option A prompt's boundaries** — they're load-bearing. Don't modify repo files without asking. Don't auto-write to `~/.claude.json`. Don't take destructive beach actions.
4. **For polish iterations**, the README's "Customising the templates" section is the right entry point. The placeholder text in seeds/templates/ models zeroth-voice; operators copy that voice when authoring their own passports, so the templates seed beach-cultural style.

## Architecture

```
pscale-beach/
├── api/pscale-beach.js          — the handler (wire-frozen)
├── seeds/
│   ├── library/                 — library blocks (10 files; operator-curated, forkable)
│   ├── config/                  — tide + settings (every beach needs these by spec)
│   └── templates/               — operator-presence + beach-surface scaffolds
├── init/seed-beach.js           — env-driven init wizard
├── button/                      — the beach button (static; served at /button/)
├── vercel.json                  — Vercel rewrite for /.well-known/...
├── package.json                 — Node ESM, single dep (@upstash/redis)
├── .env.example                 — env-var template (clearly sectioned: handler vs init)
└── README.md                    — Option A (Claude Code paste) + Option B (manual)
```

## Storage

Upstash Redis is the default backend. Other KV backends (Cloudflare KV, plain Redis, Postgres KVP) work with minor adapter changes — the handler uses one Redis client at the top.

`BEACH_ORIGIN` is OPTIONAL on Vercel deploys (falls back to `VERCEL_PROJECT_PRODUCTION_URL`) so vibe-coders can deploy without picking a domain upfront. Custom domain is an upgrade — set `BEACH_ORIGIN` to the final hostname, redeploy, re-seed (locks recompute under the new salt). The lock-salt-changes-on-origin-change is a known migration cost.

## Lineage

Created 9 May 2026 during David's idiothuman.com beach setup session. The handler was extracted from happyseaurchin's `api/pscale-beach.js` reference (with the origin made env-var configurable). The library was copied from `bsp-mcp/docs/library/`; that location is now stale and slated for deletion in a bsp-mcp cleanup pass.

The split between bsp-mcp (runtime) and pscale-beach (habitat) is architectural: substrate-truth (the bsp-mcp references) doesn't vary; usage-pattern content (the library) does. Bundling the library inside bsp-mcp prevented per-community curation. Federating it to beach packages enables real diversity.

## Companion docs

- bsp-mcp's `evolution.json:_.6` — the L1 kernel framing (the wire-frozen v2 surface)
- bsp-mcp's `proposals/2026-05-09-parser-dot-handling.md` — the parser bug discovered during initial deployments here; entry doc for the bespoke session that lands the fix
- bsp-mcp's `CLAUDE.md` — the substrate-side mental model
- bsp-mcp's `src/sunstone.json` — the geometry teacher (read first if pscale block format is unfamiliar)
- bsp-mcp's `src/whetstone.json` — operational reference for bsp()
- This repo's README.md — onboarding flow for fresh operators
