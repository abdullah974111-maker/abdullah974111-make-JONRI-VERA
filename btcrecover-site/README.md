# BTCRecover documentation site

Reproducible build of the [BTCRecover](https://github.com/3rdIteration/btcrecover)
documentation site (MkDocs + Material theme). BTCRecover is an open-source
wallet password and seed-phrase recovery tool; this directory only builds its
docs, it does not vendor the tool itself.

## Build

```bash
./build.sh            # clone (or update) upstream, then build
./build.sh --serve    # build, then serve on http://127.0.0.1:8000
```

Output lands in `../btcrecover/site/` — a static site, servable by any web
server. Requires `python3`, `python3-venv` and `git`.

## What the script does

1. Clones `3rdIteration/btcrecover` (depth 1) to `../btcrecover`, or
   fast-forwards it if already present.
2. Creates `.venv` and installs the docs toolchain pinned in the upstream
   `docs/requirements.txt` (mkdocs 1.6.1, mkdocs-material 9.7.6, …).
3. Runs `generate_benchmark_docs.py`. Upstream ships `docs/Benchmarks.md.template`
   and `benchmark-results/*.json` but **not** the generated `docs/Benchmarks.md`,
   which the nav references — the build fails without this step.
4. Builds with `mkdocs.offline.yml` under `--strict`.

## Why `mkdocs.offline.yml`

Upstream `mkdocs.yml` enables the `git-committers` plugin, which calls the
GitHub API once per page to render contributor avatars. Unauthenticated or
unauthorized requests return 403, and under `--strict` that aborts the build.
`mkdocs.offline.yml` inherits the upstream config via `INHERIT:` and replaces
the plugin list with `search`, `autolinks` and `include-markdown`, so upstream
`mkdocs.yml` stays untouched.

To build with contributor avatars instead:

```bash
USE_UPSTREAM_CONFIG=1 MKDOCS_GIT_COMMITTERS_APIKEY=<github-token> ./build.sh
```

## Verified build

Built from a clean clone and a fresh venv, reproducing identical output twice.
Upstream commit `1457088` ("Make secp256k1 backend pluggable").

- 34 HTML pages, 117 files, 6.1 MB, clean `--strict` exit
- 1527 internal links and 203 local asset references checked: none broken
- Served over HTTP: `/`, `/INSTALL/`, `/Benchmarks/` and
  `/search/search_index.json` all return 200, nav renders
- `build.sh` passes `shellcheck` 0.11.0

### Known upstream quirks

None of these are introduced by this build, and none are fatal:

- `Usage_Examples/basic_wallet_scanning.md` exists in `docs/` but is absent
  from the nav, so it builds as an orphan page.
- `INSTALL.md` links an anchor `#secp256k1-backends-coincurve--wallycore--pure-python`
  that does not exist on that page.
- Two non-page files land in the output because they sit inside `docs/`:
  `Benchmarks.md.template`, and `mkdocs_overrides/main.html` — the latter is
  the theme override, copied verbatim, so it is served with its Jinja
  (`{{ user.repos }}`) unrendered. Fixing either means moving files upstream
  out of `docs/`, so this build leaves them alone.

Upstream docs are also hosted at <https://btcrecover.readthedocs.io>.
BTCRecover is GPL-2.0; this directory only contains build tooling.
