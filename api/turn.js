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
//                  → 502 { iceServers: [], check }     Cloudflare would not give one; check names the setting
//
// It is an operator's service beside the handler, not part of the wire: no block is read or written. The room
// plug fetches it when the beach names it in its settings at 1.5, 'turn_url=https://<beach>/api/turn', and keeps
// to STUN alone whenever the answer is anything but a pass, so a beach with no key plays exactly as before. Every
// beach brings its own key.
//
// Env (Vercel runtime): TURN_KEY_ID and TURN_KEY_API_TOKEN, the TURN key's Turn Token ID and API token from
// Cloudflare (dashboard → Realtime → TURN Server); TURN_TTL, how long a pass lasts in seconds — 14400 (four
// hours) unless set, longer than a sitting and short enough that a pass lifted from a page is soon worthless. A
// value pasted with spaces, a line break or quotes around it is read without them.

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

// A setting as pasted into the dashboard: the spaces, line break or pair of quotes around it are the paste, not
// the key.
export function cleaned(value) {
  const v = String(value == null ? '' : value).trim();
  const m = /^(['"])([\s\S]*)\1$/.exec(v);
  return (m ? m[2] : v).trim();
}

// What an owner looks at when Cloudflare refuses, naming the setting and never its value. A TURN key's Turn Token
// ID is 32 characters of 0-9 and a-f, its API token 64, and Cloudflare answers 404 'cannot find specified key' to
// an ID it does not know, whatever the token. The ID is no secret, and its last four characters tell an owner
// which key the deployment holds, as a card's last four digits do; nothing of the token is ever shown.
const HEX = /^[0-9a-f]+$/i;
export function checkFor(status, id, token) {
  if (status === 404) {
    return 'TURN_KEY_ID is not a TURN key Cloudflare knows: it should be the Turn Token ID beside the key under '
      + 'Realtime → TURN Server, 32 characters of 0-9 and a-f, and this one has ' + id.length
      + (id.length >= 8 ? ', ending ' + id.slice(-4) : '')
      + (HEX.test(id) ? '.' : ', not all of them 0-9 and a-f.')
      + (id.length === 64 && HEX.test(id) ? ' That is an API token\'s length, so the two values may be the wrong way round.' : '')
      + (id.length === 32 && HEX.test(id) ? ' The right length, so it may be an SFU app\'s ID, or a key since deleted.' : '');
  }
  if (status === 401 || status === 403) {
    return 'Cloudflare refused TURN_KEY_API_TOKEN for this key: it should be the API token shown once when the key '
      + 'was made, 64 characters of 0-9 and a-f, and this one has ' + token.length + '. A token not kept means a new key.';
  }
  return 'Cloudflare could not make a pass just now; try again shortly.';
}

// Cloudflare's own words for a refusal, with neither setting in them.
async function saidBy(r, id, token) {
  const hide = (s, v) => (v.length >= 8 ? s.split(v).join('…') : s);
  try {
    const d = JSON.parse(await r.text());
    const said = String((d && (d.error || (d.errors && d.errors[0] && d.errors[0].message))) || '');
    return hide(hide(said, token), id).slice(0, 160);
  } catch (e) {
    return '';
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ iceServers: [], error: 'GET only' });

  const id = cleaned(process.env.TURN_KEY_ID), token = cleaned(process.env.TURN_KEY_API_TOKEN);
  if (!id || !token) return res.status(404).json({ iceServers: [], error: 'no TURN key is set on this beach' });

  const ttl = ttlOf(process.env.TURN_TTL);
  try {
    const r = await fetch(CLOUDFLARE + encodeURIComponent(id) + '/credentials/generate-ice-servers', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const said = await saidBy(r, id, token);
      return res.status(502).json({ iceServers: [], error: 'Cloudflare answered ' + r.status + (said ? ': ' + said : ''), check: checkFor(r.status, id, token) });
    }
    const iceServers = normalise(await r.json());
    if (!iceServers.length) return res.status(502).json({ iceServers: [], error: 'Cloudflare gave no servers' });
    return res.status(200).json({ iceServers, ttl });
  } catch (e) {
    return res.status(502).json({ iceServers: [], error: 'Cloudflare could not be reached' });
  }
}
