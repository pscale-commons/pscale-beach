// image-seal.mjs — a nightly image sealed at rest, in OpenSSL's own envelope, so a sealed image
// opens on any machine with no script of ours:
//
//   openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BEACH_IMAGE_KEY -in beach-<ts>.json.gz.enc | gunzip
//
// The envelope is `Salted__` + an 8-byte salt + AES-256-CBC, the key and IV drawn from the
// passphrase with PBKDF2-HMAC-SHA256 at OpenSSL's 10,000 rounds — what `openssl enc -pbkdf2` writes
// and reads. An image carries every block and every lock hash of a beach (who-answers 1.1116: the
// nightly images stay encrypted on the operator's drives), so beach-backup.sh seals each one when
// BEACH_IMAGE_KEY is set, and beach-restore.mjs and tombstone.mjs open them with the same key.

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const MAGIC = Buffer.from('Salted__');
const ROUNDS = 10000;

function keyIv(key, salt) {
  const k = pbkdf2Sync(String(key), salt, ROUNDS, 48, 'sha256');
  return [k.subarray(0, 32), k.subarray(32, 48)];
}

/** Seal bytes under a passphrase. */
export function seal(plain, key) {
  const salt = randomBytes(8);
  const [k, iv] = keyIv(key, salt);
  const c = createCipheriv('aes-256-cbc', k, iv);
  return Buffer.concat([MAGIC, salt, c.update(plain), c.final()]);
}

/** Open sealed bytes. A wrong key fails the final block's padding and throws. */
export function open(sealed, key) {
  if (sealed.length < 16 || !sealed.subarray(0, 8).equals(MAGIC)) throw new Error('not a sealed image (no Salted__ envelope)');
  const [k, iv] = keyIv(key, sealed.subarray(8, 16));
  const d = createDecipheriv('aes-256-cbc', k, iv);
  return Buffer.concat([d.update(sealed.subarray(16)), d.final()]);
}

/** Whether a file name is one of the backup's images: beach-<ts>.json[.gz][.enc], or beach-latest.json. */
export function isImageFile(name) {
  return /^beach-\d{4}-\d{2}-\d{2}T[\d-]+Z\.json(\.gz)?(\.enc)?$/.test(name) || name === 'beach-latest.json';
}

/** Read an image whatever its state on disk: plain, gzipped, sealed, or sealed and gzipped. */
export async function readImage(path, key) {
  let buf = await fs.readFile(path);
  let p = path;
  if (p.endsWith('.enc')) {
    if (!key) throw new Error(`${path} is sealed — set BEACH_IMAGE_KEY to open it`);
    buf = open(buf, key);
    p = p.slice(0, -'.enc'.length);
  }
  if (p.endsWith('.gz')) buf = gunzipSync(buf);
  return JSON.parse(buf.toString('utf8'));
}

/** Write an image back in the state its name says, atomically (a temp file, then a rename). */
export async function writeImage(path, snap, key) {
  let buf = Buffer.from(JSON.stringify(snap));
  let p = path;
  const sealed = p.endsWith('.enc');
  if (sealed) p = p.slice(0, -'.enc'.length);
  if (p.endsWith('.gz')) buf = gzipSync(buf);
  if (sealed) {
    if (!key) throw new Error(`${path} is sealed — set BEACH_IMAGE_KEY to write it`);
    buf = seal(buf, key);
  }
  const tmp = `${path}.tmp-${process.pid}`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, path);
}
