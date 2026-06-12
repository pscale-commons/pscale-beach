// file-redis.mjs — a folder-backed shim for the four Upstash methods the beach
// handler uses (get / set / keys / del). One JSON file per key. Lets the REAL
// api/pscale-beach.js run offline against a directory, with full fidelity
// (shape derivation, locks, append-supernest) — the run-time leg of the
// three-legged cartridge loop. See scripts/local-beach.mjs.
//
// Upstash semantics mirrored: get auto-deserialises (returns the parsed value
// or null); set auto-serialises an object/string; keys(pattern) supports the
// trailing-'*' globs the handler uses; del returns the count removed.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export class FileRedis {
  constructor(dir) { this.dir = dir; }

  _file(key) { return join(this.dir, encodeURIComponent(key) + '.json'); }

  async get(key) {
    try {
      return JSON.parse(await fs.readFile(this._file(key), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  async set(key, val) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this._file(key), JSON.stringify(val));
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
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return all.filter((k) => k.startsWith(prefix));
    }
    return all.filter((k) => k === pattern);
  }

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
    }
    return n;
  }
}
