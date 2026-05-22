# Conditional GET — ETag / If-None-Match on read

**Date**: 2026-05-15 (relationship to PR #11 noted 2026-05-17)
**Status**: proposal, not implemented; lower priority since PR #11 landed wire-level slicing
**Companion to**: xstream-bsp's cycle reads ([beach-kernel.ts](https://github.com/happyseaurchin/xstream-bsp/blob/main/src/kernel/beach-kernel.ts) — the 1.5s poll that motivates this).

## Relationship to PR #11 (added 2026-05-17)

PR #11 added the canonical bsp() function to the beach handler with `?pscale=` for depth-limited reads — `loadBspShape` on the bsp-mcp side, shape-resolved canonical JSON on the beach side. **That solves a different problem than this proposal:**

| problem | solver |
|---|---|
| "give me only the slice I need, not the whole block" | PR #11's `?pscale=` slicing |
| "did anything change since my last read?" | this proposal's `ETag` + `304` |

They compose. A client reading a slice via `?pscale=` would still benefit from a 304 when the slice's content is unchanged from its last read. ETags are computed on whatever the response body actually is — slice or whole block — so the same conditional-GET mechanism applies regardless.

Net: this proposal remains useful, especially for polling blocks that rarely change (`tide`, `settings`, an idle `marks`). The absolute bandwidth gain is smaller than originally framed because narrow-slice reads via `?pscale=` already cut full-block transfers out of the cycle for queries that can be expressed as slices. The remaining bandwidth waste is "I asked for X, I get X back identical to last time" — which 304 addresses. Keeping at lower priority; the handler + client changes are still small if/when implemented.

## TL;DR

Add HTTP conditional GET to `/.well-known/pscale-beach`. The handler computes a per-block `ETag` (sha256 of the serialised block body) on each GET; the client sends `If-None-Match: "<etag>"` on subsequent reads of the same block; the handler returns `304 Not Modified` with an empty body when the ETag matches. The client renders from its cached copy on 304.

This is the highest-leverage bandwidth optimisation for any client that polls — xstream most obviously, but also any beach-crab on a cron, any pool-aware client, any dashboard. Most blocks don't change between most polls; today every poll re-transmits the full body anyway.

Additive on the wire: handlers without conditional-GET support behave exactly as today; clients without ETag tracking behave exactly as today. No protocol break, no v3 needed, can land before the L1 kernel freeze.

## The problem in concrete numbers

xstream's kernel cycle today, per focused column, every 1.5s:

| read | block | typical size | changes between cycles? |
|---|---|---|---|
| 1 | `presence` | ~1KB per peer × N peers | sometimes (heartbeat moves timestamp every cycle of presence-bearing peer) |
| 2 | `marks` | grows linearly with cumulative marks | rarely (only when someone commits) |
| 3 | `tide` | tiny | almost never |
| 4 | `settings` | small | almost never |
| 5 | `liquid` / `liquid:<addr>` | small | sometimes (when someone stages) |
| 6 | `pool:<name>` (if in pool) | grows with contributions | sometimes |
| 7 | `frame:<scene>` (if in frame) | small-medium | sometimes |
| 8 | watched-beach scan (every 5th cycle) | per-beach `marks` size | rarely |

Of the seven baseline reads, four change rarely (marks / tide / settings / pool / frame), one changes every cycle of *any* peer (presence — moving timestamps), one changes occasionally (liquid). At an active beach with say 5 peers, that's roughly **2–3KB of presence delta** per cycle being honestly fresh; the remaining **5–50KB** is re-transmission of unchanged blocks. At one cycle every 1.5s that's the bulk of the wire usage per focused column.

Multiply by columns (one cycle per column), by users, by hours of session. Then add a beach-crab cron polling on its own cadence. Most bytes on the wire today are duplicates.

## The mechanism

### Handler side

On every successful GET that returns a block:

```js
// in api/pscale-beach.js GET handler, after `block` is loaded:
const serialised = JSON.stringify(block);
const etag = '"' + sha256(serialised).slice(0, 16) + '"';  // weak hash, quoted, ETag-shape

// If-None-Match honoured before the response body is written.
const inm = req.headers['if-none-match'];
if (inm && inm === etag) {
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');  // proxies revalidate, don't serve stale
  return res.status(304).end();
}
res.setHeader('ETag', etag);
res.setHeader('Cache-Control', 'no-cache');
return res.status(200).json(block);
```

Hash on read is the simplest implementation. For high-traffic beaches the hash could be stored as a sidecar Redis key (`v2:block:<name>:etag`), updated atomically on write — see "Open questions" below.

### Client side (xstream's `bsp-client.ts`)

```ts
// Per-(beach, block) ETag cache. WeakRef-ish: dropped on identity change
// or surface-reload.
const ETAG_CACHE = new Map<string, { etag: string; body: PscaleNode }>();

async function loadBlockFederated(agent_id: string, block: string) {
  const key = `${agent_id}::${block}`;
  const cached = ETAG_CACHE.get(key);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (cached) headers['If-None-Match'] = cached.etag;

  const res = await fetch(url, { headers });
  if (res.status === 304 && cached) {
    return { block: cached.body, etag: cached.etag };
  }
  if (!res.ok) {
    // ... existing error handling
  }
  const body = await res.json();
  const etag = res.headers.get('ETag');
  if (etag) ETAG_CACHE.set(key, { etag, body });
  return { block: body, etag };
}
```

The cache is intentionally local (in-memory, not localStorage) — ETag validity is per-process, no need to persist. Cleared on identity switch so a new user's reads aren't satisfied by the prior identity's ETag.

### Write invalidation

Writes invalidate the local ETag cache for the (beach, block) being written. The handler doesn't need to push invalidation — the next GET will receive a fresh ETag because the body has changed. The client just needs to evict its cached entry on a successful write to that block.

```ts
// in saveBlockFederated, on success:
ETAG_CACHE.delete(`${agent_id}::${block}`);
```

## Why this is additive

| handler supports ETag | client supports ETag | behaviour |
|---|---|---|
| no | no | as today: full body each GET |
| yes | no | handler sends ETag header, client ignores it, full body each GET |
| no | yes | client sends If-None-Match, handler doesn't honour, full body each GET |
| yes | yes | 304 on unchanged blocks, full body on changes |

No version bump on the v2 wire protocol. No coordinated rollout needed across operators or clients. Each side can adopt independently and the bandwidth gain materialises wherever both ends speak it.

## What this doesn't fix

- Per-block size when a block IS large and IS changing (e.g. `marks` growing without a tide-wipe). Conditional GET helps when the block is **unchanged**; it doesn't help when the block has new content. The tide-wipe story is the answer to "marks grows forever" — orthogonal optimisation.
- Per-cycle CPU on the client (still has to do the cycle's seven reads, parse seven responses, project to UI state). Conditional GET reduces network bytes; the client work is similar.
- Realtime push semantics. The poll cadence stays. WebSocket / SSE for "tell me when X changes" is a different optimisation, much bigger surface, deferred indefinitely.

## Open questions

1. **Hash-on-read vs sidecar storage.** Hash-on-read is one JSON.stringify + one sha256 per GET. On a busy beach with many polling clients, this could become non-trivial CPU. The sidecar approach (store ETag in Redis next to the block, update atomically on write) saves the read-side hash but requires careful transaction handling at the write boundary. **Recommendation**: ship hash-on-read first; profile; promote to sidecar only if measured CPU becomes a concern.

2. **Hash size.** 16 hex chars (64 bits) is enough to make collisions cryptographically negligible for any reasonable beach size, and keeps the ETag header short. Full sha256 (64 hex) is overkill. **Recommendation**: 16 chars.

3. **Strong vs weak ETag.** Weak (`W/"<hash>"`) signals "semantic equivalence" rather than byte-for-byte. Since we're computing on JSON.stringify, two byte-identical responses produce the same hash regardless. Strong is fine. **Recommendation**: strong ETag, no `W/` prefix.

4. **Cache-Control interplay.** Browsers may apply their own caching independent of ETag. `Cache-Control: no-cache` (which still requires revalidation) is the right header — combined with ETag it means "always check, but a 304 is cheap". `private` keeps shared proxies out of it. **Recommendation**: `Cache-Control: no-cache, private`.

5. **Surface-index GET (no `?block=`).** The surface index `{_, origin, blocks: [...names]}` is derived from listing Redis keys, not from a stored block. It changes whenever any sibling is created or deleted. Should it carry an ETag? **Recommendation**: yes — same mechanism, hash the JSON-stringified surface response. Saves bandwidth on the most-frequently-fetched derived response.

6. **Per-spindle slicing interaction.** When a GET specifies `?spindle=<addr>`, the response is a subtree (per `readAt` in current handler). The ETag for `?block=X&spindle=1.2` should reflect the subtree's content, not the whole block — otherwise the client gets stale data on subtree reads when the whole block changed but the subtree didn't. **Recommendation**: hash the actual response body (the subtree payload), not the whole block. Means every (block, spindle) combination has its own ETag; cache keys widen to `${agent_id}::${block}::${spindle}`. Bounded by the number of distinct spindles a client uses, which is small in practice.

7. **CORS exposure.** The `ETag` response header is in the CORS-safelisted response headers, so no `Access-Control-Expose-Headers` change is needed for cross-origin reads. The `If-None-Match` request header is in the CORS-safelisted request headers, no preflight implication. **Recommendation**: nothing to do.

## Estimated effort

- Handler: ~30 lines in `api/pscale-beach.js` (hash helper + 304 branch + headers). One commit.
- Client: ~40 lines in `xstream-bsp/src/lib/bsp-client.ts` (ETag cache + If-None-Match injection + 304 handling + write-invalidation). One commit.
- Tests: smoke test that 304 returns empty body, that write invalidates the cache, that spindle slices have distinct ETags.

Net <100 lines across both repos, two PRs.

## Path to landing

1. **This proposal** lands first (informational only). Operators and other client authors can review and dissent.
2. **Handler PR** on `pscale-beach` — adds ETag headers and 304 branch. Deploys to all operator beaches independently as they pull and redeploy. Zero impact on clients that don't send `If-None-Match`.
3. **Client PR** on `xstream-bsp` — adds ETag tracking and conditional requests. Activates the optimisation against any handler that already speaks it.
4. (Optional, later) Sidecar storage if profiling shows hash-on-read is a bottleneck.

The two PRs are independent — operators can deploy the handler change at their own pace; xstream gains the bandwidth saving against each beach as the handlers come online.

## Why it matters before the kernel freeze

The L1 kernel's wire protocol is one of the five frozen contracts. Adding conditional GET *after* the freeze means adding to v3 (which doesn't exist yet) and re-coordinating rollout. Adding it now means the v2 wire protocol — when it freezes — already specifies that GETs may be answered with 304 + ETag, and conformant clients should track ETags. Future bandwidth wins come for free as more clients adopt.

If the freeze happens without this, every client polling a beach will continue to re-fetch unchanged blocks indefinitely. Not catastrophic, but the easiest win we'd be leaving on the table.
