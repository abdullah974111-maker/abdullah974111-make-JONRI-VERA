// Checks wallet.js against the official BIP39 and BIP84 test vectors.
import assert from 'node:assert/strict';
import { mnemonicToSeedSync } from '@scure/bip39';
import { bytesToHex } from '@noble/hashes/utils';
import * as w from './src/wallet.js';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
let n = 0; const ok = (name) => console.log(`ok ${++n} - ${name}`);

// BIP39 vector #1 (passphrase "TREZOR")
assert.equal(bytesToHex(mnemonicToSeedSync(ABANDON, 'TREZOR')),
  'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04');
ok('BIP39 seed vector');

// BIP84 vectors
const wal = w.deriveWallet(ABANDON, { count: 2 });
assert.equal(wal.accountXpub, 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs');
ok('BIP84 account zpub');
assert.equal(wal.receive[0].path, "m/84'/0'/0'/0/0");
assert.equal(wal.receive[0].address, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
assert.equal(wal.receive[0].wif, 'KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d');
ok('BIP84 first receive address + WIF');
assert.equal(wal.receive[1].address, 'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
assert.equal(wal.receive[1].wif, 'Kxpf5b8p3qX56DKEe5NqWbNUP9MnqoRFzZwHRtsFqhzuvUJsYZCy');
ok('BIP84 second receive address + WIF');
assert.equal(wal.change[0].address, 'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
assert.equal(wal.change[0].wif, 'KxuoxufJL5csa1Wieb2kp29VNdn92Us8CoaUG3aGtPtcF3AzeXvF');
ok('BIP84 first change address + WIF');

// Testnet uses coin type 1, tb1 addresses, vpub and c-prefixed WIFs
const t = w.deriveWallet(ABANDON, { network: 'testnet', count: 1 });
assert.equal(t.receive[0].path, "m/84'/1'/0'/0/0");
assert.equal(t.receive[0].address, 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl');
assert.match(t.accountXpub, /^vpub/);
assert.match(t.receive[0].wif, /^c/);
ok('testnet derivation');

// Fresh mnemonics: right length, valid checksum, unique
const seen = new Set();
for (let i = 0; i < 200; i++) {
  for (const words of [12, 24]) {
    const m = w.newMnemonic(words);
    assert.equal(m.split(' ').length, words);
    assert.equal(w.checkMnemonic(m), null);
    seen.add(m);
  }
}
assert.equal(seen.size, 400);
ok('400 generated phrases are valid and unique');

// Validation messages
assert.equal(w.checkMnemonic(w.normalizeMnemonic('  Abandon ABANDON abandon abandon abandon abandon\nabandon abandon abandon abandon abandon about ')), null);
assert.match(w.checkMnemonic('abandon abandon'), /12, 15, 18, 21 or 24/);
assert.match(w.checkMnemonic(ABANDON.replace('about', 'abandon')), /checksum/);
assert.match(w.checkMnemonic(ABANDON.replace('about', 'bitcoinz')), /bitcoinz/);
ok('phrase validation');
console.log(`\nall ${n} checks passed`);
