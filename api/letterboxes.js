// ── The letterboxes' daily backstop ──
// (letterbox:happyseaurchin, decision 1.1118, GO 19 November 2026: "Cleared by the leaders' phones after a month,
// with the beach clearing at forty days as the backstop".) THE LETTERBOX in api/pscale-beach.js says what a box is.
// A box is tended at every drop; this route tends every box the keepers open, once a day, so a letter is gone forty
// days after it came even when nothing else touches its box: no drop, no phone opening it.
//
//   GET /api/letterboxes  → 200 { _, day, tended }   tended is true for the first call of the day (UTC), false after
//
// Vercel's cron calls it daily (vercel.json). Any caller may: the beach tends its boxes once a day whoever asks, a key
// in the store for the day decides who is first, and tending only ever takes out a letter older than forty days. So it
// needs no secret, and the answer says nothing of which boxes there are or what was in them. Off the members' gate it
// reads nothing at all. An operator's service beside the handler, like api/turn.js, and no part of the wire.

import { clearLetterboxes } from './pscale-beach.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { day, tended } = await clearLetterboxes(new Date());
    return res.status(200).json({ _: "this beach's letterboxes are tended once a day: every letter is gone forty days after it came", day, tended });
  } catch (e) {
    console.error('[letterboxes] tending failed:', e?.stack || e);
    return res.status(500).json({ error: e?.message ?? 'tending failed', code: 'handler_crash' });
  }
}
