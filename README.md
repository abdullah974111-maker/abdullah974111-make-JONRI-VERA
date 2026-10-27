# BTCRecover documentation site

Build tooling for the [BTCRecover](https://github.com/3rdIteration/btcrecover)
documentation site.

```bash
./btcrecover-site/build.sh            # clone (or update) upstream, then build
./btcrecover-site/build.sh --serve    # build, then serve on http://127.0.0.1:8000
```

The build clones upstream into `btcrecover/` (gitignored) and writes the static
site to `btcrecover/site/`. See [`btcrecover-site/README.md`](btcrecover-site/README.md)
for what the script does, why it carries an override config, and the verified
build results.

BTCRecover is an open-source wallet password and seed-phrase recovery tool,
licensed GPL-2.0. This repository contains only build tooling for its docs; it
does not vendor the tool itself.
