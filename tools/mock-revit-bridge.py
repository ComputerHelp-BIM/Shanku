#!/usr/bin/env python3
"""
Mock Shanku bridge (docs/bridge/protocol.md) for testing Shanku without Revit.

Serves an IFC file as "the open Revit model", with the same routes, CORS and local network headers,
pairing and event stream as the real add-in. Extra test-only routes (no auth, localhost only):

    GET  /mock/code                -> {"code": "123456"}      the current pairing code
    POST /mock/select {globalIds}  -> pretend the user selected these in Revit
    GET  /mock/received            -> the selections Shanku sent, newest last
    POST /mock/document {title,key} or {"document": null}      pretend Revit switched or closed the model
    POST /mock/param {globalId, name, display}                 pretend a parameter has this value in Revit
    POST /mock/move {globalIds, dx, dy, dz}  (metres) -> move elements and send a `changes` event
    POST /mock/delete {globalIds}            -> delete elements and send a `changes` event

With IfcOpenShell installed (pip install ifcopenshell) the mock keeps the model in memory, so moves and
deletes show in exports, and /model/export {globalIds} writes a real subset IFC like Revit's partial
export (a live update). Without it, the mock serves the file as-is and offers no live updates.

Usage: python3 tools/mock-revit-bridge.py [--port 7071] [--ifc apps/web/public/samples/sample-frame.ifc]
"""
import argparse
import json
try:
    import ifcopenshell  # optional: live updates (moves, deletes, partial exports) need it
    import ifcopenshell.guid
    import ifcopenshell.util.unit
except ImportError:  # the mock still serves the file as-is
    ifcopenshell = None
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
        self.model = ifcopenshell.open(str(ifc)) if ifcopenshell else None
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
        # instance parameters per element: {globalId: {name: [id, group, kind, display, readOnly]}}
        self.params = {}
        for n, (g, _, tag) in enumerate(self.ids):
            self.params[g] = {
                "Base Level": [-1001100, "Constraints", "element", "01 GROUND LVL.", True],
                "Base Offset": [-1001107, "Constraints", "number", "0.000", False],
                "Top Level": [-1001101, "Constraints", "element", "02 1ST FLOOR LVL.", True],
                "Top Offset": [-1001108, "Constraints", "number", "0.000", False],
                "Moves With Grids": [-1001109, "Constraints", "yesno", "Yes", False],
                "Structural Material": [-1001205, "Materials and Finishes", "element", "Concrete, Cast In Situ", True],
                "Enable Analytical Model": [-1018301, "Structural", "yesno", "Yes", False],
                "Length": [-1012807, "Dimensions", "number", "3000.000", True],
                "Volume": [-1012806, "Dimensions", "number", "0.540 m³", True],
                "Comments": [-1010106, "Identity Data", "text", "", False],
                "Mark": [-1001203, "Identity Data", "text", f"E{n + 1}", False],
            }

    def current_ifc(self) -> bytes:
        """The model as it is now (after mock moves and deletes)."""
        return self.model.to_string().encode() if self.model else self.ifc

    def partial_ifc(self, gids) -> bytes:
        """A real subset export: project and units, the spatial structure, and each element with its
        placement, geometry, type, property sets and storey (like Revit exporting an isolated view)."""
        src = self.model
        new = ifcopenshell.file(schema=src.schema)
        new.add(src.by_type("IfcProject")[0])
        for rel in src.by_type("IfcRelAggregates"):
            new.add(rel)  # project > site > building > storeys
        g = lambda: ifcopenshell.guid.new()
        for gid in gids:
            try:
                el = src.by_guid(gid)
            except RuntimeError:
                continue
            ne = new.add(el)
            for rel in getattr(el, "ContainedInStructure", []) or []:
                new.createIfcRelContainedInSpatialStructure(g(), None, None, None, [ne], new.add(rel.RelatingStructure))
            for rel in getattr(el, "IsDefinedBy", []) or []:
                if rel.is_a("IfcRelDefinesByProperties"):
                    new.createIfcRelDefinesByProperties(g(), None, None, None, [ne], new.add(rel.RelatingPropertyDefinition))
            for rel in getattr(el, "IsTypedBy", []) or []:
                new.createIfcRelDefinesByType(g(), None, None, None, [ne], new.add(rel.RelatingType))
        return new.to_string().encode()

    def move(self, gids, dx=0.0, dy=0.0, dz=0.0):
        """Moves elements (metres, IFC axes) by giving each a new placement point."""
        scale = ifcopenshell.util.unit.calculate_unit_scale(self.model)  # file units -> metres
        for gid in gids:
            el = self.model.by_guid(gid)
            rp = el.ObjectPlacement.RelativePlacement
            x, y, z = (list(rp.Location.Coordinates) + [0, 0, 0])[:3]
            rp.Location = self.model.createIfcCartesianPoint((x + dx / scale, y + dy / scale, z + dz / scale))

    def delete(self, gids):
        for gid in gids:
            el = self.model.by_guid(gid)
            for rel in list(getattr(el, "ContainedInStructure", []) or []):
                rel.RelatedElements = [e for e in rel.RelatedElements if e != el] or rel.RelatedElements
            self.model.remove(el)
            self.params.pop(gid, None)
            self.ids = [t for t in self.ids if t[0] != gid]

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
                return self.send_json(200, {"service": "shanku-revit", "protocol": 1, "addin": "mock", "revit": "2025", "pairingOpen": True, "hasDocument": st.document is not None, "features": ["params", "changes", "partial-export"] if ifcopenshell else ["params"]})
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
            if path == "/mock/move":
                b = self.body()
                st.move(b["globalIds"], b.get("dx", 0.0), b.get("dy", 0.0), b.get("dz", 0.0))
                st.broadcast("changes", {"key": st.document["key"], "modified": b["globalIds"], "added": [], "deleted": []})
                return self.send_json(200, {"ok": True})
            if path == "/mock/delete":
                b = self.body()
                st.delete(b["globalIds"])
                st.broadcast("changes", {"key": st.document["key"], "modified": [], "added": [], "deleted": b["globalIds"]})
                return self.send_json(200, {"ok": True})
            if path == "/mock/document":
                b = self.body()
                st.document = b.get("document", b) if "document" in b else b
                st.broadcast("document", {"document": st.document})
                return self.send_json(200, {"ok": True})
            if path == "/mock/param":
                b = self.body()
                p = st.params.get(b.get("globalId"), {}).get(b.get("name"))
                if p is None:
                    return self.send_json(404, {"error": "No such element or parameter."})
                p[3] = b.get("display")
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
            if path == "/shanku/v1/params/read":
                b = self.body()
                out = []
                for g in b.get("globalIds", []):
                    if g not in st.params:
                        continue
                    tag = next((t for gg, _, t in st.ids if gg == g), 0)
                    unit = lambda k, v: ("m³" if k == "Volume" else "mm") if v[2] == "number" else None
                    ps = [{"id": v[0], "name": k, "group": v[1], "kind": v[2], "display": v[3], "readOnly": v[4], "unit": unit(k, v), "why": ("Choose it in Revit" if v[2] == "element" else "Read-only in Revit") if v[4] else None} for k, v in st.params[g].items()]
                    tps = [{"id": -2001, "name": n2, "group": g2, "kind": k2, "display": d2, "readOnly": True, "why": "Type parameter: edit it in Revit (Edit Type) for now"} for n2, g2, k2, d2 in [("b", "Dimensions", "number", "300.000"), ("h", "Dimensions", "number", "600.000"), ("Type Mark", "Identity Data", "text", "C1"), ("Keynote", "Identity Data", "text", "E")]]
                    out.append({"globalId": g, "elementId": tag, "category": "Structural Columns", "typeName": "CH-300 X 600", "familyName": "Concrete-Rectangular-Column", "params": ps, "typeParams": tps})
                return self.send_json(200, {"elements": out})
            if path == "/shanku/v1/params/write":
                b = self.body()
                dry = bool(b.get("dryRun"))
                results, pending = [], []
                for i, c in enumerate(b.get("changes", [])):
                    p = st.params.get(c.get("globalId"), {}).get(c.get("name"))
                    err, after = None, None
                    if p is None:
                        err = "No such parameter."
                    elif p[4]:
                        err = f'"{c["name"]}" is read-only in Revit.'
                    elif c.get("oldDisplay") is not None and c["oldDisplay"] != p[3]:
                        err = f'Changed in Revit since Shanku read it (now "{p[3]}"). Refresh, then edit again.'
                    else:
                        v = str(c.get("value", "")).strip()
                        if p[2] == "number":
                            m = re.fullmatch(r"(-?\d+(?:[.,]\d+)?)\s*(mm|m)?", v)
                            if not m:
                                err = f'"{v}" is not a number.'
                            else:
                                val = float(m.group(1).replace(",", ".")) * (1000 if m.group(2) == "m" else 1)
                                after = f"{val:.3f}"
                        elif p[2] == "yesno":
                            after = "Yes" if v.lower() in ("yes", "1", "true") else "No"
                        else:
                            after = v
                    if err is None:
                        pending.append((p, after))
                    results.append({"index": i, "ok": err is None, "error": err, "newDisplay": after})
                if not dry:
                    for p, after in pending:
                        p[3] = after
                    changed = sorted({c["globalId"] for c, r in zip(b.get("changes", []), results) if r["ok"]})
                    if changed:  # like Revit's DocumentChanged after the transaction commits
                        st.broadcast("changes", {"key": st.document["key"], "modified": changed, "added": [], "deleted": []})
                marks = [c for c in b.get("changes", []) if c.get("name") == "Mark"]
                warnings = ['Elements have duplicate "Mark" values.'] if len({c.get("value") for c in marks}) < len(marks) else []
                n = len(b.get("changes", []))
                return self.send_json(200, {"dryRun": dry, "undoName": f"Shanku: update {n} parameters", "results": results, "warnings": warnings})
            if path == "/shanku/v1/model/export":
                b = self.body()
                data = st.partial_ifc(b["globalIds"]) if b.get("globalIds") and st.model else st.current_ifc()
                self.send_response(200)
                self.cors()
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("X-Shanku-Document-Key", st.document["key"])
                self.send_header("X-Shanku-Document-Title", st.document["title"])
                self.end_headers()
                self.wfile.write(data)
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
