#!/usr/bin/env node
// local-beach.mjs — run the REAL pscale-beach handler against a folder, offline.
// A faithful local beach: identical shape derivation, lock salt, and
// append-supernest as production, but backed by a directory of JSON files.
// This is the airtight run-time leg of the cartridge loop — one folder = one
// beach = one reality; snapshot = copy the folder, reset = restore it.
//
//   node scripts/local-beach.mjs --dir ./.beach-data --port 8787 [--origin localhost:8787]
//
// The folder IS the sub-beach boundary; nothing the handler writes can land
// outside it. Pair with pack-seed / pack-dump / pack-reset to drive the loop.

import http from 'node:http';
import { FileRedis } from './file-redis.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const dir = arg('dir', './.beach-data');
const port = parseInt(arg('port', '8787'), 10);
const origin = arg('origin', `localhost:${port}`);

// The handler reads these at module load — set them BEFORE the dynamic import.
// KV_* are dummies (the real Upstash client is constructed but never used; the
// FileRedis shim replaces it via __setRedis below).
process.env.KV_REST_API_URL ||= 'https://local.invalid';
process.env.KV_REST_API_TOKEN ||= 'local';
process.env.BEACH_ORIGIN = origin;

const { default: handler, __setRedis } = await import('../api/pscale-beach.js');
__setRedis(new FileRedis(dir));

function safeJson(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

const server = http.createServer(async (nReq, nRes) => {
  const chunks = [];
  for await (const c of nReq) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  const u = new URL(nReq.url, 'http://localhost');

  const req = {
    method: nReq.method,
    query: Object.fromEntries(u.searchParams),
    body: raw ? safeJson(raw) : {},
    headers: nReq.headers,
    url: nReq.url,
  };
  const res = {
    _status: 200,
    setHeader: (k, v) => nRes.setHeader(k, v),
    status(code) { this._status = code; return this; },
    json(obj) {
      nRes.statusCode = this._status;
      nRes.setHeader('Content-Type', 'application/json');
      nRes.end(JSON.stringify(obj));
    },
    end() { nRes.statusCode = this._status; nRes.end(); },
  };

  try {
    await handler(req, res);
  } catch (e) {
    nRes.statusCode = 500;
    nRes.setHeader('Content-Type', 'application/json');
    nRes.end(JSON.stringify({ error: String(e?.message || e), code: 'rig_error' }));
  }
});

server.listen(port, () => {
  console.error(`[local-beach] dir=${dir} origin=${origin} → http://localhost:${port}/.well-known/pscale-beach`);
});
