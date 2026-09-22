"""Shanku DXF extractor (runs in Pyodide; also runs in CPython for tests).

Reads a DXF with ezdxf and flattens model space into render-ready primitives:
line segments, filled polygons and texts, each tagged with a colour index and a
layer index. Uses ezdxf's drawing front end, so blocks, dimensions, leaders,
hatches, linetypes and BYLAYER/BYBLOCK colours resolve exactly as ezdxf renders them.
Colour 7 is resolved against a white background, so it arrives as #000000 and the
viewer maps it to the theme's text colour (black on Paper, white on Ink), as AutoCAD does.

Version 1.1.0
"""
import time
from array import array

import ezdxf
from ezdxf import recover
from ezdxf.addons.drawing.backend import Backend
from ezdxf.addons.drawing.config import Configuration, HatchPolicy, LinePolicy, TextPolicy
from ezdxf.addons.drawing.frontend import Frontend
from ezdxf.addons.drawing.properties import LayoutProperties, RenderContext
from ezdxf.disassemble import recursive_decompose

__version__ = "1.1.0"

UNITS = {0: "unitless", 1: "in", 2: "ft", 3: "mi", 4: "mm", 5: "cm", 6: "m", 7: "km", 8: "µin", 9: "mil",
         10: "yd", 11: "Å", 12: "nm", 13: "µm", 14: "dm", 15: "dam", 16: "hm", 17: "Gm", 18: "AU", 19: "ly", 20: "pc"}

# MTEXT attachment point -> (horizontal, vertical)
ATTACH = {1: ("left", "top"), 2: ("center", "top"), 3: ("right", "top"),
          4: ("left", "middle"), 5: ("center", "middle"), 6: ("right", "middle"),
          7: ("left", "bottom"), 8: ("center", "bottom"), 9: ("right", "bottom")}
TEXT_H = {0: "left", 1: "center", 2: "right", 3: "left", 4: "center", 5: "left"}
TEXT_V = {0: "baseline", 1: "bottom", 2: "middle", 3: "top"}


class _Collector(Backend):
    """Receives primitives from ezdxf's Frontend."""

    def __init__(self, colors, layers, entity_index):
        super().__init__()
        self.colors = colors  # dict hex -> index
        self.layers = layers  # dict name -> index
        self.entity_index = entity_index  # model-space handle -> index, for picking
        self.cur = 0
        self.seg_ent = array("I")
        self.poly_ent = array("I")
        self.seg = array("d")
        self.seg_color = array("H")
        self.seg_layer = array("H")
        self.poly = array("d")
        self.poly_start = array("I")
        self.poly_color = array("H")
        self.poly_layer = array("H")
        self.per_layer = {}

    def _keys(self, p):
        c = (p.color or "#000000")[:7].lower()
        ci = self.colors.setdefault(c, len(self.colors))
        li = self.layers.setdefault(p.layer, len(self.layers))
        self.per_layer[li] = self.per_layer.get(li, 0) + 1
        return ci, li

    def enter_entity(self, entity, properties):
        # Top-level entities carry a handle; block contents, hatch and dimension parts are virtual
        # (no handle) and stay attributed to the model-space entity that produced them.
        h = entity.dxf.handle
        if h in self.entity_index:
            self.cur = self.entity_index[h]

    def exit_entity(self, entity):
        pass

    def draw_point(self, pos, properties):
        pass

    def draw_line(self, start, end, properties):
        ci, li = self._keys(properties)
        self.seg.extend((start.x, start.y, end.x, end.y))
        self.seg_color.append(ci)
        self.seg_layer.append(li)
        self.seg_ent.append(self.cur)

    def draw_filled_polygon(self, points, properties):
        # ezdxf passes NumpyPoints2d; older versions pass an iterable of Vec2.
        pts = points.vertices() if hasattr(points, "vertices") else list(points)
        if len(pts) < 3:
            return
        ci, li = self._keys(properties)
        self.poly_start.append(len(self.poly) // 2)
        for v in pts:
            self.poly.extend((v.x, v.y))
        self.poly_color.append(ci)
        self.poly_layer.append(li)
        self.poly_ent.append(self.cur)

    def draw_image(self, image_data, properties):
        pass

    def set_background(self, color):
        pass

    def clear(self):
        pass


def _text_item(e, ctx, colors, layers, owner):
    t = e.dxftype()
    if t in ("TEXT", "ATTRIB"):
        s = e.plain_text()
        if not s.strip():
            return None
        h = TEXT_H.get(e.dxf.get("halign", 0), "left")
        v = TEXT_V.get(e.dxf.get("valign", 0), "baseline")
        aligned = e.dxf.get("halign", 0) != 0 or e.dxf.get("valign", 0) != 0
        p = e.dxf.align_point if aligned and e.dxf.hasattr("align_point") else e.dxf.insert
        x, y, rot, height = p.x, p.y, e.dxf.get("rotation", 0.0), e.dxf.get("height", 1.0)
    elif t == "MTEXT":
        s = e.plain_text()
        if not s.strip():
            return None
        h, v = ATTACH.get(e.dxf.get("attachment_point", 1), ("left", "top"))
        x, y = e.dxf.insert.x, e.dxf.insert.y
        rot, height = e.get_rotation(), e.dxf.get("char_height", 1.0)
    else:
        return None
    props = ctx.resolve_all(e)
    c = (props.color or "#000000")[:7].lower()
    return [round(x, 4), round(y, 4), round(height, 4), round(rot, 3), h, v, s,
            colors.setdefault(c, len(colors)), layers.setdefault(e.dxf.layer, len(layers)), owner]


def _texts(msp, ctx, colors, layers, entity_index):
    """Texts to draw: [x, y, height, rotation, h, v, text, colour, layer, owning entity index]."""
    out = []
    for e in msp:
        owner = entity_index.get(e.dxf.handle, 0)
        try:
            if e.dxftype() in ("TEXT", "MTEXT"):
                items = [e]
            elif hasattr(e, "virtual_entities"):
                items = [v for v in recursive_decompose([e]) if v.dxftype() in ("TEXT", "MTEXT", "ATTRIB")]
            else:
                items = []
            for v in items:
                item = _text_item(v, ctx, colors, layers, owner)
                if item:
                    out.append(item)
        except Exception:  # one bad text never stops the drawing
            continue
    return out


def extract(path, flatten=0.01, hatch_policy=HatchPolicy.NORMAL):
    t0 = time.perf_counter()
    # Fast path first; fall back to ezdxf's recover mode for damaged client files.
    try:
        doc = ezdxf.readfile(path)
        recovered = 0
    except ezdxf.DXFStructureError:
        doc, auditor = recover.readfile(path)
        recovered = len(auditor.errors)
    msp = doc.modelspace()
    t1 = time.perf_counter()

    # Remember each layer's own visibility, then render everything so the viewer can toggle.
    layer_state = {}
    for layer in doc.layers:
        layer_state[layer.dxf.name] = {"on": layer.is_on() and not layer.is_frozen(), "color": layer.dxf.get("color", 7)}
        layer.on()
        layer.thaw()

    colors, layers = {}, {}
    ctx = RenderContext(doc)
    handles = [e.dxf.handle for e in msp]
    entity_index = {h: i for i, h in enumerate(handles)}
    backend = _Collector(colors, layers, entity_index)
    # Solid lines (linetype dashes would multiply segment counts ~10x); hatch patterns as drawn.
    config = Configuration(text_policy=TextPolicy.IGNORE, hatch_policy=hatch_policy,
                           line_policy=LinePolicy.SOLID, max_flattening_distance=flatten)
    lp = LayoutProperties.from_layout(msp)
    lp.set_colors("#ffffff")  # colour 7 -> black; the viewer flips it per theme
    Frontend(ctx, backend, config).draw_layout(msp, finalize=True, layout_properties=lp)
    t2 = time.perf_counter()
    texts = _texts(msp, ctx, colors, layers, entity_index)
    t3 = time.perf_counter()

    xs = list(backend.seg[0::2]) + list(backend.poly[0::2]) + [t[0] for t in texts]
    ys = list(backend.seg[1::2]) + list(backend.poly[1::2]) + [t[1] for t in texts]
    ox, oy = (min(xs), min(ys)) if xs else (0.0, 0.0)
    ext = [0.0, 0.0, (max(xs) - ox) if xs else 0.0, (max(ys) - oy) if ys else 0.0]

    seg = array("f", (v - (ox if i % 2 == 0 else oy) for i, v in enumerate(backend.seg)))
    poly = array("f", (v - (ox if i % 2 == 0 else oy) for i, v in enumerate(backend.poly)))
    for t in texts:
        t[0] = round(t[0] - ox, 4)
        t[1] = round(t[1] - oy, 4)

    text_counts = {}
    for t in texts:
        text_counts[t[8]] = text_counts.get(t[8], 0) + 1
    names = sorted(layers, key=layers.get)
    layer_list = [{
        "name": n,
        "on": layer_state.get(n, {"on": True})["on"],
        "count": backend.per_layer.get(layers[n], 0) + text_counts.get(layers[n], 0),
    } for n in names]

    return {
        "info": {
            "version": doc.dxfversion,
            "release": ezdxf.const.acad_release.get(doc.dxfversion, doc.dxfversion),
            "insunits": doc.header.get("$INSUNITS", 0),
            "units": UNITS.get(doc.header.get("$INSUNITS", 0), "unitless"),
            "origin": [ox, oy],
            "extents": ext,
            "segments": len(backend.seg_color),
            "polygons": len(backend.poly_color),
            "texts": len(texts),
            "layers": len(layer_list),
            "recovered_errors": recovered,
            "timings": {"read": (t1 - t0) * 1000, "geometry": (t2 - t1) * 1000, "text": (t3 - t2) * 1000},
            "extractor": __version__,
            "ezdxf": ezdxf.__version__,
        },
        "palette": sorted(colors, key=colors.get),
        "layers": layer_list,
        "texts": texts,
        "seg": seg.tobytes(),
        "seg_color": backend.seg_color.tobytes(),
        "seg_layer": backend.seg_layer.tobytes(),
        "poly": poly.tobytes(),
        "poly_start": backend.poly_start.tobytes(),
        "poly_color": backend.poly_color.tobytes(),
        "poly_layer": backend.poly_layer.tobytes(),
        "seg_ent": backend.seg_ent.tobytes(),
        "poly_ent": backend.poly_ent.tobytes(),
        "handles": handles,
        "_doc": doc,
    }


_DOCS = {}  # drawing id -> open ezdxf document, for object properties on demand


def extract_for_js(path, drawing_id=""):
    """Same as extract(), packed for Pyodide: one JSON string plus raw little-endian buffers.
    Keeps the document open under drawing_id so entity_props_json() can answer selections."""
    import json
    r = extract(path)
    if drawing_id:
        _DOCS[drawing_id] = r["_doc"]
    head = json.dumps({k: r[k] for k in ("info", "palette", "layers", "texts", "handles")})
    return (head, r["seg"], r["seg_color"], r["seg_layer"], r["poly"], r["poly_start"], r["poly_color"], r["poly_layer"], r["seg_ent"], r["poly_ent"])


def forget(drawing_id):
    _DOCS.pop(drawing_id, None)


def _p(v):
    return [round(v[0], 3), round(v[1], 3)] if v is not None else None


def entity_props(doc, handle):
    """Properties of one model-space entity, like AutoCAD's Properties palette (values in drawing units)."""
    import math
    e = doc.entitydb.get(handle)
    if e is None:
        return None
    t = e.dxftype()
    layer = doc.layers.get(e.dxf.layer) if doc.layers.has_entry(e.dxf.layer) else None
    aci = e.dxf.get("color", 256)
    color = "ByLayer" if aci == 256 else "ByBlock" if aci == 0 else str(aci)
    if e.dxf.hasattr("true_color"):
        color = "#{:06x}".format(e.dxf.true_color & 0xFFFFFF)
    out = {"Type": t.title() if t not in ("LWPOLYLINE", "MTEXT") else {"LWPOLYLINE": "Polyline", "MTEXT": "MText"}[t],
           "Handle": handle, "Layer": e.dxf.layer, "Color": color + ("" if aci != 256 or not layer else " ({})".format(layer.dxf.get("color", 7))),
           "Linetype": e.dxf.get("linetype", "ByLayer")}
    g = {}
    try:
        if t == "LINE":
            s0, s1 = e.dxf.start, e.dxf.end
            g = {"Start": _p(s0), "End": _p(s1), "Length": round(math.hypot(s1[0] - s0[0], s1[1] - s0[1]), 3),
                 "Angle (°)": round(math.degrees(math.atan2(s1[1] - s0[1], s1[0] - s0[0])) % 360, 3)}
        elif t == "LWPOLYLINE":
            pts = [(p[0], p[1]) for p in e.get_points("xy")]
            n = len(pts)
            length = sum(math.dist(pts[i], pts[(i + 1) % n]) for i in range(n if e.closed else n - 1))
            g = {"Vertices": n, "Closed": "Yes" if e.closed else "No", "Length": round(length, 3)}
            if e.closed and n > 2:
                g["Area"] = round(abs(sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))) / 2, 3)
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            g["Extents"] = "{:.0f} × {:.0f}".format(max(xs) - min(xs), max(ys) - min(ys))
            g["First vertex"] = _p(pts[0])
        elif t == "CIRCLE":
            r = e.dxf.radius
            g = {"Center": _p(e.dxf.center), "Radius": round(r, 3), "Diameter": round(2 * r, 3), "Circumference": round(2 * math.pi * r, 3), "Area": round(math.pi * r * r, 3)}
        elif t == "ARC":
            r, a0, a1 = e.dxf.radius, e.dxf.start_angle, e.dxf.end_angle
            sweep = (a1 - a0) % 360
            g = {"Center": _p(e.dxf.center), "Radius": round(r, 3), "Start angle (°)": round(a0, 3), "End angle (°)": round(a1, 3), "Arc length": round(math.radians(sweep) * r, 3)}
        elif t in ("TEXT", "MTEXT"):
            g = {"Contents": e.plain_text(), "Height": round(e.dxf.get("height" if t == "TEXT" else "char_height", 0), 3),
                 "Rotation (°)": round(e.dxf.get("rotation", 0) if t == "TEXT" else e.get_rotation(), 3), "Position": _p(e.dxf.insert), "Style": e.dxf.get("style", "Standard")}
        elif t == "INSERT":
            g = {"Block": e.dxf.name, "Position": _p(e.dxf.insert), "Scale X": e.dxf.get("xscale", 1), "Scale Y": e.dxf.get("yscale", 1),
                 "Rotation (°)": round(e.dxf.get("rotation", 0), 3), "Attributes": len(e.attribs)}
        elif t == "HATCH":
            g = {"Pattern": e.dxf.pattern_name, "Solid fill": "Yes" if e.dxf.solid_fill else "No", "Boundaries": len(e.paths)}
        elif t == "DIMENSION":
            g = {"Measurement": round(e.get_measurement(), 3) if hasattr(e, "get_measurement") else None, "Text override": e.dxf.get("text", "") or "—", "Block": e.dxf.get("geometry", "")}
        elif t == "ELLIPSE":
            g = {"Center": _p(e.dxf.center), "Major axis": _p(e.dxf.major_axis), "Ratio": round(e.dxf.ratio, 4)}
        elif t == "SPLINE":
            g = {"Degree": e.dxf.degree, "Control points": len(e.control_points), "Fit points": len(e.fit_points), "Closed": "Yes" if e.closed else "No"}
        elif t == "POINT":
            g = {"Position": _p(e.dxf.location)}
    except Exception as err:  # geometry details are best effort
        g = {"Details": "not available ({})".format(err.__class__.__name__)}
    out.update({k: v for k, v in g.items() if v is not None})
    return out


def entity_props_json(drawing_id, handle):
    import json
    doc = _DOCS.get(drawing_id)
    return json.dumps(entity_props(doc, handle) if doc is not None else None, default=str)
