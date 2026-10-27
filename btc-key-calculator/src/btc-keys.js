// High-level Bitcoin key derivation: private key -> public key -> addresses,
// plus BIP32 hierarchical deterministic derivation.

import { hash160, hmacSha512, taggedHash } from './hashes.js';
import {
  base58CheckDecode,
  base58CheckEncode,
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  concatBytes,
  hexToBytes,
  segwitAddress,
} from './encoding.js';
import {
  CURVE_N,
  CURVE_P,
  liftX,
  pointAdd,
  pointMultiply,
  serializePoint,
} from './secp256k1.js';

export const NETWORKS = {
  mainnet: {
    name: 'mainnet',
    wif: 0x80,
    p2pkh: 0x00,
    p2sh: 0x05,
    hrp: 'bc',
    xprv: 0x0488ade4,
    xpub: 0x0488b21e,
  },
  testnet: {
    name: 'testnet',
    wif: 0xef,
    p2pkh: 0x6f,
    p2sh: 0xc4,
    hrp: 'tb',
    xprv: 0x04358394,
    xpub: 0x043587cf,
  },
};

function networkFor(name) {
  const net = NETWORKS[name];
  if (!net) throw new Error(`unknown network "${name}"`);
  return net;
}

export function randomPrivateKey() {
  // Rejection sampling: a uniform 32-byte value can land outside [1, n-1].
  for (let attempt = 0; attempt < 64; attempt++) {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    const value = bytesToBigInt(bytes);
    if (value >= 1n && value < CURVE_N) return bytes;
  }
  throw new Error('could not draw a key in range');
}

export async function encodeWif(keyBytes, { compressed = true, network = 'mainnet' } = {}) {
  const net = networkFor(network);
  const parts = [new Uint8Array([net.wif]), keyBytes];
  if (compressed) parts.push(new Uint8Array([0x01]));
  return base58CheckEncode(concatBytes(...parts));
}

export async function decodeWif(wif) {
  const payload = await base58CheckDecode(wif);
  const version = payload[0];
  const network = Object.values(NETWORKS).find((n) => n.wif === version);
  if (!network) throw new Error(`0x${version.toString(16)} is not a WIF version byte`);
  if (payload.length === 34 && payload[33] === 0x01) {
    return { key: payload.slice(1, 33), compressed: true, network: network.name };
  }
  if (payload.length === 33) {
    return { key: payload.slice(1, 33), compressed: false, network: network.name };
  }
  throw new Error('WIF payload is not 33 or 34 bytes');
}

// Accepts raw hex, decimal, or WIF. WIF also carries the compression flag and
// the network, so those are reported back and the caller can honour them.
export async function parsePrivateKey(input) {
  const text = input.trim();
  if (!text) throw new Error('enter a private key');

  if (/^(0x)?[0-9a-f]{64}$/i.test(text)) {
    const key = hexToBytes(text);
    assertInRange(bytesToBigInt(key));
    return { key, format: 'hex' };
  }

  if (/^[0-9]+$/.test(text)) {
    const value = BigInt(text);
    assertInRange(value);
    return { key: bigIntToBytes(value, 32), format: 'decimal' };
  }

  if (/^[5KLc9]/.test(text)) {
    const decoded = await decodeWif(text);
    assertInRange(bytesToBigInt(decoded.key));
    return { ...decoded, format: 'wif' };
  }

  throw new Error('not recognised as 64-digit hex, a decimal integer, or WIF');
}

function assertInRange(value) {
  if (value < 1n) throw new Error('a private key must be at least 1');
  if (value >= CURVE_N) throw new Error('a private key must be below the curve order n');
}

export async function taprootOutputKey(internalPoint) {
  const xOnly = bigIntToBytes(internalPoint.x, 32);
  const tweak = bytesToBigInt(await taggedHash('TapTweak', xOnly));
  if (tweak >= CURVE_N) throw new Error('tweak is out of range');
  const even = liftX(internalPoint.x);
  const output = pointAdd(even, pointMultiply(tweak));
  if (output === null) throw new Error('tweaked key is the point at infinity');
  return bigIntToBytes(output.x, 32);
}

// Everything derivable from one private key, for one network.
export async function describePrivateKey(keyBytes, { network = 'mainnet' } = {}) {
  const net = networkFor(network);
  const value = bytesToBigInt(keyBytes);
  assertInRange(value);

  const point = pointMultiply(value);
  const compressedHex = serializePoint(point, true);
  const uncompressedHex = serializePoint(point, false);
  const compressedPub = hexToBytes(compressedHex);
  const uncompressedPub = hexToBytes(uncompressedHex);

  const compressedHash = await hash160(compressedPub);
  const uncompressedHash = await hash160(uncompressedPub);

  const redeemScript = concatBytes(new Uint8Array([0x00, 0x14]), compressedHash);

  return {
    network: net.name,
    privateKey: {
      hex: bytesToHex(keyBytes),
      decimal: value.toString(10),
      wifCompressed: await encodeWif(keyBytes, { compressed: true, network: net.name }),
      wifUncompressed: await encodeWif(keyBytes, { compressed: false, network: net.name }),
    },
    publicKey: {
      compressed: compressedHex,
      uncompressed: uncompressedHex,
      x: point.x.toString(16).padStart(64, '0'),
      y: point.y.toString(16).padStart(64, '0'),
      hash160Compressed: bytesToHex(compressedHash),
      hash160Uncompressed: bytesToHex(uncompressedHash),
    },
    addresses: {
      p2pkhCompressed: await base58CheckEncode(
        concatBytes(new Uint8Array([net.p2pkh]), compressedHash),
      ),
      p2pkhUncompressed: await base58CheckEncode(
        concatBytes(new Uint8Array([net.p2pkh]), uncompressedHash),
      ),
      p2shP2wpkh: await base58CheckEncode(
        concatBytes(new Uint8Array([net.p2sh]), await hash160(redeemScript)),
      ),
      p2wpkh: segwitAddress(net.hrp, 0, compressedHash),
      p2tr: segwitAddress(net.hrp, 1, await taprootOutputKey(point)),
    },
  };
}

export async function addressFromPublicKey(publicKeyHex, type, network = 'mainnet') {
  const net = networkFor(network);
  const pub = hexToBytes(publicKeyHex);
  const compressed = pub[0] === 0x02 || pub[0] === 0x03;

  if (type !== 'p2pkh' && !compressed) {
    throw new Error(`${type} requires a compressed public key`);
  }

  switch (type) {
    case 'p2pkh':
      return base58CheckEncode(concatBytes(new Uint8Array([net.p2pkh]), await hash160(pub)));
    case 'p2sh-p2wpkh': {
      const redeem = concatBytes(new Uint8Array([0x00, 0x14]), await hash160(pub));
      return base58CheckEncode(concatBytes(new Uint8Array([net.p2sh]), await hash160(redeem)));
    }
    case 'p2wpkh':
      return segwitAddress(net.hrp, 0, await hash160(pub));
    case 'p2tr': {
      const x = bytesToBigInt(pub.slice(1, 33));
      return segwitAddress(net.hrp, 1, await taprootOutputKey(liftX(x)));
    }
    default:
      throw new Error(`unknown address type "${type}"`);
  }
}

/* ------------------------------- BIP32 -------------------------------- */

const HARDENED = 0x80000000;

async function nodeFromPrivate(privateKey, chainCode, depth, parentFingerprint, index) {
  const value = bytesToBigInt(privateKey);
  assertInRange(value);
  const point = pointMultiply(value);
  return {
    privateKey,
    publicKey: hexToBytes(serializePoint(point, true)),
    point,
    chainCode,
    depth,
    parentFingerprint,
    index,
  };
}

function nodeFromPublic(publicKey, point, chainCode, depth, parentFingerprint, index) {
  return { privateKey: null, publicKey, point, chainCode, depth, parentFingerprint, index };
}

export async function masterFromSeed(seed) {
  if (seed.length < 16 || seed.length > 64) {
    throw new Error('BIP32 seeds are 16 to 64 bytes (128 to 512 bits)');
  }
  const I = await hmacSha512(new TextEncoder().encode('Bitcoin seed'), seed);
  return nodeFromPrivate(I.slice(0, 32), I.slice(32), 0, new Uint8Array(4), 0);
}

export function randomSeed(bytes = 32) {
  const seed = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(seed);
  return seed;
}

async function fingerprint(node) {
  return (await hash160(node.publicKey)).slice(0, 4);
}

function ser32(n) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, false);
  return out;
}

export async function deriveChild(node, index) {
  const hardened = index >= HARDENED;
  if (hardened && !node.privateKey) {
    throw new Error(`cannot derive hardened index ${index - HARDENED}' from a public key`);
  }

  const data = hardened
    ? concatBytes(new Uint8Array([0]), node.privateKey, ser32(index))
    : concatBytes(node.publicKey, ser32(index));

  const I = await hmacSha512(node.chainCode, data);
  const tweak = bytesToBigInt(I.slice(0, 32));
  if (tweak >= CURVE_N) throw new Error('derived tweak is out of range; use the next index');

  const parentFp = await fingerprint(node);

  if (node.privateKey) {
    const child = (tweak + bytesToBigInt(node.privateKey)) % CURVE_N;
    if (child === 0n) throw new Error('derived key is zero; use the next index');
    return nodeFromPrivate(bigIntToBytes(child, 32), I.slice(32), node.depth + 1, parentFp, index);
  }

  const point = pointAdd(pointMultiply(tweak), node.point);
  if (point === null) throw new Error('derived key is the point at infinity; use the next index');
  return nodeFromPublic(
    hexToBytes(serializePoint(point, true)),
    point,
    I.slice(32),
    node.depth + 1,
    parentFp,
    index,
  );
}

export function parsePath(path) {
  const trimmed = path.trim().replace(/^m\/?/i, '');
  if (!trimmed) return [];
  return trimmed.split('/').map((part) => {
    const match = /^(\d+)(['h])?$/i.exec(part.trim());
    if (!match) throw new Error(`"${part}" is not a valid path element`);
    const index = Number(match[1]);
    if (index >= HARDENED) throw new Error(`index ${index} is too large`);
    return match[2] ? index + HARDENED : index;
  });
}

export async function derivePath(node, path) {
  let current = node;
  for (const index of parsePath(path)) current = await deriveChild(current, index);
  return current;
}

export function formatPath(indices) {
  return ['m', ...indices.map((i) => (i >= HARDENED ? `${i - HARDENED}'` : `${i}`))].join('/');
}

export async function serializeExtendedKey(node, { network = 'mainnet', private: wantPrivate } = {}) {
  const net = networkFor(network);
  if (wantPrivate && !node.privateKey) throw new Error('this node has no private key');
  const keyData = wantPrivate
    ? concatBytes(new Uint8Array([0]), node.privateKey)
    : node.publicKey;
  const version = new Uint8Array(4);
  new DataView(version.buffer).setUint32(0, wantPrivate ? net.xprv : net.xpub, false);
  return base58CheckEncode(
    concatBytes(
      version,
      new Uint8Array([node.depth]),
      node.parentFingerprint,
      ser32(node.index),
      node.chainCode,
      keyData,
    ),
  );
}

export async function parseExtendedKey(text) {
  const payload = await base58CheckDecode(text.trim());
  if (payload.length !== 78) throw new Error('an extended key is 78 bytes before the checksum');
  const version = new DataView(payload.buffer, payload.byteOffset).getUint32(0, false);
  const net = Object.values(NETWORKS).find((n) => n.xprv === version || n.xpub === version);
  if (!net) throw new Error(`0x${version.toString(16)} is not an xprv/xpub version`);

  const depth = payload[4];
  const parentFingerprint = payload.slice(5, 9);
  const index = new DataView(payload.buffer, payload.byteOffset).getUint32(9, false);
  const chainCode = payload.slice(13, 45);
  const keyData = payload.slice(45, 78);

  if (version === net.xprv) {
    if (keyData[0] !== 0) throw new Error('private extended keys are padded with a zero byte');
    const node = await nodeFromPrivate(
      keyData.slice(1),
      chainCode,
      depth,
      parentFingerprint,
      index,
    );
    return { node, network: net.name, hasPrivateKey: true };
  }

  if (keyData[0] !== 0x02 && keyData[0] !== 0x03) {
    throw new Error('public extended keys start with 0x02 or 0x03');
  }
  // liftX returns the even-y point; the prefix says which parity we want.
  const even = liftX(bytesToBigInt(keyData.slice(1)));
  const resolved = keyData[0] === 0x03 ? { x: even.x, y: CURVE_P - even.y } : even;
  return {
    node: nodeFromPublic(keyData, resolved, chainCode, depth, parentFingerprint, index),
    network: net.name,
    hasPrivateKey: false,
  };
}

// Address type conventions, by BIP43 purpose.
export const PURPOSE_ADDRESS_TYPES = {
  44: 'p2pkh',
  49: 'p2sh-p2wpkh',
  84: 'p2wpkh',
  86: 'p2tr',
};

export function addressTypeForPath(path) {
  const indices = parsePath(path);
  if (!indices.length) return 'p2pkh';
  const purpose = indices[0] >= HARDENED ? indices[0] - HARDENED : indices[0];
  return PURPOSE_ADDRESS_TYPES[purpose] ?? 'p2pkh';
}

export { HARDENED };
