#!/usr/bin/env node
// thornwood-rig.mjs — headless test rig for the SUBJECTIVE Thornwood RPG.
//
// A self-contained sandpit. The runner stands up the REAL pscale-beach handler
// over a throwaway temp folder (the file-redis shim — no network, no Upstash, no
// apex, production untouched), seeds the Thornwood cartridge into it, and drives
// the subjective loop headless with a character-LLM in every seat.
//
// Two properties make it TIGHT by construction — the two leaks we hit in the app
// closed at the harness layer, not begged of an LLM directive:
//   1. ROUTING. The runner is code; it pins the local beach on every call. There
//      is no default-beach fallback to slip to — the apex cannot be reached.
//   2. PERCEPTION. composeWindow() builds each character's window from ONLY that
//      character's own witnessed:/knows: plus the PUBLIC pool. Fog-of-war is a
//      property of what the runner feeds the LLM, not of the LLM's restraint.
//
// The rules are DATA under test: function:thornwood (the soft/resolve directives)
// and rules:nomad/rules:thornwood are READ from the beach and handed to the LLMs
// as system prompts. Edit a block, re-run, watch the rule change — no code change.
//
//   node scripts/thornwood-rig.mjs [--turns N] [--keep] [--model <id>]
//
// LLM seats: real Claude when ANTHROPIC_API_KEY is set; otherwise a deterministic
// stub, so the loop and every substrate write can be verified with no API call.
//
// NOTE ON MODEL: the runner is a test HARNESS (one orchestrator sequencing turns).
// Production play is distributed + in-loop (the atomic-claim resolver). The RULES
// under test are the same; the execution model differs. Rules proven here are
// committed to the production beach, where they run in-loop.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { FileRedis } from './file-redis.mjs';

// ── args ──
const argv = process.argv;
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); if (i < 0) return d; const v = argv[i + 1]; return (v && !v.startsWith('--')) ? v : true; };
const TURNS = parseInt(arg('turns', '2'), 10);
const KEEP = !!arg('keep', false);
const MODEL = arg('model', 'claude-sonnet-4-6');
const SNAPSHOT = arg('snapshot', null);   // save the final sandpit state to this dir (a fork-point)
const FROM = arg('from', null);           // fork: start from this snapshot dir instead of re-seeding
const PACK = join(import.meta.dirname, '..', 'packs', 'thornwood');
const ORIGIN = 'localhost:rig';
const SECRET = 'thorn142';            // rig: all cartridge locks share this
const ROOM = 'beaten-drum-main';
const CHARS = ['cyrus', 'anya', 'fenn'];

// ── in-process file-beach (the real handler over a temp folder) ──
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';
process.env.BEACH_ORIGIN = ORIGIN;
const dir = await fs.mkdtemp(join(os.tmpdir(), 'thornwood-rig-'));
if (FROM) await fs.cp(FROM, dir, { recursive: true });   // fork a prior snapshot into a fresh sandpit
const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
__setRedis(new FileRedis(dir));

function beachCall(method, block, q = {}, body) {
  return new Promise((resolve) => {
    const query = {};
    if (block !== undefined) query.block = block;
    if (q.spindle !== undefined) query.spindle = q.spindle;
    if (q.pscale !== undefined) query.pscale = String(q.pscale);
    const req = { method, query, body: body || {}, headers: { host: ORIGIN }, url: '/.well-known/pscale-beach' };
    let status = 200;
    const res = {
      setHeader() {},
      status(c) { status = c; return this; },
      json(obj) { resolve({ status, body: obj }); },
      end() { resolve({ status, body: {} }); },
    };
    Promise.resolve(handler(req, res)).catch((e) => resolve({ status: 500, body: { error: String(e?.message || e) } }));
  });
}
const getBlock = async (name) => (await beachCall('GET', name)).body;
const appendBlock = (name, entry, secret) => beachCall('POST', name, {}, { append: true, content: entry, ...(secret ? { secret } : {}) });

// ── seed the cartridge ──
async function seed() {
  let n = 0;
  for (const sub of ['definition', 'initial']) {
    let files; try { files = await fs.readdir(join(PACK, sub)); } catch { continue; }
    for (const f of files.filter((x) => x.endsWith('.json'))) {
      const blk = JSON.parse(await fs.readFile(join(PACK, sub, f), 'utf8'));
      const content = JSON.parse(JSON.stringify(blk.content).replaceAll('{{BEACH}}', `http://${ORIGIN}`));
      const body = { spindle: '', content, confirm: true };
      if (blk.lock) body.new_lock = SECRET;
      const r = await beachCall('POST', blk.name, {}, body);
      if (r.status < 200 || r.status >= 300) throw new Error(`seed ${blk.name}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
      n++;
    }
  }
  return n;
}

// ── honest dice: exploding-d10 luck, sha256-seeded (mirrors pool.ts) ──
function luck(seed) {
  let h = crypto.createHash('sha256').update(seed).digest(); let i = 0;
  const byte = () => { if (i >= h.length) { h = crypto.createHash('sha256').update(h).digest(); i = 0; } return h[i++]; };
  const d10 = () => (byte() % 10) + 1;
  const explode = () => { let t = 0, r; do { r = d10(); t += r; } while (r === 10); return t; };
  const pos = explode(), neg = explode();
  return { pos, neg, luck: pos - neg };
}

// ── the LLM seat: real Claude if keyed, else a deterministic stub ──
const KEY = process.env.ANTHROPIC_API_KEY;
const BASE = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
async function think(label, system, user) {
  if (!KEY) return stub(label, user);
  const r = await fetch(`${BASE}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 800, system, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return (j.content || []).map((c) => c.text || '').join('').trim();
}
function stub(label, user) {
  const turn = (user.match(/\[TURN (\d+)\]/) || [])[1] || '?';
  const who = (user.match(/\[YOU ARE (\w+)\]/) || [])[1] || '?';
  if (label === 'act') return `${who} reads the room and makes one careful move. [stub act · turn ${turn}]`;
  if (label === 'resolve') return `at the hearth the three trade measured words; nothing breaks, a thread opens. [stub skeleton · turn ${turn}]`;
  if (label === 'judge') return `(stub observer) CONSISTENCY 3 — stub beats repeat verbatim. PERSISTENCE 2 — stub state does not evolve. PERCEPTION-LIMITS 5 — no private data ever entered a window, by construction. AGENCY 2 — stub acts are inert. OVERALL: plumbing sound; narrative is placeholder. BIGGEST WEAKNESS: run with a real key to actually exercise the rules.`;
  return `You take in what just passed and hold your place, watching. [stub render · ${who} · turn ${turn}]`;
}

// ── helpers ──
const j = (o) => JSON.stringify(o, null, 1);
function poolSince(pool, marker) {
  const out = [];
  if (!pool || typeof pool !== 'object') return { events: out, last: marker };
  let last = marker;
  for (let n = 1; n <= 200; n++) {
    const v = pool[String(n)];
    if (v == null) continue;
    if (n <= marker) continue;
    const text = typeof v === 'string' ? v : (v && typeof v._ === 'string' ? v._ : '');
    if (text) out.push({ slot: n, text });
    if (n > last) last = n;
  }
  return { events: out, last };
}

// ── the subjective loop ──
async function run() {
  console.error(`[rig] sandpit ${dir}`);
  if (FROM) console.error(`[rig] forked from snapshot ${FROM} (no re-seed)`);
  else console.error(`[rig] seeded ${await seed()} blocks`);
  console.error(`[rig] model=${KEY ? MODEL : 'STUB (no ANTHROPIC_API_KEY)'} · turns=${TURNS}`);

  const softDir = (await getBlock('function:thornwood'))?.['1'] ?? '(no soft directive)';
  const resolveDir = (await getBlock('function:thornwood'))?.['2'] ?? '(no resolve directive)';
  const nomad = j(await getBlock('rules:nomad'));
  const placeRules = j(await getBlock('rules:thornwood'));
  const markers = Object.fromEntries(CHARS.map((h) => [h, 0]));

  for (let turn = 1; turn <= TURNS; turn++) {
    console.log(`\n${'='.repeat(64)}\nTURN ${turn}\n${'='.repeat(64)}`);

    // 1. ACT — each character perceives its OWN window and acts.
    const intentions = [];
    for (const h of CHARS) {
      const witnessed = await getBlock(`witnessed:${h}`);
      const knows = await getBlock(`knows:${h}`);
      const passport = await getBlock(`passport:${h}`);
      const pool = await getBlock(`pool:${ROOM}`);
      const { events } = poolSince(pool, markers[h]);
      const user =
`[TURN ${turn}] [YOU ARE ${h}]

YOUR ACCOUNT SO FAR (your private history):
${j(witnessed)}

NAMES YOU KNOW (use these; otherwise render by appearance):
${j(knows)}

YOUR CAPABILITY & LOCATION (passport):
${j(passport)}

THE PLACE'S RULES:
${placeRules}

NEW IN THE ROOM SINCE YOU LAST LOOKED (public events):
${events.length ? events.map((e) => `- ${e.text}`).join('\n') : '(nothing new)'}

What does ${h} do now? Answer with the action only, in ${h}'s voice.`;
      const intention = await think('act', softDir, user);
      intentions.push({ h, intention, passport });
      console.log(`\n— ${h} acts —\n${intention}`);
    }

    // 2. RESOLVE — one medium reads the whole window + capabilities + dice.
    const dice = luck(`${ROOM}:turn:${turn}:${intentions.map((i) => i.intention).join('|')}`);
    const resolveUser =
`[TURN ${turn}] Resolve this window into ONE public event-skeleton.

THE ACTING CHARACTERS AND THEIR INTENTIONS:
${intentions.map((i) => `- ${i.h}: ${i.intention}`).join('\n')}

THEIR CAPABILITY (Character Force, from passports):
${intentions.map((i) => `- ${i.h}: ${i.passport?.['1'] ?? ''}`).join('\n')}

THE PLACE'S RULES (Situation Force):
${placeRules}

THE DICE (exploding-d10 luck, fixed): positive ${dice.pos}, negative ${dice.neg}, luck ${dice.luck > 0 ? '+' : ''}${dice.luck}.

THE RESOLUTION SYSTEM:
${nomad}

Write ONE terse PUBLIC event-skeleton — actors by handle, never a name only one character has earned.`;
    const skeleton = await think('resolve', resolveDir, resolveUser);
    await appendBlock(`pool:${ROOM}`, { _: skeleton, 1: 'rig-resolver', 3: new Date().toISOString() });
    console.log(`\n>>> RESOLVED (public skeleton) >>>\n${skeleton}`);

    // 3. PERCEIVE + JOURNAL — each character renders the beat through its OWN
    //    knowledge into its OWN witnessed: spine.
    for (const h of CHARS) {
      const witnessed = await getBlock(`witnessed:${h}`);
      const knows = await getBlock(`knows:${h}`);
      const user =
`[TURN ${turn}] [YOU ARE ${h}]

YOUR ACCOUNT SO FAR:
${j(witnessed)}

NAMES YOU KNOW:
${j(knows)}

WHAT JUST HAPPENED IN THE ROOM (public, by handle):
${skeleton}

Render this beat as ${h}'s OWN private account — second person, present tense, names only as ${h} knows them (otherwise by appearance). One short paragraph.`;
      const beat = await think('render', softDir, user);
      const loc = witnessed?.['1']?.['2'] ?? `*:http://${ORIGIN}:spatial:thornwood:111`;
      await appendBlock(`witnessed:${h}`, { _: beat, 1: h, 2: loc, 3: new Date().toISOString() }, SECRET);
      const m = poolSince(await getBlock(`pool:${ROOM}`), markers[h]); markers[h] = m.last;
      console.log(`\n  · ${h} (journaled to witnessed:${h}) ·\n  ${beat.replace(/\n/g, '\n  ')}`);
    }
  }

  // ── final state + the OBSERVER seat (judge the run on the rule-criteria) ──
  console.log(`\n${'#'.repeat(64)}\nFINAL STATE\n${'#'.repeat(64)}`);
  const digest = [];
  for (const h of CHARS) {
    const w = await getBlock(`witnessed:${h}`);
    const beats = Object.keys(w).filter((k) => k !== '_').sort();
    const lines = beats.map((k) => (typeof w[k] === 'object' ? w[k]._ : w[k]) || '');
    console.log(`\nwitnessed:${h} — ${beats.length} beats`);
    for (const t of lines) console.log(`  · ${t.slice(0, 200)}`);
    digest.push(`=== witnessed:${h} (${h}'s private account) ===\n${lines.join('\n')}`);
  }
  const pool = await getBlock(`pool:${ROOM}`);
  const slots = Object.keys(pool).filter((k) => k !== '_').sort();
  const poolLines = slots.map((k) => (typeof pool[k] === 'object' ? pool[k]._ : pool[k]) || '');
  console.log(`\npool:${ROOM} — ${slots.length} public skeletons`);
  for (const t of poolLines) console.log(`  · ${t.slice(0, 200)}`);
  digest.push(`=== pool:${ROOM} (the public record, by handle) ===\n${poolLines.join('\n')}`);

  const judgeSys = `You are the OBSERVER of an RPG test run — the inter-subjective correlation across the players' separate private accounts, never a player yourself. Judge the run on four criteria; for EACH give a score 1-5 and ONE terse sentence of evidence. (1) CONSISTENCY — coherent across turns and across the characters' separate accounts? (2) PERSISTENCE — do consequences endure and propagate into later beats? (3) PERCEPTION-LIMITS — does each account stay within what that character could know, with no leaked name or private fact? (4) AGENCY — do the characters' chosen actions actually shift outcomes? Close with two lines: OVERALL and BIGGEST RULE-WEAKNESS TO FIX.`;
  const verdict = await think('judge', judgeSys, digest.join('\n\n'));
  console.log(`\n${'#'.repeat(64)}\nOBSERVER VERDICT (the rules under test)\n${'#'.repeat(64)}\n${verdict}`);
}

try {
  await run();
} catch (e) {
  console.error(`[rig] ERROR: ${e?.stack || e}`);
  process.exitCode = 1;
} finally {
  if (SNAPSHOT) { await fs.cp(dir, SNAPSHOT, { recursive: true }); console.error(`\n[rig] snapshot saved → ${SNAPSHOT}`); }
  if (KEEP) console.error(`[rig] sandpit kept at ${dir}`);
  else { await fs.rm(dir, { recursive: true, force: true }); console.error(`[rig] sandpit discarded`); }
}
