import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';
import { hasFloor, defaultIdentity, repairFloor, appendWithSupernest } from './floor.js';

// ── Pscale Beach v2 — URL surface, sibling blocks ──
// Spec: https://github.com/pscale-commons/bsp-mcp-server/blob/main/docs/protocol-pscale-beach-v2.md
//
// The URL is the surface. It hosts named sibling blocks. There is no special
// "beach" block — beach is the surface, not a block. Every request carries an
// explicit ?block=<name> (or block in POST body). GET without ?block= returns
// a derived index listing the named blocks present at this surface.
//
//   GET  /.well-known/pscale-beach              → index of named blocks at this surface
//   GET  /.well-known/pscale-beach?block=<name>[?spindle=<addr>]
//   POST /.well-known/pscale-beach?block=<name>
//        body: bsp-mcp standard {spindle, content, secret?, new_lock?, gray?, confirm?}
//          OR for substrate-prefixed blocks, the substrate action shapes:
//            sed:   {action: "register", declaration, passphrase}
//            grain: {action: "reach",    side, agent_id, partner_agent_id,
//                                        description, my_side_content,
//                                        my_passphrase}
//
// Block-name prefix routes the substrate:
//   "sed:<collective>"  → site-hosted sed: substrate; per-position locks
//   "grain:<pair_id>"   → site-hosted grain: substrate; per-side locks
//   anything else       → ordinary block; per-first-digit locks plus '_' for
//                         whole-block / underscore-of-root writes
//
// Shape gate on writes (per-host policy, not protocol): rejects `_word`
// underscore-prefixed sibling keys (only "_" and digits 1-9 are valid spine
// keys) and JSON-stringified sub-objects (must be written as objects, not
// strings). Defense against LLMs that import non-pscale patterns from
// training. bsp-mcp itself stays silent on shape rules.
//
// Lock salt namespaces match bsp-mcp's src/locks.ts so locks set under one
// client verify under any other.
//
// Wire contract for ordinary writes:
//   `content` is the value placed at `spindle` — an object goes in as a
//   subtree, a string as a string-leaf. Shape derivation (point/ring/
//   subtree/disc/star) per pscale_attention is the CLIENT's job; this
//   handler does NOT honour pscale_attention. Empty spindle is a
//   whole-block replace. Replacing an EXISTING block requires
//   {confirm: true}; initialising a new block (no prior state) does not.
//
//   Supernest-on-growth: when the descent path crosses an intermediate
//   node holding a string, the string migrates to the new sub-block's
//   underscore (block[k] = "old" becomes block[k] = {_: "old", ...})
//   so the parent's semantic survives the appearance of children.

let redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});

// Test seam: the local file-backed beach rig (scripts/local-beach.mjs) injects a
// folder-backed shim here so the real handler runs offline against a directory.
// Never called in production — the Upstash client constructed above is the only
// redis the deploy ever uses.
export function __setRedis(r) { redis = r; }

// BEACH_ORIGIN is the host's bare domain (no scheme), e.g. "idiothuman.com".
// It is part of the ordinary-block lock salt — locks set on this beach must
// hash under this exact origin. Changing it after blocks are locked breaks
// those locks.
//
// On Vercel, BEACH_ORIGIN is OPTIONAL — when unset, falls back to the
// project's production URL (VERCEL_PROJECT_PRODUCTION_URL, e.g.
// "pscale-beach.vercel.app") so vibe-coders can deploy without picking a
// domain first. Custom domains become an upgrade: set BEACH_ORIGIN to the
// final hostname, redeploy, re-seed (locks recompute under the new salt).
//
// Fallback chain: BEACH_ORIGIN → VERCEL_PROJECT_PRODUCTION_URL → VERCEL_URL.
const BASE_ORIGIN =
  process.env.BEACH_ORIGIN ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL;
if (!BASE_ORIGIN) {
  throw new Error('BEACH_ORIGIN env var required (bare domain, no scheme — e.g. "idiothuman.com"). On Vercel, this falls back to VERCEL_PROJECT_PRODUCTION_URL automatically; outside Vercel, set it explicitly.');
}

// Sub-beaches — per-request origin, derived from the Host header. The storage
// namespace AND the lock salt are scoped by origin, so ONE deploy + ONE Upstash
// hosts many fully-isolated beaches addressed by subdomain:
//   <sub>.<BASE_ORIGIN>  → namespace "<sub>.<BASE_ORIGIN>" (its own blocks + locks)
//   <BASE_ORIGIN> (apex) → namespace "<BASE_ORIGIN>" — UNCHANGED from before, so
//                          every existing block + lock keeps verifying byte-for-byte.
// Anything unrecognised (Vercel preview hostnames, a bare IP) folds to the base,
// so no stray empty beach is ever created. This is the cost-efficient shape:
// many beaches on one database, not one database per beach.
function originFromHost(hostHeader) {
  const host = String(hostHeader || '').split(':')[0].trim().toLowerCase();
  if (!host || host === BASE_ORIGIN) return BASE_ORIGIN;
  if (host.endsWith('.' + BASE_ORIGIN)) return host;
  return BASE_ORIGIN;
}

// Key namespace — scoped by the per-request origin so multiple beaches can share one Upstash
// without collision. Pre-namespacing deploys used `pscale-beach-v2:block:<name>`
// (no origin). Reads transparently fall back to that legacy layout for backward
// compatibility; writes go to the namespaced layout only. Operators sharing one
// Upstash between multiple beaches should run scripts/migrate-keys.js once
// against any pre-namespacing deploy to relocate its legacy keys.
//
// LEGACY_FALLBACK_READS gates the per-request fallback GETs in loadBlock /
// loadHashes. Default OFF — fresh deploys from this package have no legacy
// data, so the fallback is pure waste (1 phantom Redis GET per write to any
// unlocked block, typically presence written on every heartbeat). Operators
// upgrading a pre-namespacing deploy turn it on with
// LEGACY_NAMESPACE_FALLBACK_READS=true until they run scripts/migrate-keys.js.
const LEGACY_NS = 'pscale-beach-v2';
const LEGACY_FALLBACK_READS = process.env.LEGACY_NAMESPACE_FALLBACK_READS === 'true';
const keyNs = (origin) => `pscale-beach-v2:${origin}`;
function blockKey(origin, name) { return `${keyNs(origin)}:block:${name}`; }
function locksKey(origin, name) { return `${keyNs(origin)}:locks:${name}`; }
function legacyBlockKey(name) { return `${LEGACY_NS}:block:${name}`; }
function legacyLocksKey(name) { return `${LEGACY_NS}:locks:${name}`; }

// ── Lock hashing — three salt namespaces matching bsp-mcp src/locks.ts ──

function hashOrdinary(origin, secret, blockName, position) {
  // sha256(passphrase + 'block:' + agent_id + ':' + name + ':' + position)
  const salt = `${secret}block:https://${origin}:${blockName}:${position}`;
  return createHash('sha256').update(salt).digest('hex');
}

function hashSed(secret, collective, position) {
  // sha256(passphrase + collective + position)
  const salt = `${secret}${collective}${position}`;
  return createHash('sha256').update(salt).digest('hex');
}

function hashGrain(secret, pairId, side) {
  // sha256(passphrase + 'grain:' + pair_id + ':' + side)
  const salt = `${secret}grain:${pairId}:${side}`;
  return createHash('sha256').update(salt).digest('hex');
}

// ── Pscale address parsing (canonical, sunstone:1.5) ──
//
// The decimal point anchors pscale 0 to the floor. parseSpindle applies
// floor-aware padding so an address written at a smaller floor still locates
// the same semantic position after the block has grown an underscore layer
// above. Multi-dot addresses are rejected at parse time. Mirrors the parser
// in bsp-mcp's src/bsp.ts (and the Python canonical bsp2-star.py) — both
// ends of the wire enforce the same form.

class InvalidAddressError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidAddressError';
    this.code = 'invalid_address';
  }
}

function floorDepth(block) {
  let node = block;
  let depth = 0;
  while (node && typeof node === 'object' && '_' in node) {
    depth++;
    node = node._;
    if (typeof node === 'string') return depth;
  }
  return depth;
}

function parseAddress(s) {
  if (typeof s === 'number') {
    if (Number.isInteger(s)) {
      return { leftDigits: [...String(s)], rightDigits: [], hadDot: false };
    }
    const formatted = s.toFixed(10);
    const parts = formatted.split('.');
    const left = parts[0];
    const right = parts.length > 1 ? parts[1].replace(/0+$/, '') : '';
    return { leftDigits: [...left], rightDigits: [...right], hadDot: true };
  }
  const text = String(s);
  const dotCount = (text.match(/\./g) || []).length;
  if (dotCount > 1) {
    throw new InvalidAddressError(
      `"${text}" has multiple decimal points (${dotCount}); pscale addresses carry at most one (sunstone:1.5)`
    );
  }
  let left, right;
  if (dotCount === 1) {
    [left, right] = text.split('.');
  } else {
    left = text;
    right = '';
  }
  for (const ch of left + right) {
    if (ch < '0' || ch > '9') {
      throw new InvalidAddressError(
        `"${text}" contains non-digit character "${ch}"`
      );
    }
  }
  return { leftDigits: [...left], rightDigits: [...right], hadDot: dotCount === 1 };
}

function parseSpindle(spindle, floor) {
  if (spindle == null || spindle === '') {
    return { digits: [], hasStar: false };
  }
  let s = String(spindle);
  const hasStar = s.endsWith('*');
  if (hasStar) s = s.slice(0, -1);
  if (s === '') return { digits: [], hasStar };

  const { leftDigits: leftRaw, rightDigits, hadDot } = parseAddress(s);
  let leftDigits = leftRaw;

  if (floor >= 1 && hadDot && leftDigits.length > floor) {
    throw new InvalidAddressError(
      `"${s}" has ${leftDigits.length} digits left of decimal; exceeds floor ` +
      `${floor} (the dot anchors pscale 0 at the floor, so left-of-decimal ` +
      `digits cannot exceed floor depth)`
    );
  }

  if (floor > 1 && leftDigits.length < floor) {
    leftDigits = Array(floor - leftDigits.length).fill('0').concat(leftDigits);
  }

  let digits = leftDigits.concat(rightDigits);

  while (digits.length > 1 && digits[digits.length - 1] === '0') {
    digits.pop();
  }

  return { digits, hasStar };
}

function formatAddress(digits, floor) {
  let d = digits.slice();
  while (d.length > 1 && d[d.length - 1] === '0') d.pop();
  if (d.length === 0) return '';
  if (d.length <= floor) {
    while (d.length > 1 && d[0] === '0') d = d.slice(1);
    return d.join('');
  }
  let left = d.slice(0, floor);
  const right = d.slice(floor);
  while (left.length > 1 && left[0] === '0') left = left.slice(1);
  return left.join('') + '.' + right.join('');
}

// Lock-key derivation. Empty spindle (or a spindle addressing the underscore
// via '0' / '_') always maps to the '_' lock — that's whole-block replace and
// underscore-of-root writes. Otherwise the lock is per-position: for sed:/grain:
// the first dotted segment names the registrant/side position (multi-digit
// like '11', '12', '111'); for ordinary blocks the first digit of the
// FLOOR-AWARE-PARSED path names the branch. After parseSpindle's floor pad,
// "34.5" at floor 2 keeps lock key '3'; the same address at floor 3 (block
// has grown an underscore layer) locks at '_' because the walk now starts
// with '_' '3' '4' '5'. Locks follow the walk.
function lockKeyForWrite(blockName, spindle, block) {
  if (!spindle) return '_';
  const cleaned = String(spindle).replace(/\*$/, '');
  if (blockName.startsWith('sed:') || blockName.startsWith('grain:')) {
    const firstSegment = cleaned.split('.')[0];
    if (!firstSegment || firstSegment === '0' || firstSegment === '_') return '_';
    return firstSegment;
  }
  const fl = floorDepth(block ?? {});
  const { digits } = parseSpindle(cleaned, fl);
  if (!digits.length) return '_';
  const firstDigit = digits[0];
  if (firstDigit === '0' || firstDigit === '_') return '_';
  return firstDigit;
}

function hashByBlockName(origin, blockName, position, secret) {
  if (blockName.startsWith('sed:')) {
    return hashSed(secret, blockName.slice(4), position);
  }
  if (blockName.startsWith('grain:')) {
    return hashGrain(secret, blockName.slice(6), position);
  }
  return hashOrdinary(origin, secret, blockName, position);
}

// ── Storage helpers ──

async function loadBlock(origin, name) {
  let stored = await redis.get(blockKey(origin, name));
  if (stored == null && LEGACY_FALLBACK_READS) stored = await redis.get(legacyBlockKey(name));
  return stored ?? null;
}

async function saveBlock(origin, name, block) {
  // Floor invariant backstop (sunstone:1.51): a block is never persisted floor-0.
  // Every creation path seeds `_` (handleStandardWrite, sed, grain) and whole-block
  // writes are gated, so this only trips on a future regression — self-heal + log
  // rather than throw, so the invariant always holds without ever failing a write.
  if (!hasFloor(block)) {
    const healed = repairFloor(name, origin, block);
    if (healed.changed) {
      console.error(`[floor-invariant] seeded a missing floor for "${name}" at saveBlock — a creation path forgot to; investigate`);
      block = healed.block;
    }
  }
  await redis.set(blockKey(origin, name), block);
}

async function loadHashes(origin, name) {
  let stored = await redis.get(locksKey(origin, name));
  if (stored == null && LEGACY_FALLBACK_READS) stored = await redis.get(legacyLocksKey(name));
  return stored ?? {};
}

async function saveHashes(origin, name, hashes) {
  await redis.set(locksKey(origin, name), hashes);
}

async function listBlockNames(origin) {
  // Upstash Redis SCAN-friendly listing. KEYS is fine at this scale; if the
  // surface grows large, switch to SCAN with cursor.
  //
  // Fallback: if no origin-namespaced keys exist, also list legacy unscoped
  // keys so a pre-namespacing deploy's surface index keeps working until the
  // operator runs scripts/migrate-keys.js. (Edge case: a multi-beach Upstash
  // where one beach is still legacy would surface that beach's keys here for
  // any namespaced beach with an empty new namespace — run the migration to
  // resolve.)
  const prefix = `${keyNs(origin)}:block:`;
  const newKeys = await redis.keys(`${prefix}*`);
  const names = newKeys.map(k => k.slice(prefix.length));
  if (names.length === 0) {
    const legacyPrefix = `${LEGACY_NS}:block:`;
    const legacyKeys = await redis.keys(`${legacyPrefix}*`);
    for (const k of legacyKeys) names.push(k.slice(legacyPrefix.length));
  }
  return Array.from(new Set(names)).sort();
}

// ── Presence sweep ──
//
// Presence entries that no client is renewing pile up in the block and are
// rewritten verbatim on every heartbeat, ballooning the SET payload. The
// xstream client already filters stale entries client-side (default 30s
// PRESENCE_STALENESS); the server-side sweep evicts them at write time so
// the stored block matches what's actually displayable.
//
// Threshold is generous (60s = 2x the typical client filter) to never
// accidentally evict a slow-but-live peer. Entries with a malformed `3:`
// timestamp are preserved — better to keep a possibly-valid entry than drop
// one we can't parse. Block-conventions:4.6 — a presence entry has fields
// 1/2/3 and no field 4.

const PRESENCE_SWEEP_MS = 60_000;

function isPresenceEntry(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  return typeof node['1'] === 'string'
    && typeof node['2'] === 'string'
    && typeof node['3'] === 'string'
    && node['4'] === undefined;
}

function sweepStalePresence(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
  const cutoff = Date.now() - PRESENCE_SWEEP_MS;
  const out = {};
  for (const [key, val] of Object.entries(block)) {
    if (key === '_') { out[key] = val; continue; }
    if (!/^[1-9]$/.test(key)) { out[key] = val; continue; }
    if (isPresenceEntry(val)) {
      const ts = Date.parse(val['3']);
      if (Number.isFinite(ts) && ts < cutoff) continue;
      out[key] = val;
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      // Nested supernest slot (11, 12, ...) — recurse. Drop the parent if
      // the recursion left no digit-keyed children.
      const swept = sweepStalePresence(val);
      if (Object.keys(swept).some(k => /^[1-9]$/.test(k))) out[key] = swept;
    } else {
      out[key] = val;
    }
  }
  return out;
}

// ── Shape gate ──
//
// Rejects writes that violate pscale spine rules. Two rules:
//   (1) Only "_" and single digits 1-9 may appear as keys at any level on the
//       spine. "_word" underscore-prefixed siblings (e.g. "_a", "_synthesis")
//       are invisible to the bsp walker — accepting them creates ghost data.
//   (2) Values that are JSON-stringified objects/arrays must be written as
//       objects/arrays directly. Otherwise the walker can't traverse them.
//
// Returns null if shape is valid; returns an error string if not.
function validateShape(content, path = '') {
  if (content == null) return null;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.length > 1 && (trimmed[0] === '{' || trimmed[0] === '[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          return `invalid value at "${path || '<root>'}" — JSON-stringified ${Array.isArray(parsed) ? 'array' : 'object'}; write the structure directly, not as a string`;
        }
      } catch {
        // Not actually JSON, just looks like it. Fine.
      }
    }
    return null;
  }
  if (typeof content !== 'object') return null;
  if (Array.isArray(content)) {
    for (let i = 0; i < content.length; i++) {
      const err = validateShape(content[i], `${path}[${i}]`);
      if (err) return err;
    }
    return null;
  }
  for (const [key, val] of Object.entries(content)) {
    if (key !== '_' && !/^[1-9]$/.test(key)) {
      return `invalid key "${path ? `${path}.` : ''}${key}" — pscale spine accepts only "_" and single digits 1-9 at each level (compound supernest slots like 11 or 234 are stored hierarchically as nested single-digit keys, not literal keys)`;
    }
    const err = validateShape(val, path ? `${path}.${key}` : key);
    if (err) return err;
  }
  return null;
}

// ── BSP walk helpers (whole-block replace and point-write at digit address) ──
//
// Floor-aware: parseSpindle handles the floor-anchor + multi-dot rejection
// per sunstone:1.5. Throws InvalidAddressError on malformed input — caller
// catches and returns 400.

function writeAt(block, address, value) {
  if (!address) return value;
  const fl = floorDepth(block);
  const { digits } = parseSpindle(address, fl);
  if (!digits.length) return value;
  let node = block;
  for (let i = 0; i < digits.length - 1; i++) {
    const key = digits[i] === '0' ? '_' : digits[i];
    const existing = node[key];
    if (typeof existing === 'string') {
      // Subnest-on-growth: preserve the parent's existing semantic at the
      // underscore of the new sub-block before descending. The string moves
      // to _ instead of being silently nuked. Mirrors bsp-mcp's writeAt.
      node[key] = { _: existing };
    } else if (typeof existing !== 'object' || existing === null) {
      node[key] = {};
    }
    node = node[key];
  }
  const lastDigit = digits[digits.length - 1];
  const lastKey = lastDigit === '0' ? '_' : lastDigit;
  node[lastKey] = value;
  return block;
}

function readAt(block, address) {
  if (!address) return block;
  const fl = floorDepth(block);
  const { digits } = parseSpindle(address, fl);
  if (!digits.length) return block;
  let node = block;
  for (const d of digits) {
    if (!node || typeof node !== 'object') return null;
    const key = d === '0' ? '_' : d;
    node = node[key];
  }
  return node ?? null;
}

// ── Canonical bsp() (2026-05-17 model) ──
//
// Port of bsp2-star.py / src/bsp-fn.ts. Wire-level resolution: when a GET
// carries ?pscale=, the beach computes the shape-resolved payload itself
// instead of returning raw JSON for the client to walk. Six shapes:
// block, path-walk, disc, point, path-walk+descent, star.
//
// pscale = floor - depth, with depth 0 (root) off-pscale.
// Disc emission rule: emit at target depth iff final step is digit 1-9,
// OR the entire walk is on the root underscore chain landing on a string
// at target depth (the floor terminus). Intermediate root-chain
// underscore-objects are not separate positions.

function pscaleAtCanonical(depth, floor) {
  if (depth === 0) return null;
  return floor - depth;
}

function depthAtCanonical(pscale, floor) {
  return floor - pscale;
}

function walkDigits(block, digits) {
  let node = block;
  for (const d of digits) {
    const key = d === '0' ? '_' : d;
    if (!node || typeof node !== 'object' || !(key in node)) return null;
    node = node[key];
  }
  return node;
}

function collectUnderscoreCanonical(node) {
  while (node && typeof node === 'object' && '_' in node) {
    node = node._;
  }
  return typeof node === 'string' ? node : null;
}

function semanticOf(node) {
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object') return collectUnderscoreCanonical(node);
  return null;
}

function splitStarOnSpindle(spindle) {
  if (spindle == null) return { pre: null, post: null, hasStar: false };
  const s = String(spindle);
  if (!s.includes('*')) return { pre: s, post: null, hasStar: false };
  const parts = s.split('*');
  if (parts.length !== 2) {
    throw new InvalidAddressError(`"${s}": star operator appears more than once`);
  }
  return {
    pre: parts[0].length > 0 ? parts[0] : null,
    post: parts[1].length > 0 ? parts[1] : null,
    hasStar: true,
  };
}

function buildPathWalkCanonical(block, digits, floor) {
  const entries = [];
  for (let i = 1; i <= digits.length; i++) {
    const prefix = digits.slice(0, i);
    const node = walkDigits(block, prefix);
    entries.push({
      address: formatAddress(prefix, floor),
      depth: i,
      pscale: pscaleAtCanonical(i, floor),
      content: semanticOf(node),
    });
  }
  return entries;
}

function collectDiscCanonical(block, targetDepth, floor) {
  if (targetDepth < 1) return [];
  const results = [];
  function recurse(node, depth, walked) {
    if (depth === targetDepth) {
      const onChainIntermediate =
        walked.length > 0 &&
        walked.every((w) => w === '0') &&
        node !== null &&
        typeof node === 'object';
      if (!onChainIntermediate) {
        results.push({
          address: formatAddress(walked, floor),
          content: semanticOf(node),
        });
      }
      return;
    }
    if (!node || typeof node !== 'object') return;
    if ('_' in node) {
      const u = node._;
      if (u && typeof u === 'object') {
        recurse(u, depth + 1, walked.concat(['0']));
      } else if (typeof u === 'string') {
        const onFloorChain = walked.every((w) => w === '0');
        if (onFloorChain && depth + 1 === targetDepth) {
          results.push({
            address: formatAddress(walked.concat(['0']), floor),
            content: u,
          });
        }
      }
    }
    for (const d of '123456789') {
      if (d in node) {
        recurse(node[d], depth + 1, walked.concat([d]));
      }
    }
  }
  recurse(block, 0, []);
  return results;
}

function collectDescentCanonical(terminus, walked, floor, layers) {
  const results = [];
  if (layers <= 0 || !terminus || typeof terminus !== 'object') return results;
  let frontier = [[terminus, walked]];
  for (let layer = 1; layer <= layers; layer++) {
    const next = [];
    for (const [node, path] of frontier) {
      if (!node || typeof node !== 'object') continue;
      for (const d of '123456789') {
        if (d in node) {
          const child = node[d];
          const childDepth = path.length + 1;
          results.push({
            address: formatAddress(path.concat([d]), floor),
            depth: childDepth,
            pscale: pscaleAtCanonical(childDepth, floor),
            content: semanticOf(child),
          });
          if (child && typeof child === 'object') {
            next.push([child, path.concat([d])]);
          }
        }
      }
    }
    frontier = next;
  }
  return results;
}

function bspCanonical(block, spindle, pscale) {
  const floor = floorDepth(block);
  const { pre, post, hasStar } = splitStarOnSpindle(spindle);
  if (hasStar) {
    const preDigits = pre ? parseSpindle(pre, floor).digits : [];
    const terminus = walkDigits(block, preDigits);
    let sem = null;
    let inner = null;
    if (terminus && typeof terminus === 'object') {
      sem = collectUnderscoreCanonical(terminus);
      const hidden = terminus._;
      if (hidden && typeof hidden === 'object') {
        inner = bspCanonical(hidden, post, pscale);
      }
    } else if (typeof terminus === 'string') {
      sem = terminus;
    }
    return { floor, shape: 'star', spindle: spindle ?? null, semantic: sem, inner };
  }

  const { digits } = parseSpindle(spindle, floor);

  if (digits.length === 0 && (pscale === null || pscale === undefined)) {
    return { floor, shape: 'block', block };
  }

  if (digits.length === 0) {
    const target = depthAtCanonical(pscale, floor);
    return {
      floor,
      shape: 'disc',
      pscale,
      target_depth: target,
      entries: collectDiscCanonical(block, target, floor),
    };
  }

  const pEnd = floor - digits.length;

  if (pscale === null || pscale === undefined) {
    return {
      floor,
      shape: 'path-walk',
      spindle: spindle ?? null,
      entries: buildPathWalkCanonical(block, digits, floor),
    };
  }

  if (pscale >= pEnd) {
    const target = depthAtCanonical(pscale, floor);
    if (target < 1 || target > digits.length) {
      return {
        floor,
        shape: 'point',
        spindle: spindle ?? null,
        pscale,
        content: null,
        note: `pscale ${pscale} is off the spindle (depth ${target})`,
      };
    }
    const prefix = digits.slice(0, target);
    const node = walkDigits(block, prefix);
    return {
      floor,
      shape: 'point',
      spindle: spindle ?? null,
      pscale,
      depth: target,
      address: formatAddress(prefix, floor),
      content: semanticOf(node),
    };
  }

  const target = depthAtCanonical(pscale, floor);
  const layers = target - digits.length;
  const terminus = walkDigits(block, digits);
  return {
    floor,
    shape: 'path-walk+descent',
    spindle: spindle ?? null,
    pscale,
    path_walk: buildPathWalkCanonical(block, digits, floor),
    descent: collectDescentCanonical(terminus, digits, floor, layers),
  };
}

function spindleParam(q) {
  const s = q?.spindle;
  if (Array.isArray(s)) return s[0] ?? '';
  return s ?? '';
}

function blockParam(q) {
  const b = q?.block;
  if (Array.isArray(b)) return b[0] || null;
  return b || null;
}

function blockParamFromBody(body) {
  const b = body?.block;
  if (Array.isArray(b)) return b[0] || null;
  if (typeof b === 'string' && b) return b;
  return null;
}

// ── Sed: substrate — atomic position allocation ──
//
// Floor-2 minimum. Valid positions contain digits 1-9 only (no 0). Sequence:
// 11, 12, ..., 19, 21, ..., 99, 111, 112, ..., 999, 1111, ...
function nextValidPosition(positionHashes) {
  let n = 11;
  while (n < 1_000_000) {
    const s = String(n);
    if (!s.includes('0') && !positionHashes[s]) return s;
    n++;
  }
  throw new Error('No valid position found below 1,000,000.');
}

async function handleSedRegister(origin, collective, body) {
  const { declaration, passphrase, shell_ref } = body || {};
  if (!declaration || !passphrase) {
    return { status: 400, body: { error: 'sed register requires {declaration, passphrase}', code: 'invalid_shape' } };
  }
  const positionContent = shell_ref ? { _: declaration, '1': shell_ref } : declaration;
  const shapeErr = validateShape(positionContent);
  if (shapeErr) {
    return { status: 400, body: { error: shapeErr, code: 'invalid_shape' } };
  }
  const blockName = `sed:${collective}`;
  let block = await loadBlock(origin, blockName);
  if (!block) {
    block = { _: `sed: collective ${collective} hosted at ${origin}` };
  }
  const hashes = await loadHashes(origin, blockName);
  let position;
  try {
    position = nextValidPosition(hashes);
  } catch (e) {
    return { status: 500, body: { error: String(e.message || e), code: 'no_position' } };
  }
  writeAt(block, position, positionContent);
  hashes[position] = hashSed(passphrase, collective, position);
  await saveBlock(origin, blockName, block);
  await saveHashes(origin, blockName, hashes);
  return {
    status: 200,
    body: {
      ok: true,
      position,
      address: `sed:${collective}:${position}`
    }
  };
}

// ── Grain: substrate — symmetric reach/accept ──
//
// pair_id is computed client-side and named in the URL (?block=grain:<pair_id>).
// The site enforces the two-phase state machine with per-side locks.
async function handleGrainReach(origin, pairId, body) {
  const { side, agent_id, partner_agent_id, description, my_side_content, my_passphrase } = body || {};
  if (side !== '1' && side !== '2') {
    return { status: 400, body: { error: 'grain reach requires side="1" or side="2"', code: 'invalid_shape' } };
  }
  if (!agent_id || !my_side_content || !my_passphrase) {
    return { status: 400, body: { error: 'grain reach requires {side, agent_id, partner_agent_id, description, my_side_content, my_passphrase}', code: 'invalid_shape' } };
  }
  const sideShapeErr = validateShape(my_side_content);
  if (sideShapeErr) {
    return { status: 400, body: { error: sideShapeErr, code: 'invalid_shape' } };
  }
  const partnerSide = side === '1' ? '2' : '1';
  const blockName = `grain:${pairId}`;
  const existing = await loadBlock(origin, blockName);
  const hashes = await loadHashes(origin, blockName);

  if (!existing) {
    // Establish: write reaching side + reach hint at position 8.
    const block = {
      _: description || '',
      [side]: { _: my_side_content },
      '8': {
        _reach_pending: {
          from: agent_id,
          pair_id: pairId,
          grain_address_yours: `grain:${pairId}:${partnerSide}`,
          grain_address_mine: `grain:${pairId}:${side}`,
          description: description || '',
          reached_at: new Date().toISOString()
        }
      },
      '9': { [side]: agent_id }
    };
    hashes[side] = hashGrain(my_passphrase, pairId, side);
    await saveBlock(origin, blockName, block);
    await saveHashes(origin, blockName, hashes);
    return { status: 200, body: { ok: true, state: 'established', awaiting: partnerSide, pair_id: pairId } };
  }

  // Block exists. Either: partner accept (other side empty) or rewrite of own side.
  if (existing[side] !== undefined) {
    // Own-side rewrite: requires the existing side's secret as my_passphrase.
    const stored = hashes[side];
    if (!stored || hashGrain(my_passphrase, pairId, side) !== stored) {
      return { status: 403, body: { error: `side ${side} is locked`, code: 'lock_required' } };
    }
    existing[side] = { _: my_side_content };
    await saveBlock(origin, blockName, existing);
    return { status: 200, body: { ok: true, state: 'updated', pair_id: pairId } };
  }

  // Partner accept: write the other side, clear position 8, completion.
  existing[side] = { _: my_side_content };
  const existingAgents = (existing['9'] && typeof existing['9'] === 'object') ? existing['9'] : {};
  existing['9'] = { ...existingAgents, [side]: agent_id };
  delete existing['8'];
  hashes[side] = hashGrain(my_passphrase, pairId, side);
  await saveBlock(origin, blockName, existing);
  await saveHashes(origin, blockName, hashes);
  return { status: 200, body: { ok: true, state: 'completed', pair_id: pairId } };
}

// ── Standard bsp-mcp write shape (any block) ──

async function handleStandardWrite(origin, blockName, body) {
  const { spindle = '', content, secret, new_lock, confirm, append } = body || {};

  // APPEND mode — atomic next-slot allocation with supernest-on-rollover
  // (sunstone:1.63). THE accumulator write: marks, history, pools. The handler
  // picks the next free zero-free slot and wraps the whole block {_: old} when
  // the floor fills, so every client gets correct floor-growth without computing
  // slots itself, and concurrent appends never race on allocation.
  if (append === true) {
    if (content === undefined) {
      return { status: 400, body: { error: 'append requires content', code: 'invalid_shape' } };
    }
    const shapeErr = validateShape(content);
    if (shapeErr) {
      return { status: 400, body: { error: shapeErr, code: 'invalid_shape' } };
    }
    // Whole-accumulator authority: the `_` lock governs append (an accumulator
    // is locked or open as a unit; per-slot locks don't fit an append stream).
    const hashes = await loadHashes(origin, blockName);
    if (hashes['_']) {
      if (!secret || hashByBlockName(origin, blockName, '_', secret) !== hashes['_']) {
        return { status: 403, body: { error: `append to "${blockName}" requires the accumulator secret`, code: 'lock_required' } };
      }
    }
    const existing = await loadBlock(origin, blockName);
    const r = appendWithSupernest(blockName, origin, existing, content);
    let block = r.block;
    if (blockName === 'presence') block = sweepStalePresence(block);
    await saveBlock(origin, blockName, block);
    return { status: 200, body: { ok: true, slot: r.slot, supernested: r.supernested, floor: r.floor } };
  }

  // Shape gate: reject _word keys and JSON-stringified sub-objects on writes.
  if (content !== undefined) {
    const shapeErr = validateShape(content);
    if (shapeErr) {
      return { status: 400, body: { error: shapeErr, code: 'invalid_shape' } };
    }
  }
  // Sibling blocks that don't exist yet are created on first write — the
  // handler is permissive about block creation. Blocks start from {} unless
  // content is a whole-block payload.
  const existing = await loadBlock(origin, blockName);
  let block = existing;
  if (block == null) {
    // Allow creation: the body is either a whole-block payload (spindle empty)
    // or a sub-position write that scaffolds the block.
    block = (spindle === '' && content && typeof content === 'object' && !Array.isArray(content))
      ? null  // we'll replace the block entirely below
      : { _: defaultIdentity(blockName, origin) };  // sub-position create — seed a floor (sunstone:1.51); never born floor-0
  }
  // Whole-block REPLACE of an existing block is destructive — require explicit
  // confirm:true. Initialising a new block has no prior state to clobber, so
  // confirm is unnecessary (and avoids friction on the legitimate first write
  // for a sibling block that doesn't exist yet).
  if (content !== undefined && !spindle && existing != null && confirm !== true) {
    return { status: 400, body: { error: 'whole-block replace requires {confirm: true}', code: 'confirm_required' } };
  }
  const hashes = await loadHashes(origin, blockName);
  let lockKey;
  try {
    lockKey = lockKeyForWrite(blockName, spindle, block);
  } catch (e) {
    if (e instanceof InvalidAddressError) {
      return { status: 400, body: { error: e.message, code: 'invalid_address' } };
    }
    throw e;
  }
  const stored = hashes[lockKey];

  // Lock check for content writes.
  if (content !== undefined && stored) {
    if (!secret) {
      return { status: 403, body: { error: `position "${lockKey}" of "${blockName}" is locked, secret required`, code: 'lock_required' } };
    }
    if (hashByBlockName(origin, blockName, lockKey, secret) !== stored) {
      return { status: 403, body: { error: 'secret does not match', code: 'lock_required' } };
    }
  }

  // Lock-rotation authority.
  if (new_lock !== undefined && stored) {
    if (!secret || hashByBlockName(origin, blockName, lockKey, secret) !== stored) {
      return { status: 403, body: { error: 'lock rotation requires current secret', code: 'lock_required' } };
    }
  }

  if (content !== undefined) {
    if (!spindle) {
      // Whole-block replace — must carry a floor; a block is never stored
      // without an identity underscore (sunstone:1.51).
      if (!hasFloor(content)) {
        return { status: 400, body: { error: 'whole-block content has no floor — the root must carry a `_` whose chain reaches an identity string (sunstone:1.51)', code: 'no_floor' } };
      }
      block = content;
    } else {
      if (block == null) block = { _: defaultIdentity(blockName, origin) };
      try {
        writeAt(block, String(spindle), content);
      } catch (e) {
        if (e instanceof InvalidAddressError) {
          return { status: 400, body: { error: e.message, code: 'invalid_address' } };
        }
        throw e;
      }
    }
    if (blockName === 'presence') block = sweepStalePresence(block);
    await saveBlock(origin, blockName, block);
  } else if (block == null) {
    // No content and no existing block — nothing to do unless we're locking.
    block = {};
  }

  if (new_lock !== undefined) {
    hashes[lockKey] = hashByBlockName(origin, blockName, lockKey, new_lock);
    await saveHashes(origin, blockName, hashes);
  }

  return { status: 200, body: { ok: true } };
}

// ── HTTP entry ──

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const blockName = ((req.method === 'POST' || req.method === 'DELETE') && blockParamFromBody(req.body)) || blockParam(req.query);
  const origin = originFromHost(req.headers && req.headers.host);

  if (req.method === 'GET') {
    if (!blockName) {
      // Derived index: list named blocks at this surface. The surface is the
      // beach; the blocks listed are what's actually here.
      const blocks = await listBlockNames(origin);
      return res.status(200).json({
        _: `URL surface at ${origin}. Named sibling blocks listed below; address each via ?block=<name>. Substrate-wide conventions at bsp(agent_id='pscale', block='block-conventions').`,
        origin,
        blocks
      });
    }
    const block = await loadBlock(origin, blockName);
    if (block == null) {
      return res.status(404).json({ error: `block "${blockName}" not found`, code: 'not_found' });
    }
    const spindle = spindleParam(req.query);
    // Wire-level canonical resolution: when ?pscale= is present, the beach
    // returns a shape-resolved canonical bsp() result instead of raw JSON
    // for the client to walk. Backward-compatible: GET without ?pscale=
    // keeps the legacy behaviour (whole block or raw subtree).
    const pscaleRaw = req.query?.pscale;
    const hasPscale = pscaleRaw !== undefined && pscaleRaw !== '';
    // A star spindle ("…*") MUST resolve as a star shape. readAt() strips the
    // trailing '*' and returns the raw pre-star node, silently dropping the
    // hidden directory — so route any star read through bspCanonical whether or
    // not ?pscale= was supplied. Non-star, no-pscale reads keep the legacy
    // raw-node / whole-block behaviour. (Contract-drift fix 2026-05-30.)
    const spindleHasStar = typeof spindle === 'string' && spindle.includes('*');
    let payload;
    try {
      if (hasPscale || spindleHasStar) {
        let pscaleNum = null;
        if (hasPscale) {
          pscaleNum = parseInt(Array.isArray(pscaleRaw) ? pscaleRaw[0] : pscaleRaw, 10);
          if (Number.isNaN(pscaleNum)) {
            return res.status(400).json({ error: `?pscale=${pscaleRaw} is not an integer`, code: 'invalid_pscale' });
          }
        }
        payload = bspCanonical(block, spindle || null, pscaleNum);
      } else {
        payload = spindle ? readAt(block, spindle) : block;
      }
    } catch (e) {
      if (e instanceof InvalidAddressError) {
        return res.status(400).json({ error: e.message, code: 'invalid_address' });
      }
      throw e;
    }
    return res.status(200).json(payload);
  }

  if (req.method === 'POST') {
    if (!blockName) {
      return res.status(400).json({ error: 'block name required (pass ?block=<name> or "block" in body)', code: 'invalid_shape' });
    }
    const body = req.body || {};

    // Substrate-action dispatch (sed:/grain: state machines).
    let result;
    if (blockName.startsWith('sed:') && body.action === 'register') {
      result = await handleSedRegister(origin, blockName.slice(4), body);
    } else if (blockName.startsWith('grain:') && body.action === 'reach') {
      result = await handleGrainReach(origin, blockName.slice(6), body);
    } else {
      // Standard bsp-mcp shape: {spindle, content, secret?, new_lock?, gray?}
      // Works for any block name including substrate-prefixed ones (per-
      // position lock derivation handled by lockKeyForWrite/hashByBlockName).
      result = await handleStandardWrite(origin, blockName, body);
    }
    return res.status(result.status).json(result.body);
  }

  if (req.method === 'DELETE') {
    if (!blockName) {
      return res.status(400).json({
        error: 'block name required (pass ?block=<name> or "block" in body)',
        code: 'invalid_shape'
      });
    }
    // Wipe a sibling block — removes both the block and its lock-set from KV.
    // Auth is the `_` lock (whole-block authority): if set, the secret must
    // match; if unset, the block is unowned and wipe proceeds (consistent
    // with how unlocked whole-block-replace already behaves at "_").
    //
    // Substrate-prefixed blocks are not wipeable here — sed:/grain: have
    // their own lifecycle and auth models, separate concern.
    if (blockName.startsWith('sed:') || blockName.startsWith('grain:')) {
      return res.status(405).json({
        error: 'wipe not supported on substrate-prefixed blocks',
        code: 'invalid_shape'
      });
    }
    const body = req.body || {};
    if (body.confirm !== true) {
      return res.status(400).json({
        error: 'wipe requires {confirm: true}',
        code: 'confirm_required'
      });
    }
    const existing = await redis.get(blockKey(origin, blockName));
    if (existing == null) {
      return res.status(404).json({
        error: `block "${blockName}" not found`,
        code: 'not_found'
      });
    }
    const hashes = await loadHashes(origin, blockName);
    const stored = hashes._;
    if (stored) {
      const secret = body.secret;
      if (!secret) {
        return res.status(403).json({
          error: `block "${blockName}" is locked at "_", secret required`,
          code: 'lock_required'
        });
      }
      if (hashByBlockName(origin, blockName, '_', secret) !== stored) {
        return res.status(403).json({
          error: 'secret does not match',
          code: 'lock_required'
        });
      }
    }
    await redis.del(blockKey(origin, blockName));
    await redis.del(locksKey(origin, blockName));
    await redis.del(legacyBlockKey(blockName));
    await redis.del(legacyLocksKey(blockName));
    return res.status(200).json({ ok: true, wiped: blockName });
  }

  return res.status(405).json({ error: 'Method not allowed', code: 'invalid_shape' });
}
