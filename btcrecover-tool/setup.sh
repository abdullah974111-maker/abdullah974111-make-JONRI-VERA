#!/usr/bin/env bash
#
# Install BTCRecover and its dependencies into an isolated venv, then verify it.
#
# Usage:
#   ./setup.sh
#   REQUIREMENTS=requirements.txt ./setup.sh   # minimal deps instead of full
#
set -euo pipefail

REPO_URL="https://github.com/3rdIteration/btcrecover.git"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLONE_DIR="${CLONE_DIR:-$HERE/../btcrecover}"
VENV_DIR="${VENV_DIR:-$HERE/.venv}"
REQUIREMENTS="${REQUIREMENTS:-requirements-full.txt}"

# 1. Clone, or fast-forward an existing clone. Shared with btcrecover-site/.
if [ -d "$CLONE_DIR/.git" ]; then
    echo "==> Updating existing clone at $CLONE_DIR"
    git -C "$CLONE_DIR" pull --ff-only
else
    echo "==> Cloning $REPO_URL into $CLONE_DIR"
    git clone --depth 1 "$REPO_URL" "$CLONE_DIR"
fi
CLONE_DIR="$(cd "$CLONE_DIR" && pwd)"

# 2. Venv. Upstream recommends Python 3.10-3.13; 3.13 is the newest with a
#    prebuilt coincurve wheel (the fastest secp256k1 backend).
echo "==> Python: $(python3 --version)"
if [ ! -x "$VENV_DIR/bin/python" ]; then
    echo "==> Creating venv at $VENV_DIR"
    python3 -m venv "$VENV_DIR"
fi
PIP="$VENV_DIR/bin/pip"
PY="$VENV_DIR/bin/python"
"$PIP" install --quiet --upgrade pip

# 3. Dependencies. requirements-full.txt pulls two packages straight from
#    GitHub tarball URLs. Some networks (proxies, allowlists) return 403 for
#    those while still permitting git, so fall back to installing the rest
#    from the pinned file and fetching those two over git instead.
echo "==> Installing $REQUIREMENTS"
if ! "$PIP" install -r "$CLONE_DIR/$REQUIREMENTS"; then
    echo "==> Direct install failed; retrying without the GitHub tarball URLs"
    grep -v '^https://' "$CLONE_DIR/$REQUIREMENTS" > "$VENV_DIR/requirements-nourl.txt"
    "$PIP" install -r "$VENV_DIR/requirements-nourl.txt"

    echo "==> Fetching the tarball-only packages over git"
    # Same projects and pins as requirements-full.txt.
    "$PIP" install "git+https://github.com/3rdIteration/sjcl@3e06cc6240b5bd75f640c126d638b0aabbc626a3"
    "$PIP" install "git+https://github.com/ethereum/staking-deposit-cli@v2.5.0"
fi

# 4. Verify.
echo "==> Verifying"
( cd "$CLONE_DIR" && "$PY" compatibility_check.py )
( cd "$CLONE_DIR" && "$PY" -c "
from btcrecover import crypto_backends
print('secp256k1 backend:', crypto_backends.BACKEND_NAME)" )
( cd "$CLONE_DIR" && "$PY" btcrecover.py --help >/dev/null )
( cd "$CLONE_DIR" && "$PY" seedrecover.py --help >/dev/null )

cat <<MSG

==> Ready. Run BTCRecover through the wrapper:

      $HERE/btcr btcrecover.py  --help
      $HERE/btcr seedrecover.py --help

    Full test suite (slow):
      $HERE/btcr run-all-tests.py
MSG
