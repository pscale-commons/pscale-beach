// Who read this beach all night (api/night-readers.js), offline: the host's API and the beach's door are mocks, the
// handler is called as Vercel calls it. No token → 200, a check, and nothing asked (the daily call on a beach that
// never set one stays quiet); a token → the project's owner found
// through the teams the token sees, then ONE query for last night's hourly counts by caller and site, in the
// owner's zone (summer time and a zone half an hour from UTC included). A browser or a robot that read in every hour
// at the floor or above is a night reader, named by browser and site; a server is counted beside them, never named;
// a daytime phone, a tab closed at four and a slow crawler are not readers. Only Vercel's cron, carrying
// CRON_SECRET, writes, and only when something read all night: one line appended to pool:<NIGHT_READERS_POOL> (else
// the first keeper) through the beach's own door. A stranger's call, a wrong bearer and a quiet night write nothing.
// The host refusing → 502 naming the setting; the token never in an answer; a night asked twice is asked of the
// host once; a value pasted with quotes or spaces read without them.
//   npm run smoke:night-readers
let pass = true;
const check = (label, ok, detail) => {
  if (!ok) pass = false;
  console.log(`  ${ok ? '✓' : '✗'} ${label}` + (ok || detail === undefined ? '' : `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
};

let fresh = 0;
const load = async () => import(new URL(`../api/night-readers.js?case=${++fresh}`, import.meta.url));

function call(handler, { query = {}, headers = {} } = {}) {
  return new Promise((done) => {
    const out = { status: 0, headers: {}, body: null };
    const res = {
      setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
      status(n) { out.status = n; return res; },
      json(b) { out.body = b; done(out); return res; },
      end() { done(out); return res; },
    };
    Promise.resolve(handler({ method: 'GET', query, headers }, res)).catch((e) => { out.error = e; done(out); });
  });
}

const TOKEN = 'vc-token-0123456789abcdef', TEAM = 'team_abc', PROJECT = 'prj_beach', ORIGIN = 'beach.example.org', CRON = 'cron-secret-xyz';
const UA = {
  chrome155: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
  chrome154: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  phone: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
  baidu: 'Mozilla/5.0 (compatible; Baiduspider-render/2.0; +http://www.baidu.com/search/spider.html)',
  reflect: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ReflectBot/1.0; +https://example.org/bot)',
  node: 'node',
  generator: 'site generator',
};

// Last night in London (GMT in November): 00:00Z to 06:00Z on 10 November.
const NIGHT = Date.UTC(2026, 10, 10, 0);
function rows(spec) {
  const out = [];
  for (const [agent, site, perHour] of spec) {
    perHour.forEach((n, h) => out.push({ timestamp: new Date(NIGHT + h * 3600e3).toISOString(), vercel_function_invocation_count_sum: n, client_user_agent: agent, referrer_hostname: site }));
  }
  return out;
}
const LAST_NIGHT = rows([
  [UA.chrome155, 'happyseaurchin.com', [1200, 1200, 1200, 1200, 1200, 1200]],
  [UA.chrome154, 'evolution.hermitcrab.me', [915, 915, 915, 915, 915, 915]],
  [UA.reflect, 'happyseaurchin.com', [40, 41, 39, 40, 40, 40]],           // a robot at the floor or above, all night
  [UA.baidu, 'www.happyseaurchin.com', [26, 25, 27, 26, 25, 25]],          // a robot below the floor
  [UA.chrome154, 'happyseaurchin.com', [300, 300, 300, 300, 300, null]],   // a tab closed at five: not every hour
  [UA.phone, 'mirror.onen.ai', [0, 0, 0, 0, 120, 200]],                    // someone up early
  [UA.node, '', [70, 70, 70, 70, 70, 70]],                                 // a server: counted, never named
  [UA.generator, '', [10, 10, 10, 10, 10, 10]],
]);
const QUIET = rows([[UA.node, '', [70, 70, 70, 70, 70, 70]], [UA.phone, 'mirror.onen.ai', [0, 0, 0, 0, 120, 200]]]);

let calls = [], counts = LAST_NIGHT, hostStatus = 200, posted = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, init });
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.startsWith(`https://${ORIGIN}/.well-known/pscale-beach`)) { posted.push(JSON.parse(init.body)); return json(200, { ok: true, slot: '186' }); }
  if (!u.startsWith('https://api.vercel.com/')) return json(404, {});
  if (hostStatus !== 200) return json(hostStatus, { error: { code: 'forbidden', message: 'Not authorized' } });
  if (u === `https://api.vercel.com/v9/projects/${PROJECT}`) return json(404, { error: { code: 'not_found', message: 'Project not found' } });
  if (u.startsWith('https://api.vercel.com/v2/teams')) return json(200, { teams: [{ id: 'team_other' }, { id: TEAM }] });
  if (u === `https://api.vercel.com/v9/projects/${PROJECT}?teamId=team_other`) return json(404, {});
  if (u === `https://api.vercel.com/v9/projects/${PROJECT}?teamId=${TEAM}`) return json(200, { id: PROJECT, accountId: TEAM });
  if (u.startsWith('https://api.vercel.com/v2/observability/query')) return json(200, { data: counts, summary: [] });
  return json(404, {});
};

const NOW = Date.UTC(2026, 10, 10, 9, 0);   // a morning in London, the night behind it
Date.now = () => NOW;
const ENV = ['NIGHT_READERS_TOKEN', 'NIGHT_READERS_POOL', 'NIGHT_READERS_ZONE', 'NIGHT_READERS_FLOOR', 'CRON_SECRET', 'BEACH_KEEPERS', 'BEACH_ORIGIN', 'VERCEL_PROJECT_ID', 'VERCEL_PROJECT_PRODUCTION_URL'];
function env(set) { for (const k of ENV) delete process.env[k]; Object.assign(process.env, set); calls = []; posted = []; counts = LAST_NIGHT; hostStatus = 200; }
const BASE = { NIGHT_READERS_TOKEN: TOKEN, VERCEL_PROJECT_ID: PROJECT, BEACH_ORIGIN: ORIGIN, NIGHT_READERS_ZONE: 'Europe/London' };
const asCron = { authorization: `Bearer ${CRON}` };
const query = () => calls.filter((c) => c.url.includes('/v2/observability/query'));

console.log('\nno token');
env({ VERCEL_PROJECT_ID: PROJECT, BEACH_ORIGIN: ORIGIN });
let r = await call((await load()).default);
check('200 and quiet, the check naming NIGHT_READERS_TOKEN', r.status === 200 && /NIGHT_READERS_TOKEN/.test(r.body.check) && !r.body.readers, r.body);
check('…and nothing is asked of anyone', calls.length === 0, calls.map((c) => c.url));

console.log('\nlast night, asked by a stranger');
env({ ...BASE, NIGHT_READERS_TOKEN: `  "${TOKEN}"\n`, NIGHT_READERS_POOL: 'happyseaurchin', CRON_SECRET: CRON });
let mod = await load();
r = await call(mod.default);
check('200', r.status === 200, r);
check('the project\'s owner is found through the teams the token can see', calls.some((c) => c.url.endsWith(`?teamId=${TEAM}`)), calls.map((c) => c.url));
check('a token pasted with quotes and a line break is sent without them, as a bearer, to the host alone',
  calls.filter((c) => c.url.startsWith('https://api.vercel.com/')).every((c) => c.init.headers.Authorization === `Bearer ${TOKEN}`)
  && calls.every((c) => c.url.startsWith('https://api.vercel.com/') || !JSON.stringify(c.init).includes(TOKEN)));
const q = query()[0], body = q && JSON.parse(q.init.body);
check('one query, for the team', query().length === 1 && q.url.endsWith(`?teamId=${TEAM}`), q && q.url);
check('…of this project\'s production calls, hourly, by caller and site', body && body.scope.type === 'project' && body.scope.ownerId === TEAM
  && body.scope.projectIds[0] === PROJECT && body.metric === 'vercel.function_invocation.count' && body.aggregation === 'sum'
  && body.granularity.hours === 1 && body.groupBy.join() === 'client_user_agent,referrer_hostname' && body.filter === "environment eq 'production'", body);
check('…over last night where the owner is: 00:00 to 06:00 London on 10 November', body && body.startTime === '2026-11-10T00:00:00.000Z' && body.endTime === '2026-11-10T06:00:00.000Z', body && [body.startTime, body.endTime]);
const names = (r.body.readers || []).map((x) => `${x.caller} @ ${x.site} ${x.perHour}`);
check('three night readers, heaviest first: two tabs left open and a robot at the floor', names.join(' | ') === 'Chrome 155 on a Mac @ happyseaurchin.com 1200 | Chrome 154 on a Mac @ evolution.hermitcrab.me 915 | ReflectBot (a robot) @ happyseaurchin.com 40', names);
check('…not the crawler below the floor, the tab closed at five, nor the early phone', !names.some((n) => /Baidu|Android|@ happyseaurchin.com 300/.test(n)), names);
check('the servers\' reads counted beside them, never named', r.body.servers === 480 && !names.some((n) => /node|generator/.test(n)), r.body.servers);
check('the line names each by browser and site, the rate in words, and the night to look at',
  /^Read beach\.example\.org all night, 00:00 to 06:00 on 10 November 2026, Europe\/London: Chrome 155 on a Mac at happyseaurchin\.com, about 1,200 reads an hour; /.test(r.body.line)
  && r.body.line.endsWith('https://beach.example.org/api/night-readers?night=2026-11-10'), r.body.line);
check('a stranger is shown the finding and nothing is written', r.body.told === null && posted.length === 0, posted);
check('the token never in the answer', !JSON.stringify(r.body).includes(TOKEN));
check('the answer is never kept by a cache', r.headers['cache-control'] === 'no-store', r.headers);
r = await call(mod.default);
check('the same night asked again is not asked of the host again', query().length === 1, query().length);

console.log('\nthe cron');
env({ ...BASE, NIGHT_READERS_POOL: ' "pool:happyseaurchin" ', CRON_SECRET: CRON });
r = await call((await load()).default, { headers: asCron });
check('Vercel\'s cron, carrying CRON_SECRET: one line, appended to the owner\'s room through the beach\'s own door',
  posted.length === 1 && posted[0].block === 'pool:happyseaurchin' && posted[0].append === true && posted[0].content._ === r.body.line && posted[0].content['1'] === ORIGIN, posted);
check('…and the answer says where it was told', r.body.told === 'pool:happyseaurchin', r.body.told);
env({ ...BASE, NIGHT_READERS_POOL: 'happyseaurchin', CRON_SECRET: CRON });
r = await call((await load()).default, { headers: { authorization: 'Bearer not-the-secret' } });
check('a wrong bearer writes nothing', posted.length === 0 && r.body.told === null, posted);
env({ ...BASE, NIGHT_READERS_POOL: 'happyseaurchin' });
r = await call((await load()).default, { headers: asCron });
check('with no CRON_SECRET set, even the cron writes nothing', posted.length === 0 && r.body.told === null, posted);
env({ ...BASE, BEACH_KEEPERS: ' davidmpinto , someone', CRON_SECRET: CRON });
r = await call((await load()).default, { headers: asCron });
check('no room named: the first of the keepers hears', posted.length === 1 && posted[0].block === 'pool:davidmpinto', posted.map((p) => p.block));
env({ ...BASE, NIGHT_READERS_POOL: 'happyseaurchin', CRON_SECRET: CRON });
counts = QUIET;
r = await call((await load()).default, { headers: asCron });
check('a quiet night: nothing written, and the finding says so', posted.length === 0 && r.body.readers.length === 0 && r.body.line === 'Nothing read beach.example.org all night, 00:00 to 06:00 on 10 November 2026, Europe/London.', r.body);

console.log('\nthe night, by the owner\'s clock');
env({ ...BASE, NIGHT_READERS_ZONE: 'Europe/London' });
mod = await load();
let n = mod.nightOf(Date.UTC(2026, 6, 1, 9), 'Europe/London');
check('summer time in London: the night ran 23:00Z to 05:00Z', new Date(n.from).toISOString() === '2026-06-30T23:00:00.000Z' && new Date(n.to).toISOString() === '2026-07-01T05:00:00.000Z', [n.from, n.to].map((t) => new Date(t).toISOString()));
n = mod.nightOf(Date.UTC(2026, 10, 10, 3), 'Europe/London');
check('at three in the morning the night is not whole yet: the one before is read', n.date === '2026-11-09', n.date);
n = mod.nightOf(NOW, 'Asia/Kolkata');
check('a zone half an hour from UTC is read on whole hours, seven of them', new Date(n.from).toISOString() === '2026-11-09T18:00:00.000Z' && new Date(n.to).toISOString() === '2026-11-10T01:00:00.000Z', [n.from, n.to].map((t) => new Date(t).toISOString()));
check('a zone the clock does not know reads as UTC', mod.zoneOf('Mars/Olympus') === 'UTC' && mod.zoneOf('') === 'UTC');
r = await call(mod.default, { query: { night: '2026-11-09' } });
const asked = query()[0] && JSON.parse(query()[0].init.body);
check('?night=2026-11-09 reads the night that ended that morning', asked && asked.startTime === '2026-11-09T00:00:00.000Z', asked && asked.startTime);
env({ ...BASE, NIGHT_READERS_FLOOR: '"1000"' });
r = await call((await load()).default);
check('NIGHT_READERS_FLOOR raises the bar: only the 1,200-an-hour tab is left', r.body.readers.length === 1 && r.body.floor === 1000, r.body.readers);

console.log('\nthe host refusing');
env({ ...BASE });
hostStatus = 403;
r = await call((await load()).default);
check('502, the host\'s words, and a check naming NIGHT_READERS_TOKEN', r.status === 502 && /NIGHT_READERS_TOKEN/.test(r.body.check) && r.body.error === 'Not authorized', r.body);
check('…and never the token', !JSON.stringify(r.body).includes(TOKEN));

console.log('\ncallers in words');
const w = (await load()).callerWords;
check('Chrome on a Mac', w(UA.chrome155) === 'Chrome 155 on a Mac', w(UA.chrome155));
check('Safari on an iPhone', w('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1') === 'Safari 18 on an iPhone');
check('Firefox on Windows', w('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0') === 'Firefox 131 on Windows');
check('Edge, not the Chrome it carries', w('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0') === 'Edge 131 on Windows');
check('a crawler by the name it gives', w(UA.baidu) === 'Baiduspider-render (a robot)', w(UA.baidu));
check('a headless browser is a robot', w('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.0.0 Safari/537.36') === 'HeadlessChrome (a robot)');
check('the Claude app\'s own browser', w('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/4.23118.0 Chrome/152.0.7977.167 Safari/537.36') === "the Claude app's browser");
check('a server as it names itself', w('node') === 'node' && w('') === 'a caller with no name');

console.log(pass ? '\nsmoke:night-readers passed' : '\nsmoke:night-readers FAILED');
process.exit(pass ? 0 : 1);
