# bitcoin-cli fixes

Fixes for `src/bitcoin-cli.cpp` from Bitcoin Core master at
[`152a553`](https://github.com/bitcoin/bitcoin/commit/152a553) (2026-10-22).

| File | Purpose |
| --- | --- |
| `bitcoin-cli.cpp` | Fixed source, a drop-in replacement for `src/bitcoin-cli.cpp` |
| `bitcoin-cli-fixes.patch` | The same change as a patch against upstream (`git apply` in a Bitcoin Core checkout) |
| `harness/` | Fake JSON-RPC server, reproduction script, regtest script and their recorded output |

## Bugs fixed

| # | Bug | Before | After |
| --- | --- | --- | --- |
| 1 | `SendRequest` ignored timeouts: `Sock::Wait` signals a timeout as success with no events, which the loop treated as "not writable yet" and retried forever | A server that never reads the request hangs the client indefinitely, regardless of `-rpcclienttimeout` | Fails after `-rpcclienttimeout` with "Failed to send HTTP request" |
| 2 | No limit on response header size | A server that never ends its headers makes the client buffer without bound and hang | Fails with "Response headers too large" (64 KiB cap; also applied to chunk-size lines and chunked trailers) |
| 3 | `ParseError` called `getInt` on a missing/non-numeric `code` | `{"error": "boom"}` printed `JSON value of type null is not of expected type number` | Prints `error: "boom"`, exit 1 |
| 4 | `ParseError` used `abs(code)` as exit status | An error with code `0` printed the error but exited `0` (success) | Exits `1`; codes out of `int` range can no longer overflow `abs()` |
| 5 | `-generate` discarded errors from `generatetoaddress` | Printed `{"address": …, "blocks": null}`, exit 0 | Prints the server error, exits with its code |

Also changed:

- `Recv()` now distinguishes a real timeout from a `poll()` failure (retrying on `EINTR`) and from an error-only event. Before, all three were reported as `timeout`.
- The header-terminator search now only rescans newly received bytes instead of the whole buffer each time.

Response *bodies* are deliberately not capped. Legitimate RPC replies (for example
`getblock … 3` or `getrawmempool true`) can be hundreds of MB, and the previous
libevent-based client did not cap them either.

## Verification

Built `bitcoind` and `bitcoin-cli` from upstream (CMake, `-DBUILD_GUI=OFF -DENABLE_IPC=OFF`, GCC 13):

- `harness/results-before.txt`: the unmodified client reproduces all five bugs.
- `harness/results-after.txt`: the fixed client handles each of them, and still parses
  chunked (with trailer) and close-delimited responses.
- `harness/results-regtest.txt`: end-to-end run of the fixed client against a real regtest
  node: `createwallet`, `-generate`, `-named sendtoaddress`, `-getinfo`, `-netinfo`,
  `-addrinfo`, and server errors mapped to exit codes.
- Upstream functional tests with the fixed client: `interface_bitcoin_cli.py` (also with `--usecli`)
  and `rpc_users.py --usecli` pass.

To reproduce:

```sh
git clone --depth 1 https://github.com/bitcoin/bitcoin && cd bitcoin
git apply /path/to/bitcoin-cli-fixes.patch
cmake -B build -G Ninja -DBUILD_GUI=OFF -DENABLE_IPC=OFF -DBUILD_TESTS=OFF
cmake --build build --target bitcoind bitcoin-cli
/path/to/harness/repro.sh build/bin/bitcoin-cli     # needs python3
/path/to/harness/regtest.sh build/bin
```
