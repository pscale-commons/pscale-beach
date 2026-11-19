// ── Who read this beach all night — the owner's daily look ──
// David, 9 November 2026: "Should there be some kind of check conducted by the beach owner on excessive repeat
// polling -- some way to check whether the user is actually live and using a page...?", and on the answer, "Build
// the check" (bsp-mcp's account at watch:weft 854.8 and on).
//
// A beach cannot see whether anyone is looking at a page. A tab left open behind others reads exactly as one in
// front of someone does, so no limit on reads tells them apart, and none is set here. What the host can see is a
// caller reading through every hour of the night: people sleep, and a tab left open, a crawler and a server do not.
// On 9 November three tabs read about nine tenths of this beach's calls that way, 900 to 1,200 reads an hour each,
// until the pages learned to read only while their tab is visible. This route looks once a day, over the counts the
// host already keeps, and tells the owner in one line when anything read all night. Nothing is refused, no read
// pays for it, and nothing is stored but that line.
//
//   GET /api/night-readers                    → 200 { night, zone, floor, readers, servers, line, told }
//                                                the last whole night, 00:00 to 06:00 where the owner is
//   GET /api/night-readers?night=2026-11-10      the night that ended on that morning
//                                             → 200 { check }          no token set on this beach: nothing is looked
//                                                                      at, and the daily call stays quiet
//                                             → 502 { check, error }   the host would not give its counts
//
// A night reader is a browser or a robot (a crawler, a headless browser) that read in every hour of the night, at
// least NIGHT_READERS_FLOOR times an hour on average (30 unless set: one every two minutes). It is named by its
// browser and the site whose page did the reading, never by its address. A server (the router, a webhook, a site
// generator) reads all night by design: its reads are counted beside the readers, never as one.
//
// Vercel's cron calls this route once a day (vercel.json, 07:00 UTC), carrying CRON_SECRET as its bearer. Only that
// call writes, and only when something read all night: one line appended to the owner's room as any hand appends,
// through the beach's own door, at pool:<NIGHT_READERS_POOL>, else pool:<the first of BEACH_KEEPERS>. Any other
// caller is shown the finding and writes nothing, and each warm instance asks the host about a night at most once
// an hour.
//
// It is an operator's service beside the handler, like api/turn.js, and no part of the wire. Every beach brings its
// own token and looks at its own counts.
//
// Env (Vercel runtime): NIGHT_READERS_TOKEN, a Vercel access token made under the team that owns this project
// (Vercel → Account Settings → Tokens). It is this route's only key and is never shown in an answer; Vercel cannot
// limit a token to reading, so it can do anything on that team, and it lives in these settings alone.
// NIGHT_READERS_POOL, whose room hears (a handle, e.g. happyseaurchin). NIGHT_READERS_ZONE, where the owner's night
// falls (an IANA zone such as Europe/London; UTC unless set). NIGHT_READERS_FLOOR, the reads an hour below which
// nothing is said (30 unless set). CRON_SECRET, any long random string, which Vercel sends with each cron call;
// unset, the cron looks and never tells. VERCEL_PROJECT_ID is Vercel's own. A value pasted with spaces, a line
// break or quotes around it is read without them.

import { timingSafeEqual } from 'node:crypto';

const API = 'https://api.vercel.com';
const HOUR = 3600e3;
const NIGHT_ENDS = 6;          // the night is 00:00 to 06:00 where the owner is
const FLOOR_DEFAULT = 30;      // reads an hour: one every two minutes
const SHOWN = 5;               // readers named in the line; the rest are counted
const KEEP_MS = HOUR;          // how long a warm instance keeps the host's answer about one night

// A setting as pasted into the dashboard: the spaces, line break or pair of quotes around it are the paste.
export function cleaned(value) {
  const v = String(value == null ? '' : value).trim();
  const m = /^(['"])([\s\S]*)\1$/.exec(v);
  return (m ? m[2] : v).trim();
}

// The owner's zone, or UTC when the setting names none the clock knows.
export function zoneOf(value) {
  const zone = cleaned(value) || 'UTC';
  try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }); return zone; } catch { return 'UTC'; }
}

// The wall clock in a zone at an instant, as numbers.
function wall(ms, zone) {
  const p = {};
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric',
    day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms));
  for (const x of parts) p[x.type] = +x.value;
  return p;
}

// The instant a wall-clock hour falls in a zone: the guess corrected by the zone's offset, asked twice so the hour
// the clocks change lands right.
function instantOf(y, m, d, h, zone) {
  const offset = (ms) => {
    const w = wall(ms, zone);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000;
  };
  const guess = Date.UTC(y, m - 1, d, h);
  return guess - offset(guess - offset(guess));
}

// The night that ended on the morning of `date` (YYYY-MM-DD on the owner's calendar), or else the last whole night
// before `now`. The host is asked on whole hours, so a zone half an hour from UTC still has every hour read.
export function nightOf(now, zone, date) {
  let y, m, d;
  const asked = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleaned(date));
  if (asked) [y, m, d] = [+asked[1], +asked[2], +asked[3]];
  else {
    const w = wall(now, zone);
    const day = new Date(Date.UTC(w.year, w.month - 1, w.day - (w.hour < NIGHT_ENDS ? 1 : 0)));
    [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
  }
  const start = instantOf(y, m, d, 0, zone), end = instantOf(y, m, d, NIGHT_ENDS, zone);
  const on = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
  return {
    from: Math.floor(start / HOUR) * HOUR,
    to: Math.ceil(end / HOUR) * HOUR,
    date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    label: `00:00 to 06:00 on ${on}, ${zone}`,
  };
}

// What a user agent says it is: a robot (crawlers and headless browsers announce themselves), a browser, or a
// server (anything that does not speak as a browser).
export function kindOf(agent) {
  const a = String(agent || '');
  if (/bot\b|bot\/|spider|crawl|slurp|headless|compatible;/i.test(a)) return 'robot';
  return /^Mozilla\//.test(a) ? 'browser' : 'server';
}

// A caller in words: a browser by its name and machine, a robot by the name it gives, a server as it names itself.
export function callerWords(agent) {
  const a = String(agent || '');
  const kind = kindOf(a);
  if (kind === 'server') return a.slice(0, 60) || 'a caller with no name';
  if (kind === 'robot') {
    const named = /compatible;\s*([^;/)]+)/i.exec(a) || /(HeadlessChrome)\//.exec(a) || /([\w-]*(?:bot|spider|crawler)[\w-]*)/i.exec(a);
    return `${named ? named[1].trim() : 'a robot'} (a robot)`;
  }
  if (/Claude\//.test(a)) return "the Claude app's browser";
  const one = (re, name) => { const m = re.exec(a); return m ? `${name} ${m[1]}` : ''; };
  const browser = one(/Edg\/(\d+)/, 'Edge') || one(/OPR\/(\d+)/, 'Opera') || one(/Firefox\/(\d+)/, 'Firefox')
    || one(/Chrome\/(\d+)/, 'Chrome') || one(/Version\/(\d+).*Safari/, 'Safari') || 'a browser';
  const machine = /iPhone/.test(a) ? 'an iPhone' : /iPad/.test(a) ? 'an iPad' : /Android/.test(a) ? 'Android'
    : /CrOS/.test(a) ? 'a Chromebook' : /Macintosh/.test(a) ? 'a Mac' : /Windows/.test(a) ? 'Windows'
    : /Linux/.test(a) ? 'Linux' : '';
  return machine ? `${browser} on ${machine}` : browser;
}

// The night's readers from the host's hourly counts: every browser or robot, on each site, that read in every hour
// of the night at the floor or above, heaviest first; and the servers' reads, summed beside them.
export function readersOf(rows, night, floor) {
  const hours = Math.round((night.to - night.from) / HOUR);
  const callers = new Map();
  let servers = 0;
  for (const row of rows || []) {
    const at = Date.parse(row.timestamp), reads = Number(row.vercel_function_invocation_count_sum) || 0;
    if (!(at >= night.from && at < night.to) || reads <= 0) continue;
    const agent = row.client_user_agent || '', site = row.referrer_hostname || '';
    if (kindOf(agent) === 'server') { servers += reads; continue; }
    const key = `${agent}\n${site}`;
    const c = callers.get(key) || { agent, site, reads: 0, hours: new Set() };
    c.reads += reads;
    c.hours.add(Math.floor((at - night.from) / HOUR));
    callers.set(key, c);
  }
  const readers = [...callers.values()]
    .filter((c) => c.hours.size >= hours && c.reads / hours >= floor)
    .sort((a, b) => b.reads - a.reads)
    .map((c) => ({ caller: callerWords(c.agent), kind: kindOf(c.agent), site: c.site || null, perHour: Math.round(c.reads / hours), reads: c.reads }));
  return { readers, servers };
}

// The owner's one line.
export function lineFor(night, found, origin) {
  const n = (x) => new Intl.NumberFormat('en-GB').format(x);
  if (!found.readers.length) return `Nothing read ${origin} all night, ${night.label}.`;
  const named = found.readers.slice(0, SHOWN).map((r) => `${r.caller} at ${r.site || 'no named site'}, about ${n(r.perHour)} reads an hour`);
  const more = found.readers.length > SHOWN ? `, and ${found.readers.length - SHOWN} more` : '';
  return `Read ${origin} all night, ${night.label}: ${named.join('; ')}${more}. Usually a page left open in a tab that keeps reading, or a crawler: https://${origin}/api/night-readers?night=${night.date}`;
}

async function vercel(token, path, init = {}) {
  const r = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  let body = null;
  try { body = await r.json(); } catch { /* an answer with no body */ }
  return { status: r.status, body };
}

// What the host said when it would not answer, and the setting to look at. The token's value is never in it.
function refused(r) {
  const said = (r.body && r.body.error && (r.body.error.message || r.body.error.code)) || `the host answered ${r.status}`;
  const check = r.status === 401 || r.status === 403
    ? 'NIGHT_READERS_TOKEN was refused: make a new token under the team that owns this beach (Vercel → Account Settings → Tokens), set it again and redeploy'
    : r.status === 429 ? 'the host is busy: the next look asks again'
    : 'the host would not give its counts: look at NIGHT_READERS_TOKEN, then ask again';
  return Object.assign(new Error(String(said)), { check });
}

let owner = '';      // the team (or person) whose project this is, learned once per warm instance
let kept = null;     // { key, at, rows }: the host's last answer about one night

// Whose project this is: the token's own account first, then each team the token can see.
async function ownerOf(token, project) {
  if (owner) return owner;
  const own = await vercel(token, `/v9/projects/${encodeURIComponent(project)}`);
  if (own.status === 200 && own.body && own.body.accountId) return (owner = own.body.accountId);
  if (own.status === 401) throw refused(own);
  const teams = await vercel(token, '/v2/teams?limit=100');
  if (teams.status !== 200) throw refused(teams);
  for (const team of (teams.body && teams.body.teams) || []) {
    const p = await vercel(token, `/v9/projects/${encodeURIComponent(project)}?teamId=${encodeURIComponent(team.id)}`);
    if (p.status === 200) return (owner = team.id);
  }
  throw Object.assign(new Error('this project is not among the ones the token can see'),
    { check: 'NIGHT_READERS_TOKEN cannot see this project: make it under the team that owns the beach (Vercel → Account Settings → Tokens, its scope that team)' });
}

// The host's hourly counts for the night, by caller and site.
async function countsFor(token, project, night) {
  const key = `${project}|${night.from}`;
  if (kept && kept.key === key && Date.now() - kept.at < KEEP_MS) return kept.rows;
  const team = await ownerOf(token, project);
  const q = await vercel(token, `/v2/observability/query${team.startsWith('team_') ? `?teamId=${encodeURIComponent(team)}` : ''}`, {
    method: 'POST',
    body: JSON.stringify({
      scope: { type: 'project', ownerId: team, projectIds: [project] },
      metric: 'vercel.function_invocation.count',
      aggregation: 'sum',
      startTime: new Date(night.from).toISOString(),
      endTime: new Date(night.to).toISOString(),
      granularity: { hours: 1 },
      groupBy: ['client_user_agent', 'referrer_hostname'],
      filter: "environment eq 'production'",
      limit: 50,
    }),
  });
  if (q.status !== 200) throw refused(q);
  kept = { key, at: Date.now(), rows: (q.body && q.body.data) || [] };
  return kept.rows;
}

function originOf() {
  return cleaned(process.env.BEACH_ORIGIN || process.env.VERCEL_PROJECT_PRODUCTION_URL).replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function roomOf() {
  const named = cleaned(process.env.NIGHT_READERS_POOL).replace(/^pool:/, '');
  return named || String(process.env.BEACH_KEEPERS || '').split(',').map((h) => h.trim()).filter(Boolean)[0] || '';
}

function fromCron(req) {
  const secret = cleaned(process.env.CRON_SECRET);
  const given = String((req.headers && req.headers.authorization) || '');
  const want = `Bearer ${secret}`;
  return !!secret && given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

// One line in the owner's room, appended as any hand appends, through the beach's own door.
async function tell(room, line, origin) {
  try {
    const r = await fetch(`https://${origin}/.well-known/pscale-beach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block: `pool:${room}`, append: true, content: { _: line, 1: origin, 2: '', 3: new Date().toISOString() } }),
    });
    return r.ok;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = cleaned(process.env.NIGHT_READERS_TOKEN);
  if (!token) {
    return res.status(200).json({ check: 'NIGHT_READERS_TOKEN is not set, so this beach looks at nothing: make a Vercel access token under the team that owns it (Vercel → Account Settings → Tokens), set it here and redeploy' });
  }
  const project = cleaned(process.env.VERCEL_PROJECT_ID);
  if (!project) {
    return res.status(404).json({ check: 'VERCEL_PROJECT_ID is not set: this route reads the counts Vercel keeps, so it runs on Vercel alone' });
  }
  const zone = zoneOf(process.env.NIGHT_READERS_ZONE);
  const asked = Number(cleaned(process.env.NIGHT_READERS_FLOOR));
  const floor = asked > 0 ? asked : FLOOR_DEFAULT;
  const night = nightOf(Date.now(), zone, req.query && req.query.night);
  let rows;
  try { rows = await countsFor(token, project, night); }
  catch (e) { return res.status(502).json({ night: night.label, check: e.check || 'the host would not give its counts', error: String((e && e.message) || e) }); }
  const found = readersOf(rows, night, floor);
  const origin = originOf();
  const line = lineFor(night, found, origin);
  const room = roomOf();
  const told = fromCron(req) && found.readers.length && room && origin && (await tell(room, line, origin)) ? `pool:${room}` : null;
  return res.status(200).json({ night: night.label, zone, floor, readers: found.readers, servers: found.servers, line, told });
}
