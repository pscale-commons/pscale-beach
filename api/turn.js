// ── The beach's TURN pass — the relay for live play ──
// The scope: bsp-mcp proposals/2026-10-22-the-relay-for-live-play.md; spine:tronic-glass 1.1114, its decision at
// 1.11148 (David: 'GO — Ok, I'll front the costs').
//
// Two phones in a live game are introduced on the beach and then play player to player (button/room.js). Some
// pairs cannot reach each other directly — a mobile network that puts many phones behind one shared address, a
// strict office or school network — and for them a TURN server carries the game's messages between the two. The
// beach owner's TURN runs on their own Cloudflare account, and its key is a long-term secret that never ships in
// a page: this route asks Cloudflare for a pass that runs out, and answers in the shape RTCPeerConnection takes.
//
//   GET /api/turn  → 200 { iceServers: [...], ttl }   a pass for one player
//                  → 404 { iceServers: [] }            no TURN key set on this beach
//                  → 502 { iceServers: [] }            Cloudflare would not give one
//
// It is an operator's service beside the handler, not part of the wire: no block is read or written. The room
// plug fetches it when the beach names it in its settings at 1.5, 'turn_url=https://<beach>/api/turn', and keeps
// to STUN alone whenever the answer is anything but a pass, so a beach with no key plays exactly as before. Every
// beach brings its own key.
//
// Env (Vercel runtime): TURN_KEY_ID and TURN_KEY_API_TOKEN, the TURN key's Turn Token ID and API token from
// Cloudflare (dashboard → Realtime → TURN Server); TURN_TTL, how long a pass lasts in seconds — 14400 (four
// hours) unless set, longer than a sitting and short enough that a pass lifted from a page is soon worthless.

const CLOUDFLARE = 'https://rtc.live.cloudflare.com/v1/turn/keys/';
const TTL_DEFAULT = 14400, TTL_MIN = 300, TTL_MAX = 86400;

// Cloudflare's answer as a list of servers: its current shape is a list, its older one a single object. Port 53
// is dropped: browsers block it, and the room plug gathers its candidates before it offers, so a blocked port
// would only spend that wait.
export function normalise(body) {
  const given = body && body.iceServers;
  const list = Array.isArray(given) ? given : given && typeof given === 'object' ? [given] : [];
  return list
    .map((s) => ({ ...s, urls: [].concat((s && s.urls) || []).filter((u) => typeof u === 'string' && !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length);
}

export function ttlOf(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, TTL_MIN), TTL_MAX) : TTL_DEFAULT;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ iceServers: [], error: 'GET only' });

  const id = process.env.TURN_KEY_ID, token = process.env.TURN_KEY_API_TOKEN;
  if (!id || !token) return res.status(404).json({ iceServers: [], error: 'no TURN key is set on this beach' });

  const ttl = ttlOf(process.env.TURN_TTL);
  try {
    const r = await fetch(CLOUDFLARE + encodeURIComponent(id) + '/credentials/generate-ice-servers', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(502).json({ iceServers: [], error: 'Cloudflare answered ' + r.status });
    const iceServers = normalise(await r.json());
    if (!iceServers.length) return res.status(502).json({ iceServers: [], error: 'Cloudflare gave no servers' });
    return res.status(200).json({ iceServers, ttl });
  } catch (e) {
    return res.status(502).json({ iceServers: [], error: 'Cloudflare could not be reached' });
  }
}
