#!/usr/bin/env bash
#
# Clone 3rdIteration/btcrecover and build its MkDocs documentation site.
#
# Usage:
#   ./build.sh            # clone (or update), build into $CLONE_DIR/site
#   ./build.sh --serve    # build, then serve on http://127.0.0.1:8000
#
set -euo pipefail

REPO_URL="https://github.com/3rdIteration/btcrecover.git"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLONE_DIR="${CLONE_DIR:-$HERE/../btcrecover}"
VENV_DIR="${VENV_DIR:-$HERE/.venv}"

# 1. Clone, or fast-forward an existing clone.
if [ -d "$CLONE_DIR/.git" ]; then
    echo "==> Updating existing clone at $CLONE_DIR"
    git -C "$CLONE_DIR" pull --ff-only
else
    echo "==> Cloning $REPO_URL into $CLONE_DIR"
    git clone --depth 1 "$REPO_URL" "$CLONE_DIR"
fi

CLONE_DIR="$(cd "$CLONE_DIR" && pwd)"

# 2. Isolated venv with the docs toolchain pinned by the upstream repo.
if [ ! -x "$VENV_DIR/bin/mkdocs" ]; then
    echo "==> Creating venv at $VENV_DIR"
    python3 -m venv "$VENV_DIR"
    "$VENV_DIR/bin/pip" install --upgrade pip
    "$VENV_DIR/bin/pip" install -r "$CLONE_DIR/docs/requirements.txt"
fi

# 3. docs/Benchmarks.md is generated from a template plus benchmark-results/*.json.
#    It is in the nav but not committed, so the build fails without this step.
echo "==> Generating docs/Benchmarks.md"
( cd "$CLONE_DIR" && "$VENV_DIR/bin/python" generate_benchmark_docs.py )

# 4. Build. mkdocs.offline.yml inherits upstream mkdocs.yml and drops the
#    git-committers plugin, which needs GitHub API access to the upstream repo.
#    Set USE_UPSTREAM_CONFIG=1 (with MKDOCS_GIT_COMMITTERS_APIKEY) to keep it.
cp "$HERE/mkdocs.offline.yml" "$CLONE_DIR/mkdocs.offline.yml"

if [ "${USE_UPSTREAM_CONFIG:-0}" = "1" ]; then
    CONFIG="mkdocs.yml"
else
    CONFIG="mkdocs.offline.yml"
fi

# Each branch spells out its own flags. Collecting them in an array would read
# better, but expanding an empty array under `set -u` fails on bash 3.2, which
# is still the stock /bin/bash on macOS.
echo "==> Building site with $CONFIG"
if [ "$CONFIG" = "mkdocs.yml" ]; then
    # git-committers errors are fatal under --strict without a usable token.
    ( cd "$CLONE_DIR" && "$VENV_DIR/bin/mkdocs" build -f "$CONFIG" )
else
    ( cd "$CLONE_DIR" && "$VENV_DIR/bin/mkdocs" build --strict -f "$CONFIG" )
fi
echo "==> Site built at $CLONE_DIR/site"

if [ "${1:-}" = "--serve" ]; then
    echo "==> Serving on http://127.0.0.1:8000 (Ctrl-C to stop)"
    ( cd "$CLONE_DIR" && "$VENV_DIR/bin/mkdocs" serve -f "$CONFIG" )
fi
