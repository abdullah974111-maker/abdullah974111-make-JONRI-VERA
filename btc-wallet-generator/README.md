# Bitcoin Wallet Generator

A free Bitcoin wallet generator that runs entirely in the browser. It creates a
BIP39 recovery phrase and its native SegWit (`bc1q…`) addresses, and can show the
addresses of a phrase you already own. No server, no tracking, no network requests.
The page also works offline when opened as a downloaded file.

## Deploy to Netlify

**Option 1: drag and drop (no account setup beyond signing in)**

1. Download [`netlify-drop.zip`](https://github.com/abdullah974111-maker/abdullah974111-make-JONRI-VERA/raw/claude/bitcoin-cli-rpc-dxl6m8/btc-wallet-generator/netlify-drop.zip)
   (the contents of `site/`, ready to upload).
2. Go to <https://app.netlify.com/drop> and drag the zip (or the `site` folder) onto the page.
3. Netlify gives you a public link right away. You can rename it under
   *Site configuration → Change site name*.

**Option 2: connect the GitHub repository (redeploys on every push)**

1. In Netlify: *Add new site → Import an existing project → GitHub*, then pick this repository.
2. Choose the branch you want to deploy. The `netlify.toml` at the repository root
   already sets everything (base `btc-wallet-generator`, build command, publish folder `site`),
   so leave the build settings empty.
3. Click *Deploy*. Each build runs the test vectors first and fails instead of deploying if they don't match.

Either way the site is free: Netlify's free plan covers it, and the page has no
accounts, payments or limits.

## What it does

| | |
| --- | --- |
| Recovery phrase | 12 or 24 words (BIP39 English), from `crypto.getRandomValues` |
| Addresses | BIP84 native SegWit, path `m/84'/0'/0'/0/i` (testnet: `m/84'/1'/0'/0/i`) |
| Also shows | Private keys (WIF, hidden by default), change addresses, account `zpub`/`vpub` |
| Options | Mainnet/testnet, 5/10/20 addresses, optional BIP39 passphrase |
| Compatible with | Sparrow, Electrum, BlueWallet, hardware wallets (restore as "Native SegWit") |

It **cannot** find the phrase or private key of an address that someone else
created. No software can; tools that claim to are scams.

## Security

- **Libraries:** cryptography comes from the audited [noble/scure](https://paulmillr.com/noble/) libraries
  (`@scure/bip39`, `@scure/bip32`, `@noble/hashes`, `@scure/base`).
- **Single file:** everything is bundled into `site/index.html`, with no CDN or external scripts.
- **Content-Security-Policy:** set both in the page and in `site/_headers`. It allows only the page's own
  inline script and style (pinned by hash) and blocks all network connections (`connect-src 'none'`).
- **Phrase hidden by default:** the phrase is blurred until revealed. Copying the phrase or showing
  private keys asks for confirmation, and *Clear* removes everything from the page.

## Development

```sh
npm ci
npm test          # BIP39/BIP84 test vectors + phrase generation/validation
npm run build     # writes site/index.html and site/_headers
(cd site && zip -X ../netlify-drop.zip index.html _headers)  # refresh the drop zip
npm run test:e2e  # browser tests (needs Playwright with Chromium installed globally)
```

| Path | Contents |
| --- | --- |
| `src/wallet.js` | Key derivation |
| `src/app.js` | User interface logic |
| `src/index.html`, `src/style.css` | Page template and styles |
| `build.mjs` | Bundles everything into `site/index.html` and computes the CSP hashes |
