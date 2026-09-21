"""Shanku DXF extractor (runs in Pyodide; also runs in CPython for tests).

Reads a DXF with ezdxf and flattens model space into render-ready primitives:
line segments, filled polygons and texts, each tagged with a colour index and a
layer index. Uses ezdxf's drawing front end, so blocks, dimensions, leaders,
hatches, linetypes and BYLAYER/BYBLOCK colours resolve exactly as ezdxf renders them.
Colour 7 is resolved against a white background, so it arrives as #000000 and the
viewer maps it to the theme's text colour (black on Paper, white on Ink), as AutoCAD does.

Version 1.0.0
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

__version__ = "1.0.0"

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

    def __init__(self, colors, layers):
        super().__init__()
        self.colors = colors  # dict hex -> index
        self.layers = layers  # dict name -> index
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

    def draw_point(self, pos, properties):
        pass

    def draw_line(self, start, end, properties):
        ci, li = self._keys(properties)
        self.seg.extend((start.x, start.y, end.x, end.y))
        self.seg_color.append(ci)
        self.seg_layer.append(li)

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

    def draw_image(self, image_data, properties):
        pass

    def set_background(self, color):
        pass

    def clear(self):
        pass


def _texts(msp, ctx, colors, layers):
    out = []
    for e in recursive_decompose(msp):
        t = e.dxftype()
        try:
            if t in ("TEXT", "ATTRIB"):
                s = e.plain_text()
                if not s.strip():
                    continue
                h = TEXT_H.get(e.dxf.get("halign", 0), "left")
                v = TEXT_V.get(e.dxf.get("valign", 0), "baseline")
                aligned = e.dxf.get("halign", 0) != 0 or e.dxf.get("valign", 0) != 0
                p = e.dxf.align_point if aligned and e.dxf.hasattr("align_point") else e.dxf.insert
                x, y, rot, height = p.x, p.y, e.dxf.get("rotation", 0.0), e.dxf.get("height", 1.0)
            elif t == "MTEXT":
                s = e.plain_text()
                if not s.strip():
                    continue
                h, v = ATTACH.get(e.dxf.get("attachment_point", 1), ("left", "top"))
                x, y = e.dxf.insert.x, e.dxf.insert.y
                rot, height = e.get_rotation(), e.dxf.get("char_height", 1.0)
            else:
                continue
            props = ctx.resolve_all(e)
            c = (props.color or "#000000")[:7].lower()
            out.append([round(x, 4), round(y, 4), round(height, 4), round(rot, 3), h, v, s,
                        colors.setdefault(c, len(colors)), layers.setdefault(e.dxf.layer, len(layers))])
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
    backend = _Collector(colors, layers)
    # Solid lines (linetype dashes would multiply segment counts ~10x); hatch patterns as drawn.
    config = Configuration(text_policy=TextPolicy.IGNORE, hatch_policy=hatch_policy,
                           line_policy=LinePolicy.SOLID, max_flattening_distance=flatten)
    lp = LayoutProperties.from_layout(msp)
    lp.set_colors("#ffffff")  # colour 7 -> black; the viewer flips it per theme
    Frontend(ctx, backend, config).draw_layout(msp, finalize=True, layout_properties=lp)
    t2 = time.perf_counter()
    texts = _texts(msp, ctx, colors, layers)
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
    }


def extract_for_js(path):
    """Same as extract(), packed for Pyodide: one JSON string plus raw little-endian buffers."""
    import json
    r = extract(path)
    head = json.dumps({k: r[k] for k in ("info", "palette", "layers", "texts")})
    return (head, r["seg"], r["seg_color"], r["seg_layer"], r["poly"], r["poly_start"], r["poly_color"], r["poly_layer"])
