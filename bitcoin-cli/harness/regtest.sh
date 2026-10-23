#!/usr/bin/env bash
# Usage: regtest.sh <bin dir>   — exercises bitcoin-cli against a real regtest bitcoind
set -u
B=$1; D=$(mktemp -d); trap '$CLI stop >/dev/null 2>&1; sleep 2; rm -rf "$D"' EXIT
"$B/bitcoind" -regtest -datadir="$D" -daemon -fallbackfee=0.0002 >/dev/null
CLI="$B/bitcoin-cli -regtest -datadir=$D -rpcwait -rpcwaittimeout=30"
step() { printf '\n$ bitcoin-cli %s\n' "$*"; $CLI "$@"; echo "(exit $?)"; }
step createwallet alice
step -generate 101
step getbalance
ADDR=$($CLI -rpcwallet=alice getnewaddress)
step -named sendtoaddress address=$ADDR amount=1.5
step getmempoolinfo
step -generate 1
step -getinfo -color=never
step -netinfo
step -addrinfo
step getblock nonexistent          # server error -> non-zero exit
step -rpcwallet=missing getbalance # wallet error
