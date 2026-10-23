#!/usr/bin/env bash
# Usage: repro.sh <bitcoin-cli binary>
CLI=$1; H=$(dirname "$0"); P=18999
C="$CLI -regtest -rpcconnect=127.0.0.1 -rpcport=$P -rpcpassword=x -rpcuser=u -noipcconnect"
run() { # mode, description, cli args...
  local mode=$1 desc=$2; shift 2
  python3 -I "$H/fakerpc.py" $P "$mode" > /dev/null & local srv=$!; sleep 0.5
  local start=$SECONDS
  out=$( (ulimit -v 2000000; timeout 20 "$@") 2>&1); rc=$?
  kill $srv 2>/dev/null; wait $srv 2>/dev/null
  printf '\n### %s\n$ (exit %s, %ss)\n%s\n' "$desc" "$rc" "$((SECONDS-start))" "$(printf '%s' "$out" | head -c 400)"
}
head -c 30000000 /dev/zero | tr '\0' 'a' | fold -w 1000000 > /tmp/bigargs.txt
run noread          "server never reads a 30 MB request, -rpcclienttimeout=3 (timeout 20 = hung)" $C -rpcclienttimeout=3 -stdin echo < /tmp/bigargs.txt
run endless_headers "server streams headers forever (2 GB memory cap, timeout 20)"                 $C getblockcount
run string_error    "server returns a non-object error"                                           $C getblockcount
run zero_code       "server returns error code 0"                                                 $C getblockcount
run generate_error  "-generate when generatetoaddress fails on the server"                        $C -generate 1
run chunked         "regression: valid chunked response with trailer"                             $C getblockcount
run close_delimited "regression: close-delimited response"                                        $C getblockcount
