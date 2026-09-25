#!/usr/bin/env python3
"""
Mock Shanku bridge (docs/bridge/protocol.md) for testing Shanku without Revit.

Serves an IFC file as "the open Revit model", with the same routes, CORS and local network headers,
pairing and event stream as the real add-in. Extra test-only routes (no auth, localhost only):

    GET  /mock/code                -> {"code": "123456"}      the current pairing code
    POST /mock/select {globalIds}  -> pretend the user selected these in Revit
    GET  /mock/received            -> the selections Shanku sent, newest last
    POST /mock/document {title,key} or {"document": null}      pretend Revit switched or closed the model

Usage: python3 tools/mock-revit-bridge.py [--port 7071] [--ifc apps/web/public/samples/sample-frame.ifc]
"""
import argparse
import json
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ALLOWED = re.compile(r"^(https://shanku(-[a-z0-9-]+)?\.vercel\.app|https://computerhelp-bim\.github\.io|http://localhost:\d+|http://127\.0\.0\.1:\d+)$")


class State:
    def __init__(self, ifc: Path):
        self.ifc = ifc.read_bytes()
        text = self.ifc.decode("latin-1")
        # GlobalId and Tag (Revit ElementId) of every product in the file
        self.ids = [(g, f"uid-{g}", int(t) if t.isdigit() else 0) for g, t in re.findall(r"=\s*IFC(?:COLUMN|BEAM|SLAB|FOOTING|WALL\w*|MEMBER|PLATE)\('([^']{22})',[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,'?([^',)]*)", text)]
        self.document = {"title": ifc.stem, "key": "mock-" + ifc.stem, "path": str(ifc), "isFamily": False}
        self.code = f"{secrets.randbelow(1_000_000):06d}"
        self.tokens = set()
        self.failures = 0
        self.received = []
        self.revit_selection = []
        self.streams = []
        self.lock = threading.Lock()

    def broadcast(self, event: str, data: dict):
        payload = f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()
        with self.lock:
            streams = list(self.streams)
        for s in streams:
            try:
                s.wfile.write(payload)
                s.wfile.flush()
            except OSError:
                with self.lock:
                    if s in self.streams:
                        self.streams.remove(s)


def make_handler(st: State):
    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):  # quiet
            pass

        def cors(self):
            origin = self.headers.get("Origin")
            if origin and ALLOWED.match(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Expose-Headers", "X-Shanku-Document-Key, X-Shanku-Document-Title")
            return origin

        def send_json(self, status, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def body(self):
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n) or b"{}")

        def authed(self, q):
            auth = self.headers.get("Authorization", "")
            token = auth[7:] if auth.startswith("Bearer ") else (q.get("token", [None])[0])
            return token in st.tokens

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            if self.headers.get("Access-Control-Request-Private-Network"):
                self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def route(self):
            u = urlparse(self.path)
            return u.path, parse_qs(u.query)

        def do_GET(self):
            path, q = self.route()
            origin = self.headers.get("Origin")
            if origin and not ALLOWED.match(origin):
                return self.send_json(403, {"error": "This site is not allowed to use the Shanku bridge."})
            if path == "/mock/code":
                return self.send_json(200, {"code": st.code})
            if path == "/mock/received":
                return self.send_json(200, {"received": st.received})
            if path == "/shanku/v1/hello":
                return self.send_json(200, {"service": "shanku-revit", "protocol": 1, "addin": "mock", "revit": "2025", "pairingOpen": True, "hasDocument": st.document is not None})
            if not self.authed(q):
                return self.send_json(401, {"error": "Not paired. Click Shanku → Connect in Revit and enter the code in Shanku."})
            if path == "/shanku/v1/status":
                return self.send_json(200, {"document": st.document, "selection": st.revit_selection})
            if path == "/shanku/v1/model/ids":
                return self.send_json(200, {"key": st.document["key"], "ids": st.ids})
            if path == "/shanku/v1/events":
                self.send_response(200)
                self.cors()
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(f"event: document\ndata: {json.dumps({'document': st.document})}\n\n".encode())
                self.wfile.flush()
                with st.lock:
                    st.streams.append(self)
                try:
                    while True:
                        time.sleep(15)
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
                except OSError:
                    pass
                return
            return self.send_json(404, {"error": "Not found"})

        def do_POST(self):
            path, q = self.route()
            origin = self.headers.get("Origin")
            if origin and not ALLOWED.match(origin):
                return self.send_json(403, {"error": "This site is not allowed to use the Shanku bridge."})
            if path == "/mock/select":
                b = self.body()
                gids = b.get("globalIds", [])
                st.revit_selection = gids
                tags = {g: t for g, _, t in st.ids}
                st.broadcast("selection", {"key": st.document["key"], "globalIds": gids, "elementIds": [tags.get(g, 0) for g in gids]})
                return self.send_json(200, {"ok": True})
            if path == "/mock/document":
                b = self.body()
                st.document = b.get("document", b) if "document" in b else b
                st.broadcast("document", {"document": st.document})
                return self.send_json(200, {"ok": True})
            if path == "/shanku/v1/pair":
                b = self.body()
                if str(b.get("code", "")).strip() == st.code:
                    token = secrets.token_urlsafe(32)
                    st.tokens.add(token)
                    st.code = f"{secrets.randbelow(1_000_000):06d}"
                    return self.send_json(200, {"token": token})
                return self.send_json(403, {"error": "That code is not right."})
            if not self.authed(q):
                return self.send_json(401, {"error": "Not paired."})
            if path == "/shanku/v1/model/export":
                self.send_response(200)
                self.cors()
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(st.ifc)))
                self.send_header("X-Shanku-Document-Key", st.document["key"])
                self.send_header("X-Shanku-Document-Title", st.document["title"])
                self.end_headers()
                self.wfile.write(st.ifc)
                return
            if path == "/shanku/v1/selection":
                b = self.body()
                if b.get("key") and b["key"] != st.document["key"]:
                    return self.send_json(409, {"error": f"Revit is showing a different model ({st.document['title']})."})
                known = {g for g, _, _ in st.ids}
                gids = b.get("globalIds", [])
                st.received.append(gids)
                st.revit_selection = gids
                return self.send_json(200, {"selected": sum(g in known for g in gids), "missing": sum(g not in known for g in gids)})
            return self.send_json(404, {"error": "Not found"})

    return H


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=7071)
    ap.add_argument("--ifc", default=str(Path(__file__).resolve().parent.parent / "apps/web/public/samples/sample-frame.ifc"))
    a = ap.parse_args()
    st = State(Path(a.ifc))
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(st))
    srv.daemon_threads = True
    print(f"Mock Revit bridge on http://localhost:{a.port}/shanku/v1 · model {st.document['title']} · {len(st.ids)} elements · code {st.code}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
