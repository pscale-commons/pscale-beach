import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';

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
//   whole-block replace and requires {confirm: true}.
//
//   Supernest-on-growth: when the descent path crosses an intermediate
//   node holding a string, the string migrates to the new sub-block's
//   underscore (block[k] = "old" becomes block[k] = {_: "old", ...})
//   so the parent's semantic survives the appearance of children.

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN
});

// BEACH_ORIGIN is the host's bare domain (no scheme), e.g. "idiothuman.com".
// It is part of the ordinary-block lock salt — locks set on this beach must
// hash under this exact origin. Changing it after blocks are locked breaks
// those locks.
const ORIGIN = process.env.BEACH_ORIGIN;
if (!ORIGIN) {
  throw new Error('BEACH_ORIGIN env var required (e.g. "idiothuman.com" — bare domain, no scheme)');
}

function blockKey(name) { return `pscale-beach-v2:block:${name}`; }
function locksKey(name) { return `pscale-beach-v2:locks:${name}`; }
const KEY_PREFIX = 'pscale-beach-v2:block:';

// ── Lock hashing — three salt namespaces matching bsp-mcp src/locks.ts ──

function hashOrdinary(secret, blockName, position) {
  // sha256(passphrase + 'block:' + agent_id + ':' + name + ':' + position)
  const salt = `${secret}block:https://${ORIGIN}:${blockName}:${position}`;
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

// Lock-key derivation. Empty spindle (or a spindle addressing the underscore
// via '0' / '_') always maps to the '_' lock — that's whole-block replace and
// underscore-of-root writes. Otherwise the lock is per-position: for sed:/grain:
// the first dotted segment names the registrant/side position (multi-digit
// like '11', '12', '111'); for ordinary blocks the first digit of the
// dot-stripped path names the branch ('1.2.3' and '123' both lock at '1',
// matching writeAt's dot-insensitive walk). The hash salt namespace (chosen
// by hashByBlockName) is what distinguishes ordinary / sed: / grain: at hash
// time. Result: locking '_' on the beach gates only whole-block / underscore
// writes; sub-positions follow per-branch lock state.
function lockKeyForWrite(blockName, spindle) {
  if (!spindle) return '_';
  const cleaned = String(spindle).replace(/\*$/, '');
  if (blockName.startsWith('sed:') || blockName.startsWith('grain:')) {
    const firstSegment = cleaned.split('.')[0];
    if (!firstSegment || firstSegment === '0' || firstSegment === '_') return '_';
    return firstSegment;
  }
  const digits = cleaned.replace(/\./g, '');
  if (!digits) return '_';
  const firstDigit = digits[0];
  if (firstDigit === '0' || firstDigit === '_') return '_';
  return firstDigit;
}

function hashByBlockName(blockName, position, secret) {
  if (blockName.startsWith('sed:')) {
    return hashSed(secret, blockName.slice(4), position);
  }
  if (blockName.startsWith('grain:')) {
    return hashGrain(secret, blockName.slice(6), position);
  }
  return hashOrdinary(secret, blockName, position);
}

// ── Storage helpers ──

async function loadBlock(name) {
  const stored = await redis.get(blockKey(name));
  return stored ?? null;
}

async function saveBlock(name, block) {
  await redis.set(blockKey(name), block);
}

async function loadHashes(name) {
  const stored = await redis.get(locksKey(name));
  return stored ?? {};
}

async function saveHashes(name, hashes) {
  await redis.set(locksKey(name), hashes);
}

async function listBlockNames() {
  // Upstash Redis SCAN-friendly listing. KEYS is fine at this scale; if the
  // surface grows large, switch to SCAN with cursor.
  const keys = await redis.keys(`${KEY_PREFIX}*`);
  return keys.map(k => k.slice(KEY_PREFIX.length)).sort();
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

function writeAt(block, address, value) {
  if (!address) return value;
  const digits = String(address).replace(/\./g, '').replace(/\*$/, '');
  if (!digits) return value;
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
  const digits = String(address).replace(/\./g, '');
  let node = block;
  for (const d of digits) {
    if (!node || typeof node !== 'object') return null;
    const key = d === '0' ? '_' : d;
    node = node[key];
  }
  return node ?? null;
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

async function handleSedRegister(collective, body) {
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
  let block = await loadBlock(blockName);
  if (!block) {
    block = { _: `sed: collective ${collective} hosted at ${ORIGIN}` };
  }
  const hashes = await loadHashes(blockName);
  let position;
  try {
    position = nextValidPosition(hashes);
  } catch (e) {
    return { status: 500, body: { error: String(e.message || e), code: 'no_position' } };
  }
  writeAt(block, position, positionContent);
  hashes[position] = hashSed(passphrase, collective, position);
  await saveBlock(blockName, block);
  await saveHashes(blockName, hashes);
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
async function handleGrainReach(pairId, body) {
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
  const existing = await loadBlock(blockName);
  const hashes = await loadHashes(blockName);

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
    await saveBlock(blockName, block);
    await saveHashes(blockName, hashes);
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
    await saveBlock(blockName, existing);
    return { status: 200, body: { ok: true, state: 'updated', pair_id: pairId } };
  }

  // Partner accept: write the other side, clear position 8, completion.
  existing[side] = { _: my_side_content };
  const existingAgents = (existing['9'] && typeof existing['9'] === 'object') ? existing['9'] : {};
  existing['9'] = { ...existingAgents, [side]: agent_id };
  delete existing['8'];
  hashes[side] = hashGrain(my_passphrase, pairId, side);
  await saveBlock(blockName, existing);
  await saveHashes(blockName, hashes);
  return { status: 200, body: { ok: true, state: 'completed', pair_id: pairId } };
}

// ── Standard bsp-mcp write shape (any block) ──

async function handleStandardWrite(blockName, body) {
  const { spindle = '', content, secret, new_lock, confirm } = body || {};

  // Whole-block replace is destructive — require explicit confirm:true.
  // Prevents accidental wipes from "no-op probes" like {spindle:"", content:{}}.
  if (content !== undefined && !spindle && confirm !== true) {
    return { status: 400, body: { error: 'whole-block replace requires {confirm: true}', code: 'confirm_required' } };
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
  const existing = await loadBlock(blockName);
  let block = existing;
  if (block == null) {
    // Allow creation: the body is either a whole-block payload (spindle empty)
    // or a sub-position write that scaffolds the block.
    block = (spindle === '' && content && typeof content === 'object' && !Array.isArray(content))
      ? null  // we'll replace the block entirely below
      : {};
  }
  const hashes = await loadHashes(blockName);
  const lockKey = lockKeyForWrite(blockName, spindle);
  const stored = hashes[lockKey];

  // Lock check for content writes.
  if (content !== undefined && stored) {
    if (!secret) {
      return { status: 403, body: { error: `position "${lockKey}" of "${blockName}" is locked, secret required`, code: 'lock_required' } };
    }
    if (hashByBlockName(blockName, lockKey, secret) !== stored) {
      return { status: 403, body: { error: 'secret does not match', code: 'lock_required' } };
    }
  }

  // Lock-rotation authority.
  if (new_lock !== undefined && stored) {
    if (!secret || hashByBlockName(blockName, lockKey, secret) !== stored) {
      return { status: 403, body: { error: 'lock rotation requires current secret', code: 'lock_required' } };
    }
  }

  if (content !== undefined) {
    if (!spindle) {
      // Whole-block replace.
      block = content;
    } else {
      if (block == null) block = {};
      writeAt(block, String(spindle), content);
    }
    await saveBlock(blockName, block);
  } else if (block == null) {
    // No content and no existing block — nothing to do unless we're locking.
    block = {};
  }

  if (new_lock !== undefined) {
    hashes[lockKey] = hashByBlockName(blockName, lockKey, new_lock);
    await saveHashes(blockName, hashes);
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

  if (req.method === 'GET') {
    if (!blockName) {
      // Derived index: list named blocks at this surface. The surface is the
      // beach; the blocks listed are what's actually here.
      const blocks = await listBlockNames();
      return res.status(200).json({
        _: `URL surface at ${ORIGIN}. Named sibling blocks listed below; address each via ?block=<name>. Substrate-wide conventions at bsp(agent_id='pscale', block='block-conventions').`,
        origin: ORIGIN,
        blocks
      });
    }
    const block = await loadBlock(blockName);
    if (block == null) {
      return res.status(404).json({ error: `block "${blockName}" not found`, code: 'not_found' });
    }
    const spindle = spindleParam(req.query);
    const payload = spindle ? readAt(block, spindle) : block;
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
      result = await handleSedRegister(blockName.slice(4), body);
    } else if (blockName.startsWith('grain:') && body.action === 'reach') {
      result = await handleGrainReach(blockName.slice(6), body);
    } else {
      // Standard bsp-mcp shape: {spindle, content, secret?, new_lock?, gray?}
      // Works for any block name including substrate-prefixed ones (per-
      // position lock derivation handled by lockKeyForWrite/hashByBlockName).
      result = await handleStandardWrite(blockName, body);
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
    const existing = await redis.get(blockKey(blockName));
    if (existing == null) {
      return res.status(404).json({
        error: `block "${blockName}" not found`,
        code: 'not_found'
      });
    }
    const hashes = await loadHashes(blockName);
    const stored = hashes._;
    if (stored) {
      const secret = body.secret;
      if (!secret) {
        return res.status(403).json({
          error: `block "${blockName}" is locked at "_", secret required`,
          code: 'lock_required'
        });
      }
      if (hashByBlockName(blockName, '_', secret) !== stored) {
        return res.status(403).json({
          error: 'secret does not match',
          code: 'lock_required'
        });
      }
    }
    await redis.del(blockKey(blockName));
    await redis.del(locksKey(blockName));
    return res.status(200).json({ ok: true, wiped: blockName });
  }

  return res.status(405).json({ error: 'Method not allowed', code: 'invalid_shape' });
}
