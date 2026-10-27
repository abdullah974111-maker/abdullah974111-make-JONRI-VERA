import test from 'node:test';
import assert from 'node:assert/strict';

import { ripemd160 } from '../src/ripemd160.js';
import { bytesToHex, hexToBytes, segwitAddress } from '../src/encoding.js';
import { CURVE_P, G, isOnCurve, liftX, pointAdd, pointMultiply, serializePoint } from '../src/secp256k1.js';
import {
  addressFromPublicKey,
  decodeWif,
  derivePath,
  describePrivateKey,
  encodeWif,
  masterFromSeed,
  parseExtendedKey,
  parsePath,
  parsePrivateKey,
  randomPrivateKey,
  serializeExtendedKey,
} from '../src/btc-keys.js';

const keyOne = hexToBytes('0000000000000000000000000000000000000000000000000000000000000001');

test('RIPEMD-160 matches the reference vectors', () => {
  assert.equal(bytesToHex(ripemd160('')), '9c1185a5c5e9fc54612808977ee8f548b2258d31');
  assert.equal(bytesToHex(ripemd160('abc')), '8eb208f7e05d987a9b044a8e98c6b087f15a0bfc');
  assert.equal(
    bytesToHex(ripemd160('message digest')),
    '5d0689ef49d2fae572b881b123a85ffa21595f36',
  );
  assert.equal(
    bytesToHex(ripemd160('abcdefghijklmnopqrstuvwxyz')),
    'f71c27109c692c1b56bbdceb5b9d2865b3708dbc',
  );
});

test('the generator point is the public key for private key 1', () => {
  const point = pointMultiply(1n);
  assert.equal(point.x, G.x);
  assert.equal(point.y, G.y);
  assert.ok(isOnCurve(point));
  assert.equal(
    serializePoint(point, true),
    '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  );
  assert.equal(
    serializePoint(point, false),
    '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
      + '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8',
  );
});

test('point arithmetic is consistent across addition chains', () => {
  // 3G + 4G must equal 7G.
  const seven = pointMultiply(7n);
  const added = pointAdd(pointMultiply(3n), pointMultiply(4n));
  assert.ok(isOnCurve(seven));
  assert.equal(added.x, seven.x);
  assert.equal(added.y, seven.y);
  // Doubling via addition must match scalar multiplication.
  const doubled = pointAdd(G, G);
  assert.equal(doubled.x, pointMultiply(2n).x);
});

test('lift_x recovers the even-y point', () => {
  const lifted = liftX(G.x);
  assert.ok(isOnCurve(lifted));
  assert.equal(lifted.y % 2n, 0n);
  assert.equal(lifted.y, G.y % 2n === 0n ? G.y : CURVE_P - G.y);
});

test('private key 1 produces the well-known addresses and WIFs', async () => {
  const described = await describePrivateKey(keyOne);

  assert.equal(described.publicKey.hash160Compressed, '751e76e8199196d454941c45d1b3a323f1433bd6');
  assert.equal(described.addresses.p2pkhCompressed, '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH');
  assert.equal(described.addresses.p2pkhUncompressed, '1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm');
  assert.equal(described.addresses.p2wpkh, 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
  assert.equal(
    described.privateKey.wifUncompressed,
    '5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf',
  );
  assert.equal(
    described.privateKey.wifCompressed,
    'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn',
  );
  assert.equal(described.privateKey.decimal, '1');
});

test('segwit encoding matches the BIP173 example', () => {
  assert.equal(
    segwitAddress('bc', 0, hexToBytes('751e76e8199196d454941c45d1b3a323f1433bd6')),
    'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  );
  assert.equal(
    segwitAddress('tb', 0, hexToBytes('751e76e8199196d454941c45d1b3a323f1433bd6')),
    'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
  );
  // P2WSH: a 32-byte witness program.
  assert.equal(
    segwitAddress('tb', 0, hexToBytes('1863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262')),
    'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
  );
});

test('WIF round-trips and carries its flags', async () => {
  const wif = await encodeWif(keyOne, { compressed: true, network: 'mainnet' });
  const decoded = await decodeWif(wif);
  assert.equal(bytesToHex(decoded.key), bytesToHex(keyOne));
  assert.equal(decoded.compressed, true);
  assert.equal(decoded.network, 'mainnet');

  const testnetWif = await encodeWif(keyOne, { compressed: false, network: 'testnet' });
  const testnetDecoded = await decodeWif(testnetWif);
  assert.equal(testnetDecoded.compressed, false);
  assert.equal(testnetDecoded.network, 'testnet');
});

test('private keys parse from hex, decimal and WIF', async () => {
  const fromHex = await parsePrivateKey('0'.repeat(63) + '1');
  assert.equal(bytesToHex(fromHex.key), bytesToHex(keyOne));
  assert.equal(fromHex.format, 'hex');

  const fromDecimal = await parsePrivateKey('1');
  assert.equal(bytesToHex(fromDecimal.key), bytesToHex(keyOne));

  const fromWif = await parsePrivateKey('KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn');
  assert.equal(bytesToHex(fromWif.key), bytesToHex(keyOne));
  assert.equal(fromWif.compressed, true);
});

test('out-of-range and malformed keys are rejected', async () => {
  await assert.rejects(() => parsePrivateKey('0'.repeat(64)), /at least 1/);
  await assert.rejects(
    () => parsePrivateKey('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),
    /below the curve order/,
  );
  await assert.rejects(() => parsePrivateKey('hello'), /not recognised/);
  await assert.rejects(() => parsePrivateKey(''), /enter a private key/);
});

test('generated keys are in range and 32 bytes', async () => {
  for (let i = 0; i < 5; i++) {
    const key = randomPrivateKey();
    assert.equal(key.length, 32);
    const described = await describePrivateKey(key);
    assert.match(described.addresses.p2wpkh, /^bc1q[a-z0-9]{38}$/);
  }
});

test('BIP32 test vector 1: master key from seed', async () => {
  const master = await masterFromSeed(hexToBytes('000102030405060708090a0b0c0d0e0f'));
  assert.equal(
    await serializeExtendedKey(master, { private: true }),
    'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi',
  );
  assert.equal(
    await serializeExtendedKey(master, { private: false }),
    'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8',
  );
});

test('BIP32 test vector 1: hardened and normal children', async () => {
  const master = await masterFromSeed(hexToBytes('000102030405060708090a0b0c0d0e0f'));

  const h0 = await derivePath(master, "m/0'");
  assert.equal(
    await serializeExtendedKey(h0, { private: true }),
    'xprv9uHRZZhk6KAJC1avXpDAp4MDc3sQKNxDiPvvkX8Br5ngLNv1TxvUxt4cV1rGL5hj6KCesnDYUhd7oWgT11eZG7XnxHrnYeSvkzY7d2bhkJ7',
  );

  const deep = await derivePath(master, "m/0'/1/2'/2/1000000000");
  assert.equal(
    await serializeExtendedKey(deep, { private: true }),
    'xprvA41z7zogVVwxVSgdKUHDy1SKmdb533PjDz7J6N6mV6uS3ze1ai8FHa8kmHScGpWmj4WggLyQjgPie1rFSruoUihUZREPSL39UNdE3BBDu76',
  );
});

test('public-only derivation agrees with private derivation', async () => {
  const master = await masterFromSeed(hexToBytes('000102030405060708090a0b0c0d0e0f'));
  const xpub = await serializeExtendedKey(master, { private: false });
  const { node: watchOnly, hasPrivateKey } = await parseExtendedKey(xpub);
  assert.equal(hasPrivateKey, false);

  const fromPrivate = await derivePath(master, 'm/0/1/2');
  const fromPublic = await derivePath(watchOnly, 'm/0/1/2');
  assert.equal(bytesToHex(fromPublic.publicKey), bytesToHex(fromPrivate.publicKey));
  assert.equal(bytesToHex(fromPublic.chainCode), bytesToHex(fromPrivate.chainCode));

  await assert.rejects(() => derivePath(watchOnly, "m/0'"), /cannot derive hardened/);
});

test('BIP86 test vector: taproot addresses from the root xprv', async () => {
  const root = 'xprv9s21ZrQH143K3GJpoapnV8SFfukcVBSfeCficPSGfubmSFDxo1kuHnLisriDvSnRRuL2Qrg5ggqHKNVpxR86QEC8w35uxmGoggxtQTPvfUu';
  const { node } = await parseExtendedKey(root);

  const first = await derivePath(node, "m/86'/0'/0'/0/0");
  assert.equal(
    await addressFromPublicKey(bytesToHex(first.publicKey), 'p2tr'),
    'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
  );

  const second = await derivePath(node, "m/86'/0'/0'/0/1");
  assert.equal(
    await addressFromPublicKey(bytesToHex(second.publicKey), 'p2tr'),
    'bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh',
  );

  const change = await derivePath(node, "m/86'/0'/0'/1/0");
  assert.equal(
    await addressFromPublicKey(bytesToHex(change.publicKey), 'p2tr'),
    'bc1p3qkhfews2uk44qtvauqyr2ttdsw7svhkl9nkm9s9c3x4ax5h60wqwruhk7',
  );
});

test('path parsing handles both hardened notations', () => {
  assert.deepEqual(parsePath("m/84'/0'/0'/0/0"), [2147483732, 2147483648, 2147483648, 0, 0]);
  assert.deepEqual(parsePath('m/84h/0h/0h/0/0'), [2147483732, 2147483648, 2147483648, 0, 0]);
  assert.deepEqual(parsePath('m'), []);
  assert.throws(() => parsePath('m/abc'), /not a valid path element/);
});

test('address types reject keys they cannot encode', async () => {
  const described = await describePrivateKey(keyOne);
  await assert.rejects(
    () => addressFromPublicKey(described.publicKey.uncompressed, 'p2wpkh'),
    /requires a compressed public key/,
  );
});

test('testnet uses its own prefixes', async () => {
  const described = await describePrivateKey(keyOne, { network: 'testnet' });
  assert.match(described.addresses.p2pkhCompressed, /^[mn]/);
  assert.match(described.addresses.p2wpkh, /^tb1q/);
  assert.match(described.privateKey.wifCompressed, /^c/);
});
