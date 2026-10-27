// Hash helpers. Everything except RIPEMD-160 comes from WebCrypto, which is
// available both in the browser (offline, no network) and in Node 18+.

import { ripemd160 } from './ripemd160.js';

const subtle = globalThis.crypto.subtle;

export async function sha256(bytes) {
  return new Uint8Array(await subtle.digest('SHA-256', bytes));
}

export async function sha512(bytes) {
  return new Uint8Array(await subtle.digest('SHA-512', bytes));
}

export async function hash256(bytes) {
  return sha256(await sha256(bytes));
}

export async function hash160(bytes) {
  return ripemd160(await sha256(bytes));
}

export async function hmacSha512(key, data) {
  const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', k, data));
}

// BIP340 tagged hash: SHA256(SHA256(tag) || SHA256(tag) || msg).
export async function taggedHash(tag, msg) {
  const tagHash = await sha256(new TextEncoder().encode(tag));
  const buf = new Uint8Array(tagHash.length * 2 + msg.length);
  buf.set(tagHash, 0);
  buf.set(tagHash, tagHash.length);
  buf.set(msg, tagHash.length * 2);
  return sha256(buf);
}
