// Bitcoin wallet derivation: BIP39 mnemonics, BIP32 HD keys, BIP84 native SegWit addresses.
// All randomness comes from crypto.getRandomValues (via @scure/bip39); nothing leaves the page.
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { bech32, createBase58check } from '@scure/base';

const base58check = createBase58check(sha256);

export const NETWORKS = {
  mainnet: { coin: 0, hrp: 'bc', wif: 0x80, label: 'Bitcoin mainnet',
             versions: { private: 0x04b2430c, public: 0x04b24746 } }, // zprv / zpub
  testnet: { coin: 1, hrp: 'tb', wif: 0xef, label: 'Bitcoin testnet',
             versions: { private: 0x045f18bc, public: 0x045f1cf6 } }, // vprv / vpub
};

export { wordlist };

export function newMnemonic(words = 12) {
  if (words !== 12 && words !== 24) throw new Error('Word count must be 12 or 24');
  return generateMnemonic(wordlist, words === 12 ? 128 : 256);
}

/** Lower-cases, trims and collapses whitespace so pasted phrases validate. */
export function normalizeMnemonic(text) {
  return text.normalize('NFKD').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

/** Returns null if valid, otherwise a human-readable reason. */
export function checkMnemonic(mnemonic) {
  const words = mnemonic ? mnemonic.split(' ') : [];
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    return `A recovery phrase has 12, 15, 18, 21 or 24 words (this one has ${words.length}).`;
  }
  const unknown = words.filter((w) => !wordlist.includes(w));
  if (unknown.length) return `Not in the BIP39 English word list: ${unknown.join(', ')}`;
  if (!validateMnemonic(mnemonic, wordlist)) {
    return 'The checksum does not match: a word is wrong or the words are out of order.';
  }
  return null;
}

function hash160(bytes) {
  return ripemd160(sha256(bytes));
}

export function p2wpkhAddress(publicKey, hrp) {
  return bech32.encode(hrp, [0, ...bech32.toWords(hash160(publicKey))]);
}

export function toWif(privateKey, prefix) {
  const payload = new Uint8Array(34);
  payload[0] = prefix;
  payload.set(privateKey, 1);
  payload[33] = 0x01; // compressed public key
  return base58check.encode(payload);
}

/**
 * Derives the BIP84 account 0 of a mnemonic.
 * @returns {{ accountPath, accountXpub, receive: Array, change: Array }}
 */
export function deriveWallet(mnemonic, { passphrase = '', network = 'mainnet', count = 5 } = {}) {
  const net = NETWORKS[network];
  if (!net) throw new Error(`Unknown network: ${network}`);
  const seed = mnemonicToSeedSync(mnemonic, passphrase);
  const root = HDKey.fromMasterSeed(seed, net.versions);
  const accountPath = `m/84'/${net.coin}'/0'`;
  const account = root.derive(accountPath);

  const chain = (branch) => {
    const node = account.deriveChild(branch);
    return Array.from({ length: count }, (_, i) => {
      const key = node.deriveChild(i);
      return {
        path: `${accountPath}/${branch}/${i}`,
        address: p2wpkhAddress(key.publicKey, net.hrp),
        wif: toWif(key.privateKey, net.wif),
      };
    });
  };

  return {
    accountPath,
    accountXpub: account.publicExtendedKey,
    receive: chain(0),
    change: chain(1),
  };
}
