# BTCRecover — installed and runnable

Installs [BTCRecover](https://github.com/3rdIteration/btcrecover) into an
isolated venv and gives you a wrapper to run it. BTCRecover recovers
passwords and seed phrases for wallets **you own**.

## Setup

```bash
./setup.sh
```

Then run any entry point through the wrapper:

```bash
./btcr btcrecover.py  --help
./btcr seedrecover.py --help
```

The wrapper does not change directory, so relative paths you pass for wallets
and password lists resolve against wherever you invoked it.

### Password recovery

```bash
./btcr btcrecover.py --wallet /path/to/wallet.dat --passwordlist candidates.txt
```

### Seed recovery

```bash
./btcr seedrecover.py
```

Run with no arguments for the interactive prompts, or see
`btcrecover/docs/Seedrecover_Quick_Start_Guide.md` in the clone (and the
[docs site](../btcrecover-site/README.md) for the rendered version).

## What setup.sh installs

`requirements-full.txt` by default — every wallet type and altcoin upstream
supports. Set `REQUIREMENTS=requirements.txt` for the smaller core set.

Two of the full set's packages (`sjcl`, `staking-deposit`) are listed as GitHub
tarball URLs. Some networks return 403 for those while still allowing git, so
`setup.sh` falls back to installing the rest from the pinned file and fetching
those two over `git+https` at the same pinned commit and tag.

## Verified working

Python 3.13.17, upstream commit `1457088`, `secp256k1 backend: coincurve`
(the fastest of the three — `coincurve`, `wallycore`, bundled pure-Python).

- `compatibility_check.py` exits 0; both entry points start and print usage
- **Real recovery**: against the bundled `bitcoincore-wallet.dat`, with the
  correct password placed among decoys in a password list, BTCRecover returned
  `Password found: 'btcr-test-password'`
- Upstream's own suite, `./btcr run-all-tests.py`: **761 passed, 69 skipped,
  0 failures**, exit 0. The skips are all tests that scan the host for
  installed wallet software and skip when none is present — correct for a
  bare environment. Slow: it covers every wallet type and altcoin derivation
  path.

## Choosing a Python version

Upstream supports 3.10–3.14 but recommends **3.13**: `coincurve` publishes
prebuilt wheels only up to 3.13, so on 3.14 it falls back to `wallycore`, and
`requirements-full.txt` does not install cleanly there at all.
