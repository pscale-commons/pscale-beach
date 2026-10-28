// The beach's TURN pass (api/turn.js), offline: Cloudflare is a mock, the handler is called as Vercel calls it.
// No key → 404 and an empty list, so the room plug keeps to STUN; a key → one POST to Cloudflare's
// generate-ice-servers with the key's token as a bearer and the pass's ttl, its answer handed on with port 53
// dropped; Cloudflare's older single-object shape read the same; Cloudflare refusing or unreachable → 502 and an
// empty list; the token never in an answer; TURN_TTL held between five minutes and a day.
//   npm run smoke:turn
import handler, { normalise, ttlOf } from '../api/turn.js';

let pass = true;
const check = (label, ok, detail) => {
  if (!ok) pass = false;
  console.log(`  ${ok ? '✓' : '✗'} ${label}` + (ok || detail === undefined ? '' : `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`));
};

function call(method = 'GET') {
  return new Promise((done) => {
    const out = { status: 0, headers: {}, body: null };
    const res = {
      setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
      status(n) { out.status = n; return res; },
      json(b) { out.body = b; done(out); return res; },
      end() { done(out); return res; },
    };
    Promise.resolve(handler({ method, query: {}, headers: {} }, res)).catch((e) => { out.error = e; done(out); });
  });
}

const SERVERS = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turn:turn.cloudflare.com:443?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp'],
      username: 'u-123', credential: 'c-456' },
  ],
};
let calls = [];
let answer = () => new Response(JSON.stringify(SERVERS), { status: 201, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return answer(); };

console.log('\nsmoke:turn — the beach\'s TURN pass\n');

delete process.env.TURN_KEY_ID; delete process.env.TURN_KEY_API_TOKEN; delete process.env.TURN_TTL;
let r = await call('OPTIONS');
check('OPTIONS answers 204 with the cross-site headers', r.status === 204 && r.headers['access-control-allow-origin'] === '*', r);
r = await call('POST');
check('anything but GET is refused', r.status === 405 && Array.isArray(r.body.iceServers) && !r.body.iceServers.length, r);
r = await call();
check('no key on this beach: 404, an empty list, Cloudflare never asked', r.status === 404 && r.body.iceServers.length === 0 && calls.length === 0, r);
check('every answer is uncached', r.headers['cache-control'] === 'no-store', r.headers);

process.env.TURN_KEY_ID = 'key-abc'; process.env.TURN_KEY_API_TOKEN = 'secret-token-xyz';
calls = [];
r = await call();
const sent = calls[0] || {};
check('a key: one POST to the key\'s generate-ice-servers', calls.length === 1 && sent.url === 'https://rtc.live.cloudflare.com/v1/turn/keys/key-abc/credentials/generate-ice-servers' && sent.init.method === 'POST', calls);
check('the token goes as a bearer, the ttl in the body (four hours unless set)', sent.init && sent.init.headers.Authorization === 'Bearer secret-token-xyz' && JSON.parse(sent.init.body).ttl === 14400, sent.init);
const urls = r.body && r.body.iceServers ? r.body.iceServers.flatMap((s) => s.urls) : [];
check('200 with the pass, its ttl beside it', r.status === 200 && r.body.ttl === 14400 && r.body.iceServers.length === 2, r.body);
check('port 53 dropped, 3478, 443 and 5349 kept', !urls.some((u) => /:53(\?|$)/.test(u)) && urls.includes('turns:turn.cloudflare.com:5349?transport=tcp') && urls.includes('turn:turn.cloudflare.com:443?transport=tcp'), urls);
check('the TURN server keeps its username and credential', r.body.iceServers[1].username === 'u-123' && r.body.iceServers[1].credential === 'c-456', r.body.iceServers[1]);
check('the key\'s token is never in an answer', !JSON.stringify(r.body).includes('secret-token-xyz'), r.body);

answer = () => new Response(JSON.stringify({ iceServers: { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u', credential: 'c' } }), { status: 201 });
r = await call();
check('Cloudflare\'s older single-object shape reads as a list', r.status === 200 && Array.isArray(r.body.iceServers) && r.body.iceServers.length === 1, r.body);

answer = () => new Response(JSON.stringify({ error: 'unauthorised' }), { status: 401 });
r = await call();
check('Cloudflare refusing: 502 and an empty list', r.status === 502 && r.body.iceServers.length === 0 && !JSON.stringify(r.body).includes('secret-token-xyz'), r.body);

answer = () => new Response(JSON.stringify({ iceServers: [{ urls: ['stun:stun.cloudflare.com:53'] }] }), { status: 201 });
r = await call();
check('nothing usable left after port 53: 502 and an empty list', r.status === 502 && r.body.iceServers.length === 0, r.body);

answer = () => { throw new Error('network down'); };
r = await call();
check('Cloudflare unreachable: 502 and an empty list', r.status === 502 && r.body.iceServers.length === 0, r.body);

process.env.TURN_TTL = '60';
answer = () => new Response(JSON.stringify(SERVERS), { status: 201 });
calls = [];
r = await call();
check('TURN_TTL below five minutes is held at five', JSON.parse(calls[0].init.body).ttl === 300 && r.body.ttl === 300, calls[0] && calls[0].init.body);
check('TURN_TTL held at a day, nonsense falls back to four hours', ttlOf('999999') === 86400 && ttlOf('nonsense') === 14400 && ttlOf('-5') === 14400 && ttlOf('3600') === 3600);
check('normalise drops servers left with no urls and junk entries', normalise({ iceServers: [{ urls: [] }, null, { urls: 'turn:x:3478' }] }).length === 1 && normalise(null).length === 0);

console.log(pass ? '\n  all pass\n' : '\n  FAILED\n');
process.exit(pass ? 0 : 1);
