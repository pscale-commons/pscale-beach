// lib/temporal.js — ported from pscale-commons/bsp-mcp-server src/temporal.ts —
// the sundial's arithmetic; re-port, never fork.
//
// The wire's own clock. Every response this beach serves carries the moment it
// was served — as X-Pscale-Now on the header line, and as `now` in the derived
// index — so a stranger's LLM that fetches the surface raw, with no MCP
// connector and no grounding boundary of its own, is temporally grounded at the
// point of reading (sundial:5). Nothing here is stored: a stored 'now' is stale
// before the write returns; every address derives from a clock by a pure
// function (sundial:_).
//
// THE LAW (sundial:3; David Pinto 2026-07-15): ten digits at floor 10, coarse to
// fine — millennium, century, decade, year (base ten; the Gregorian year IS the
// address, so there is no epoch), then season of year 1-4, month of season 1-3,
// seven-day band of month 1-5, day of band 1-7, ninth of day 1-9, ninth of
// gathering 1-9. The analogue rungs never emit a zero: at those rungs zero is
// the container's own voicing (sunstone:1.4), so a trailing zero is floor-width
// padding and stops the walk — 2026000000 is the year, 2026310000 is July 2026,
// 2026313179 is one beat inside it. Weekday is a rendering, not a rung.
//
// This file carries only what the wire needs of the TS: momentToAddress,
// addressToSpan, voiceAddress, renderNow. Ages, relations and prose annotation
// (renderAge, renderAddressRelation, annotateAges, ground) stay the router's —
// a beach serves data; the reading boundary does the relating. When the TS
// moves, re-port these bodies verbatim; the two arithmetics must not drift.
// Proved by scripts/smoke-temporal.js, which carries that repo's own cases.
//
// Lives outside api/ on purpose: Vercel makes every file under api/ an endpoint.

/** The nine day-parts (pscale 1) — 2h40m each, named as humans name them. */
export const DAY_PARTS = [
  'deep night', 'dawn', 'early morning', 'morning', 'midday',
  'afternoon', 'late afternoon', 'evening', 'night',
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Layer A — the moment ⇄ the address ─────────────────────────────────────

/** UTC moment → the canonical full-width ten-digit address. The first four
 *  digits ARE the Gregorian year. Years outside 1000..9999 are out of the
 *  floor-10 form (year 476 would left-pad into the root underscore chain, and
 *  year 10000 grows the floor — both correct, neither this century's problem). */
export function momentToAddress(when) {
  const y = when.getUTCFullYear();
  if (y < 1000 || y > 9999) {
    throw new RangeError(`temporal: year ${y} is outside the floor-10 form (1000..9999)`);
  }
  const month = when.getUTCMonth();           // 0..11
  const dom = when.getUTCDate();              // 1..31
  const secOfDay = when.getUTCHours() * 3600 + when.getUTCMinutes() * 60 + when.getUTCSeconds();

  const partS = 86400 / 9;                    // 9600 — the gathering
  const beatS = partS / 9;                    // 1066.67 — the beat
  const part = Math.floor(secOfDay / partS);  // 0..8
  const beat = Math.floor((secOfDay - part * partS) / beatS); // 0..8

  const digits = [
    Math.floor(y / 1000) % 10,          // pscale 9 — millennium   (0 is a value)
    Math.floor(y / 100) % 10,           // pscale 8 — century      (0 is a value)
    Math.floor(y / 10) % 10,            // pscale 7 — decade       (0 is a value)
    y % 10,                             // pscale 6 — year         (0 is a value)
    Math.floor(month / 3) + 1,          // pscale 5 — season   1..4
    (month % 3) + 1,                    // pscale 4 — month    1..3
    Math.floor((dom - 1) / 7) + 1,      // pscale 3 — week     1..5
    ((dom - 1) % 7) + 1,                // pscale 2 — day      1..7
    part + 1,                           // pscale 1 — gathering 1..9
    beat + 1,                           // pscale 0 — beat      1..9
  ];
  return digits.join('');
}

/** The address → the span it names, [start, end) in UTC. A temporal address
 *  names a PERIOD, never an instant — which rung it stops at is its
 *  resolution. Accepts any canonical full-width prefix-with-padding
 *  ("2026000000" the year, "2026313179" the beat); trailing zeros are
 *  floor-width padding and stop the walk, exactly as the parser reads them. */
export function addressToSpan(addr) {
  if (!/^\d{10}$/.test(addr)) {
    throw new RangeError(`temporal: "${addr}" is not a canonical full-width floor-10 address`);
  }
  const d = addr.split('').map(Number);
  // Walk depth = digits before the trailing-zero padding. Base-ten rungs make
  // an interior 0 a real value, so only the TAIL of zeros is padding.
  let depth = 10;
  while (depth > 1 && d[depth - 1] === 0) depth--;

  const y = d[0] * 1000 + d[1] * 100 + d[2] * 10 + d[3];
  const start = new Date(Date.UTC(y, 0, 1));
  const end = new Date(Date.UTC(y + 1, 0, 1));

  // Coarser than the year: widen to the decade / century / millennium.
  if (depth <= 3) {
    const step = [1000, 100, 10][depth - 1];
    const base = Math.floor(y / step) * step;
    return { start: new Date(Date.UTC(base, 0, 1)), end: new Date(Date.UTC(base + step, 0, 1)), pscale: 10 - depth };
  }
  if (depth === 4) return { start, end, pscale: 6 };

  const season = d[4] - 1;                                   // 0..3
  if (depth === 5) {
    return { start: new Date(Date.UTC(y, season * 3, 1)), end: new Date(Date.UTC(y, season * 3 + 3, 1)), pscale: 5 };
  }
  const month = season * 3 + (d[5] - 1);                     // 0..11
  if (depth === 6) {
    return { start: new Date(Date.UTC(y, month, 1)), end: new Date(Date.UTC(y, month + 1, 1)), pscale: 4 };
  }
  const bandStart = (d[6] - 1) * 7 + 1;                      // day-of-month
  if (depth === 7) {
    // Band 5 is short (1-3 days): clamp to the month boundary — "seven-day
    // bands nest strictly inside a month" (sundial 3.1). Unclamped, a dead
    // prior-month band-5 address kept reading as the current week for the
    // first days of the next month (the 2026-09-02 panel's blocker).
    const rawEnd = Date.UTC(y, month, bandStart + 7);
    const monthEnd = Date.UTC(y, month + 1, 1);
    return { start: new Date(Date.UTC(y, month, bandStart)), end: new Date(Math.min(rawEnd, monthEnd)), pscale: 3 };
  }
  const dom = bandStart + (d[7] - 1);
  const dayStart = Date.UTC(y, month, dom);
  if (depth === 8) return { start: new Date(dayStart), end: new Date(dayStart + 86400_000), pscale: 2 };

  const partS = 9600_000;                                    // ms
  const pStart = dayStart + (d[8] - 1) * partS;
  if (depth === 9) return { start: new Date(pStart), end: new Date(pStart + partS), pscale: 1 };

  const beatS = partS / 9;
  const bStart = pStart + (d[9] - 1) * beatS;
  return { start: new Date(bStart), end: new Date(bStart + beatS), pscale: 0 };
}

/** The human voicing of an address — the block's job, done in code because
 *  the ladder is law, not content. "Tuesday 15 July 2026, late afternoon". */
export function voiceAddress(addr) {
  const { start, pscale } = addressToSpan(addr);
  const y = start.getUTCFullYear();
  if (pscale >= 7) return `the ${y}s`;
  if (pscale === 6) return `${y}`;
  if (pscale === 5) return `${['winter-quarter', 'spring-quarter', 'summer-quarter', 'autumn-quarter'][Math.floor(start.getUTCMonth() / 3)]} ${y}`;
  if (pscale === 4) return `${MONTHS[start.getUTCMonth()]} ${y}`;
  if (pscale === 3) return `the week of ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} ${y}`;
  const day = `${WEEKDAYS[start.getUTCDay()]} ${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} ${y}`;
  if (pscale === 2) return day;
  const part = DAY_PARTS[Number(addr[8]) - 1];
  if (pscale === 1) return `${day}, ${part}`;
  return `${day}, ${part} (beat ${addr[9]})`;
}

// ── The stamp, as the wire carries it ───────────────────────────────────────

/** The now-stamp: the ISO (canonical, whole seconds), the address (pointable),
 *  the voicing (what the digits mean). The TS renderNow renders these as one
 *  line for a tool result; the wire wants the parts, so this returns them —
 *  `now` in the derived index is exactly this object. */
export function renderNow(now = new Date()) {
  const address = momentToAddress(now);
  const iso = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { iso, address, voicing: voiceAddress(address) };
}

/** The header every response carries. */
export const NOW_HEADER = 'X-Pscale-Now';

/** The same stamp as one header line — `X-Pscale-Now: <iso> | <address> |
 *  <voicing>`. ASCII by necessity, not taste: the router's stamp joins its
 *  parts with a middle dot (U+00B7), but a header value is bytes with no
 *  declared encoding — Node writes the dot as UTF-8 and every client, Node's
 *  own fetch included, decodes header bytes as Latin-1, so it arrives as "Â·"
 *  (verified 2026-09-07). The pipe is the one separator no part contains. */
export function nowHeader(now = new Date()) {
  const n = renderNow(now);
  return `${n.iso} | ${n.address} | ${n.voicing}`;
}
