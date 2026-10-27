# Bitcoin Key Calculator

Offline key derivation for Bitcoin: a private key or BIP32 seed goes in, the
public key, WIF encodings and every common address type come out. One
self-contained HTML file, no dependencies, no network access.

## Use it

```
open index.html          # macOS
xdg-open index.html      # Linux
```

That is the whole install. `index.html` is generated and committed, so no build
step is needed to use it.

For a key that holds real funds: download the file, disconnect the machine, then
open it.

## What it calculates

**Single key** — accepts 64 hex digits, a decimal integer, or WIF (which also
carries its own network and compression flag, both of which are honoured and
reported).

| Output | Detail |
| --- | --- |
| Private key | hex, decimal, WIF compressed, WIF uncompressed |
| Public key | compressed (33 bytes), uncompressed (65 bytes), point `x`/`y`, HASH160 |
| P2PKH | `1…` — compressed and uncompressed, BIP44 |
| P2SH-P2WPKH | `3…` — nested segwit, BIP49 |
| P2WPKH | `bc1q…` — native segwit, BIP84 |
| P2TR | `bc1p…` — taproot, BIP86 |

Mainnet and testnet both supported.

**HD wallet** — a master key from a seed, or an imported `xprv`/`xpub`/`tprv`/
`tpub`. Derives any path (hardened with either `'` or `h`), serialises extended
keys at each level, and lists derived addresses with their public keys and WIFs.
An `xpub` gives watch-only derivation: normal children work, hardened children
are refused with an explanation rather than a silent wrong answer.

The address type follows the BIP43 purpose in the path by default — `44'` →
P2PKH, `49'` → P2SH-P2WPKH, `84'` → P2WPKH, `86'` → P2TR — and can be overridden.

## What it does not do

It will not take an address and search for the private key that controls it.
"Key hunting", puzzle scanners and brute-force range searches have no use except
spending coins belonging to someone else, and against a 256-bit keyspace they do
not work regardless of how they are marketed.

## How it works

| Piece | Implementation |
| --- | --- |
| secp256k1 | `BigInt`, affine coordinates — `src/secp256k1.js` |
| SHA-256, SHA-512, HMAC-SHA512 | WebCrypto (`crypto.subtle`), available offline in both browser and Node |
| RIPEMD-160 | written out in `src/ripemd160.js`, because WebCrypto omits it and HASH160 needs it |
| Base58Check, Bech32, Bech32m | `src/encoding.js` |
| Keys, addresses, BIP32 | `src/btc-keys.js` |
| Interface | `src/ui.js` + `src/index.template.html` |

The page carries `Content-Security-Policy: default-src 'none'`, so it cannot
make a network request of any kind — no fetch, no images, no fonts, no beacons.

Random keys and seeds come from `crypto.getRandomValues` with rejection sampling
so the result is uniform over `[1, n-1]`.

## Development

```
npm test      # 17 tests against published vectors
npm run build # regenerate index.html from src/
npm run check # both
```

`src/` holds the ES modules and is the source of truth; `build.js` flattens them
into the single inline `<script>` in `index.html`. The flattening exists because
ES module imports are blocked over `file://`, and running from `file://` is the
point.

Tests cover:

- RIPEMD-160 reference vectors
- BIP32 test vector 1 — master key, `m/0'`, `m/0'/1/2'/2/1000000000`
- BIP86 taproot vectors — receive 0, receive 1, change 0
- BIP173 segwit examples, P2WPKH and P2WSH
- the long-standing private-key-of-1 addresses and WIFs
- xpub-only derivation agreeing with private derivation, and hardened derivation
  from an xpub being refused
- out-of-range keys (`0`, `n`), malformed input, and testnet prefixes

Edit anything under `src/`, then run `npm run check` before committing — the
committed `index.html` must match the modules it was built from.
