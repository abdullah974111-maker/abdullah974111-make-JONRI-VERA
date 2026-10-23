"""Misbehaving JSON-RPC server for exercising bitcoin-cli's HTTP client.
Usage: fakerpc.py <port> <mode>"""
import json, socket, sys, threading, time

port, mode = int(sys.argv[1]), sys.argv[2]

def read_request(c):
    data = b""
    while b"\r\n\r\n" not in data:
        data += c.recv(65536)
    head, body = data.split(b"\r\n\r\n", 1)
    n = int([l.split(b":")[1] for l in head.split(b"\r\n") if l.lower().startswith(b"content-length")][0])
    while len(body) < n:
        body += c.recv(65536)
    return json.loads(body)

def reply(c, obj, extra=b""):
    body = json.dumps(obj).encode()
    c.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\n%s\r\n" % (len(body), extra) + body)

def handle(c):
    try:
        if mode == "noread":            # accept, never read the request
            time.sleep(3600)
        if mode == "endless_headers":   # never terminate the header section
            read_request(c)
            c.sendall(b"HTTP/1.1 200 OK\r\n")
            while True:
                c.sendall(b"X-Filler: " + b"a" * 1000 + b"\r\n")
        req = read_request(c)
        rid = req.get("id")
        if mode == "string_error":
            reply(c, {"result": None, "error": "boom", "id": rid})
        elif mode == "zero_code":
            reply(c, {"result": None, "error": {"code": 0, "message": "zero code"}, "id": rid})
        elif mode == "generate_error":
            if req["method"] == "getnewaddress":
                reply(c, {"result": "bcrt1qtestaddress", "error": None, "id": rid})
            else:
                reply(c, {"result": None, "error": {"code": -8, "message": "generatetoaddress failed on server"}, "id": rid})
        elif mode == "chunked":         # valid chunked response with a trailer
            body = json.dumps({"result": "chunked-ok", "error": None, "id": rid}).encode()
            c.sendall(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n")
            for i in range(0, len(body), 7):
                part = body[i:i + 7]
                c.sendall(b"%x\r\n%s\r\n" % (len(part), part))
            c.sendall(b"0\r\nX-Trailer: t\r\n\r\n")
        elif mode == "close_delimited": # no Content-Length, body ends at close
            c.sendall(b"HTTP/1.1 200 OK\r\n\r\n" + json.dumps({"result": "close-ok", "error": None, "id": rid}).encode())
    except (BrokenPipeError, ConnectionResetError):
        pass
    finally:
        c.close()

s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4096)
s.bind(("127.0.0.1", port)); s.listen(8)
print("ready", flush=True)
while True:
    conn, _ = s.accept()
    threading.Thread(target=handle, args=(conn,), daemon=True).start()
