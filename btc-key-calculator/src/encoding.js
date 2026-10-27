// Hex, Base58Check and Bech32/Bech32m.

import { hash256 } from './hashes.js';

export function bytesToHex(bytes) {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function hexToBytes(hex) {
  const clean = hex.replace(/^0x/i, '').trim();
  if (clean.length % 2 !== 0) throw new Error('hex string has an odd length');
  if (!/^[0-9a-f]*$/i.test(clean)) throw new Error('hex string has non-hex characters');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function concatBytes(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export function bytesToBigInt(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

export function bigIntToBytes(n, length) {
  const out = new Uint8Array(length);
  let v = n;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error(`value does not fit in ${length} bytes`);
  return out;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes) {
  let n = bytesToBigInt(bytes);
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

export function base58Decode(str) {
  let n = 0n;
  for (const ch of str) {
    const idx = B58.indexOf(ch);
    if (idx < 0) throw new Error(`"${ch}" is not a Base58 character`);
    n = n * 58n + BigInt(idx);
  }
  const body = [];
  while (n > 0n) {
    body.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  let zeros = 0;
  for (const ch of str) {
    if (ch !== '1') break;
    zeros++;
  }
  return new Uint8Array([...new Uint8Array(zeros), ...body]);
}

export async function base58CheckEncode(payload) {
  const checksum = (await hash256(payload)).slice(0, 4);
  return base58Encode(concatBytes(payload, checksum));
}

export async function base58CheckDecode(str) {
  const raw = base58Decode(str);
  if (raw.length < 5) throw new Error('Base58Check string is too short');
  const payload = raw.slice(0, -4);
  const checksum = raw.slice(-4);
  const expected = (await hash256(payload)).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expected[i]) throw new Error('Base58Check checksum does not match');
  }
  return payload;
}

const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function hrpExpand(hrp) {
  const out = [];
  for (const ch of hrp) out.push(ch.charCodeAt(0) >> 5);
  out.push(0);
  for (const ch of hrp) out.push(ch.charCodeAt(0) & 31);
  return out;
}

function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const out = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv)) {
    throw new Error('cannot convert bit groups');
  }
  return out;
}

// Segwit address. Witness version 0 uses Bech32, versions 1+ use Bech32m.
export function segwitAddress(hrp, version, program) {
  const data = [version, ...convertBits(program, 8, 5, true)];
  const constant = version === 0 ? BECH32_CONST : BECH32M_CONST;
  const values = [...hrpExpand(hrp), ...data];
  const mod = polymod([...values, 0, 0, 0, 0, 0, 0]) ^ constant;
  const checksum = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data, ...checksum].map((d) => BECH32[d]).join('')}`;
}
