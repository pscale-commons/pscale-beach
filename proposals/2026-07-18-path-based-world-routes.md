# Path-based world routes — self-service worlds without a subdomain

**Date**: 2026-07-18
**Status**: HANDLER LANDED (this PR); adapter + deploy + preview-verify remaining (see §5).
**Driver**: David wants any group of players to seed and play their OWN isolated copy
of a scenario cartridge, simultaneously, with no operator step. Subdomain-per-world
gates every world on a DNS/Vercel domain-add (block-conventions:4.8) — not
self-service. "Routes not subdomains" (the O-player direction).

## 1. The shape

A world is addressed by URL **path**, not subdomain:

```
https://beach.happyseaurchin.com/w/<world>/.well-known/pscale-beach?block=<name>
```

`/w/<world>` gets storage namespace `"<BASE_ORIGIN>/w/<world>"` — its own blocks and
its own lock salt, scoped exactly like a subdomain origin. One apex, one cert,
unlimited worlds, minted by the first write. No DNS, no cert, no operator step.

## 2. Why it needs no cross-repo salt coordination

The beach OWNS the lock hash: `hashOrdinary(origin, secret, block, position)` salts
with `https://${origin}`. For a world route `origin = "<BASE_ORIGIN>/w/<world>"`, so
the salt is `...https://<BASE_ORIGIN>/w/<world>:block:...` — self-consistent between
the write-hash and the read-verify, both on the beach. The client (bsp-mcp) only
sends the plaintext secret; it computes no federated lock hash. So path routing is a
pure namespace-derivation change on the beach, plus the client addressing the pathful
URL. No wire/salt renegotiation.

## 3. Handler change (this PR)

`originFromRequest(req)` replaces the single `originFromHost(...)` call at the one
origin-derivation seam:

- read the world from the `world` query param (`worldParam`) — the Vercel rewrite
  injects it from `/w/:world/...` — OR parse it from `req.url` (`worldFromPath`),
  belt-and-suspenders so it works whether or not the rewrite merges the query;
- a world name is DNS-label-shaped (`^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`) — no
  dots, slashes, or colons, so it can never inject a namespace separator; anything
  else folds to the Host-based origin;
- everything downstream (keyNs, blockKey, locksKey, the salt, the index) is already
  parameterised by `origin`, so nothing else changes.

Subdomain and apex beaches are **byte-for-byte unchanged** (originFromHost is the
fallback). `vercel.json` gains the `/w/:world/.well-known/pscale-beach` rewrite
(before the apex rewrite).

## 4. Verification

`scripts/smoke-world-routes.mjs` (`npm run smoke:world-routes`) — self-contained,
spawns a local-beach, 13 assertions all pass:
- worlds alpha / beta / apex fully isolated; alpha and beta share no blocks;
- the query form (`?world=alpha`) and the path form (`/w/alpha/...`) reach the SAME
  namespace (read and write);
- per-world lock salt — a world's secret does not unlock another;
- illegal world names (colon, slash, dots) fold to the apex — no namespace injection;
- the apex survives all world traffic byte-for-byte.

`npm run smoke:subbeach` still passes — no subdomain regression.

## 5. Remaining (not in this PR)

1. **bsp-mcp adapter** (`src/db.ts`) — `canonicaliseOrigin` currently strips the path;
   it must PRESERVE a `/w/<world>` segment so an agent_id
   `https://beach.happyseaurchin.com/w/<world>` addresses the pathful endpoint. Then
   the MCP (and NHITL seats, xstream) reach a world route directly. Small, with its
   own smoke.
2. **Operator clone** — the live beach deploys from `pscale-beach-happyseaurchin`;
   mirror this handler + vercel change there to go live.
3. **Preview verify** — confirm on a Vercel preview that the `/w/:world/...` rewrite
   delivers the world (query-merge vs path-parse); the handler already handles both,
   so this only picks which path Vercel actually takes.

## 6. Deliberately NOT here

No world registry / allowlist (open by default, like subdomains — mint by writing).
No per-world quota or GC (a tide/settings concern, unchanged). No change to sed:/grain:
salts (those have their own namespaces). Subdomains stay supported — routes are an
additional, cheaper addressing shape, not a replacement.
