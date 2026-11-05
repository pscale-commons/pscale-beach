// file-redis.mjs — a folder-backed shim for the four Upstash methods the beach
// handler uses (get / set / keys / del). One JSON file per key. Lets the REAL
// api/pscale-beach.js run offline against a directory, with full fidelity
// (shape derivation, locks, append-supernest) — the run-time leg of the
// three-legged cartridge loop. See scripts/local-beach.mjs.
//
// Upstash semantics mirrored: get auto-deserialises (returns the parsed value
// or null); set auto-serialises an object/string; keys(pattern) matches a '*'
// anywhere, as Redis KEYS does ('<prefix>*' for an index, '<ns>/w/*:touched'
// for the played tables); del returns the count removed.
//
// Expiry: PXAT (an absolute instant in ms) is honoured — the invitation's record
// of use lives exactly as long as its token, and the gate's smoke proves it. It
// is kept beside the value as <file>.ttl; a key past it reads as absent, as in
// Redis, and a SET without it clears it. EX stays a no-op here, as it always was.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export class FileRedis {
  constructor(dir) { this.dir = dir; }

  _file(key) { return join(this.dir, encodeURIComponent(key) + '.json'); }

  // A key past its PXAT is gone: its files are removed and it reads as absent.
  async _expired(key) {
    let at;
    try { at = Number(await fs.readFile(this._file(key) + '.ttl', 'utf8')); } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
    if (!(at <= Date.now())) return false;
    await fs.unlink(this._file(key)).catch(() => {});
    await fs.unlink(this._file(key) + '.ttl').catch(() => {});
    return true;
  }

  async get(key) {
    if (await this._expired(key)) return null;
    try {
      return JSON.parse(await fs.readFile(this._file(key), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  async set(key, val, opts) {
    // NX (set-if-absent) — mirrors Upstash's atomic `SET … NX` used by the
    // single-resolution claim, the per-accumulator append mutex and the
    // invitation's record of use. The 'wx' open flag makes it one atomic
    // syscall (fail-if-exists), so Promise.all'd handler invocations
    // interleaving at awaits still contend correctly — access-then-write had a
    // window between the two awaits. EX (TTL) is a no-op in the file shim;
    // PXAT is kept (above).
    await fs.mkdir(this.dir, { recursive: true });
    await this._expired(key);
    const ttl = this._file(key) + '.ttl';
    if (opts && opts.nx) {
      try {
        await fs.writeFile(this._file(key), JSON.stringify(val), { flag: 'wx' });
      } catch (e) {
        if (e.code === 'EEXIST') return null; // exists → NX fails
        throw e;
      }
    } else {
      await fs.writeFile(this._file(key), JSON.stringify(val));
    }
    if (opts && typeof opts.pxat === 'number') await fs.writeFile(ttl, String(opts.pxat));
    else await fs.unlink(ttl).catch(() => {});
    return 'OK';
  }

  async keys(pattern) {
    let files;
    try {
      files = await fs.readdir(this.dir);
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    const all = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => decodeURIComponent(f.slice(0, -'.json'.length)));
    const glob = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    const out = [];
    for (const k of all.filter((k) => glob.test(k))) if (!(await this._expired(k))) out.push(k);
    return out;
  }

  // STRLEN — byte length of the stored serialised value (the raw file), 0 when
  // absent. Matches Upstash: values land as JSON strings, STRLEN counts bytes.
  async strlen(key) {
    try {
      const raw = await fs.readFile(this._file(key));
      return raw.byteLength;
    } catch (e) {
      if (e.code === 'ENOENT') return 0;
      throw e;
    }
  }

  // Minimal pipeline — the handler's index path batches STRLENs through it,
  // and the played tables their touched maps. Sequential here; one round trip
  // on real Upstash.
  pipeline() {
    const self = this;
    const cmds = [];
    return {
      strlen(key) { cmds.push(['strlen', key]); return this; },
      hgetall(key) { cmds.push(['hgetall', key]); return this; },
      async exec() {
        const out = [];
        for (const [op, key] of cmds) out.push(await self[op](key));
        return out;
      },
    };
  }

  // ── Hash ops — the touched map (one hash per surface). File-backed: the
  // hash is one JSON object under its key; single-process rig, so the
  // read-modify-write here needs no lock.
  async hset(key, fields) {
    const cur = (await this.get(key)) || {};
    Object.assign(cur, fields);
    await this.set(key, cur);
    return Object.keys(fields).length;
  }
  async hgetall(key) {
    return (await this.get(key)) || null;
  }
  async hdel(key, ...fields) {
    const cur = await this.get(key);
    if (!cur) return 0;
    let n = 0;
    for (const f of fields) if (f in cur) { delete cur[f]; n += 1; }
    await this.set(key, cur);
    return n;
  }

  // INCR / EXPIRE — the caps' counters. Single-process rig, so read-modify-write
  // needs no lock; EXPIRE is a no-op in the file shim, as EX is on set().
  async incr(key) {
    const n = (Number(await this.get(key)) || 0) + 1;
    await this.set(key, n);
    return n;
  }
  async expire() { return 1; }

  async del(...args) {
    const keys = args.flat();
    let n = 0;
    for (const key of keys) {
      try {
        await fs.unlink(this._file(key));
        n++;
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      await fs.unlink(this._file(key) + '.ttl').catch(() => {});
    }
    return n;
  }
}
