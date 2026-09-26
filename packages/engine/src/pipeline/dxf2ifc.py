"""Shanku DXF -> 3D pipeline (Computer Help CH-* format). Runs in Pyodide and in CPython.

Reads the default drawing format agreed with the user and writes an IFC4 file:

* Frames: closed polylines on ``Part-<n>`` layers, built in ``n`` order (then left to right).
  Each frame holds one origin circle (CH-Origin), one level label (CH-Level: "1", "2-4")
  and, except the foundation frame, one storey height (CH-Height: "3000").
* Elements: closed polylines only, each with exactly one label inside, on the paired text layer
  (CH-Column -> CHT-Column ...). Anything else on element layers is ignored and reported.
* Labels (mm):
    foundation frame      "top,size,MARK"              top relative to ±0, size downward
    superstructure        "[T]offset,size,MARK"        offset below the storey top, size downward
    windows / doors       "panels,sill,height,MARK"    panels 0 means "not given" (treated as 1)
* Levels (2.0.0): a level is the TOP of its storey, as in Revit's structural convention: the frame
  labelled Level n holds the structure below Level n (columns and walls from Level n-1 up to Level n,
  beams and slabs hanging from Level n). The foundation frame is Level 1 at ±0 (its elements hang
  below it); storeys stack upward from ±0 by their heights, so Level n sits at the sum of the heights
  of levels 2..n. "2-4" repeats one plan on levels 2, 3 and 4.
* IFC4 Reference View: a wall with windows or doors is written as one closed tessellated solid with
  the holes in it (IfcPolygonalFaceSet), no opening elements or boolean voids: importers such as
  Revit have nothing to cut and nothing to merge.

Version 2.0.1
"""
import math
import re
import time
import uuid

import ezdxf

__version__ = "2.0.1"

# ---------------------------------------------------------------- profile (the drawing format)

ELEMENT_LAYERS = {
    # layer: (kind, text layer, IFC class, predefined type, material, category word for type names)
    "CH-PCC": ("pcc", "CHT-PCC", "IFCFOOTING", "PAD_FOOTING", "PCC", "PCC"),
    "CH-Footing": ("footing", "CHT-Footing", "IFCFOOTING", "PAD_FOOTING", "RCC", "Footing"),
    "CH-Pedestal": ("pedestal", "CHT-Pedestal", "IFCCOLUMN", "COLUMN", "RCC", "Pedestal"),
    "CH-Column": ("column", "CHT-Column", "IFCCOLUMN", "COLUMN", "RCC", "Column"),
    "CH-Beam": ("beam", "CHT-Beam", "IFCBEAM", "BEAM", "RCC", "Beam"),
    "CH-Slab": ("slab", "CHT-Slab", "IFCSLAB", "FLOOR", "RCC", "Slab"),
    "CH-Wall-RCC": ("wall", "CHT-Wall-RCC", "IFCWALL", "STANDARD", "RCC", "RCC wall"),
    "CH-Wall-Brick": ("wall", "CHT-Wall-Brick", "IFCWALL", "STANDARD", "Brick", "Brick wall"),
    "CH-Chajja": ("chajja", "CHT-Chajja", "IFCSLAB", "NOTDEFINED", "RCC", "Chajja"),
    "CH-Window": ("window", "CHT-Window", "IFCWINDOW", "WINDOW", None, "Window"),
    "CH-Door": ("door", "CHT-Door", "IFCDOOR", "DOOR", None, "Door"),
}
FOUNDATION_KINDS = {"pcc", "footing", "pedestal"}
OPENING_KINDS = {"window", "door"}
ORIGIN_LAYER, LEVEL_LAYER, HEIGHT_LAYER = "CH-Origin", "CH-Level", "CH-Height"
PART_RE = re.compile(r"^Part-(\d+)$", re.I)
TOUCH_MM = 1.0  # overlaps thinner than this are touching, not overlapping


# ---------------------------------------------------------------- geometry helpers

def area(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))) / 2


def bbox(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def centroid(poly):
    b = bbox(poly)
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2


def point_in(poly, x, y):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def is_convex(poly):
    sign = 0
    n = len(poly)
    for i in range(n):
        a, b, c = poly[i], poly[(i + 1) % n], poly[(i + 2) % n]
        z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(z) > 1e-9:
            if sign and (z > 0) != (sign > 0):
                return False
            sign = z
    return True


def clip(subject, clipper):
    """Sutherland-Hodgman: subject clipped by a convex clipper (both CCW or CW, any)."""
    def orient(p):
        s = sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))
        return p if s > 0 else list(reversed(p))
    out = orient(subject)
    cl = orient(clipper)
    for i in range(len(cl)):
        a, b = cl[i], cl[(i + 1) % len(cl)]
        inp, out = out, []
        if not inp:
            break
        def inside(p):
            return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0
        def cross(p, q):
            dx1, dy1 = q[0] - p[0], q[1] - p[1]
            dx2, dy2 = b[0] - a[0], b[1] - a[1]
            den = dx1 * dy2 - dy1 * dx2
            t = ((a[0] - p[0]) * dy2 - (a[1] - p[1]) * dx2) / den if den else 0
            return (p[0] + t * dx1, p[1] + t * dy1)
        for j in range(len(inp)):
            p, q = inp[j], inp[(j + 1) % len(inp)]
            if inside(q):
                if not inside(p):
                    out.append(cross(p, q))
                out.append(q)
            elif inside(p):
                out.append(cross(p, q))
    return out


class PointGrid:
    """Points (e.g. label insertion points) bucketed on a square grid: `within(bounds)` returns only the
    items whose point can lie in the box, so matching labels to outlines is not outlines x labels."""

    def __init__(self, items, xy, cell=2000.0):
        self.cell = cell
        self.cells = {}
        for it in items:
            x, y = xy(it)
            self.cells.setdefault((int(x // cell), int(y // cell)), []).append((x, y, it))

    def within(self, b):
        c = self.cell
        out = []
        for i in range(int(b[0] // c), int(b[2] // c) + 1):
            for j in range(int(b[1] // c), int(b[3] // c) + 1):
                for x, y, it in self.cells.get((i, j), ()):
                    if b[0] <= x <= b[2] and b[1] <= y <= b[3]:
                        out.append(it)
        return out


def overlap_width(p, q):
    """Thickness of the overlap region of two polygons (0 when they only touch); None if not computable."""
    bp, bq = bbox(p), bbox(q)
    if bp[2] <= bq[0] or bq[2] <= bp[0] or bp[3] <= bq[1] or bq[3] <= bp[1]:
        return 0.0
    if is_convex(q):
        inter = clip(p, q)
    elif is_convex(p):
        inter = clip(q, p)
    else:
        return None
    if len(inter) < 3 or area(inter) < 1e-6:
        return 0.0
    b = bbox(inter)
    return min(b[2] - b[0], b[3] - b[1])


def rect_axes(poly):
    """For a rectangle-like outline: (long length, short length, long-axis unit vector, centre)."""
    best = None
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy)
        if L > 1e-6:
            ux, uy = dx / L, dy / L
            proj = [p[0] * ux + p[1] * uy for p in poly]
            perp = [-p[0] * uy + p[1] * ux for p in poly]
            w, h = max(proj) - min(proj), max(perp) - min(perp)
            if best is None or w * h < best[0]:
                cx = (max(proj) + min(proj)) / 2 * ux - (max(perp) + min(perp)) / 2 * uy
                cy = (max(proj) + min(proj)) / 2 * uy + (max(perp) + min(perp)) / 2 * ux
                if w >= h:
                    best = (w * h, w, h, (ux, uy), (cx, cy))
                else:
                    best = (w * h, h, w, (-uy, ux), (cx, cy))
    return best[1], best[2], best[3], best[4]


def wall_pieces(wall, ops):
    """Splits a rectangular wall around its openings into solid pieces: (plan polygon, z0, z1).
    Returns None when the wall outline is not a rectangle (then it is built whole)."""
    poly = wall["poly"]
    L, W, (ux, uy), (cx, cy) = rect_axes(poly)
    if abs(area(poly) - L * W) > max(1.0, 1e-4 * L * W):
        return None
    vx, vy = -uy, ux
    z0w, z1w = wall["z0"], wall["z1"]
    holes = []
    for op in ops:
        oL = rect_axes(op["poly"])[0]
        ocx, ocy = centroid(op["poly"])
        t = (ocx - cx) * ux + (ocy - cy) * uy
        a0, a1 = max(-L / 2, t - oL / 2), min(L / 2, t + oL / 2)
        h0, h1 = max(z0w, op["z0"]), min(z1w, op["z1"])
        if a1 - a0 > 1e-6 and h1 - h0 > 1e-6:
            holes.append((a0, a1, h0, h1))
    if not holes:
        return [(poly, z0w, z1w)]
    cuts = sorted({-L / 2, L / 2} | {h[0] for h in holes} | {h[1] for h in holes})

    def rect(a, b):
        return [(cx + ux * a - vx * W / 2, cy + uy * a - vy * W / 2), (cx + ux * b - vx * W / 2, cy + uy * b - vy * W / 2),
                (cx + ux * b + vx * W / 2, cy + uy * b + vy * W / 2), (cx + ux * a + vx * W / 2, cy + uy * a + vy * W / 2)]

    pieces = []
    for a, b in zip(cuts, cuts[1:]):
        if b - a < 1e-6:
            continue
        mid = (a + b) / 2
        gaps = sorted((h[2], h[3]) for h in holes if h[0] <= mid <= h[1])
        z = z0w
        for g0, g1 in gaps:  # solid between the holes stacked in this span
            if g0 > z + 1e-6:
                pieces.append((rect(a, b), z, g0))
            z = max(z, g1)
        if z1w > z + 1e-6:
            pieces.append((rect(a, b), z, z1w))
    return pieces


def wall_mesh(wall, ops):
    """One closed, outward-facing quad mesh of a rectangular wall with rectangular holes.
    Returns (points [(x, y, z)], faces [[i, j, k, l] 0-based]) or None when the wall is not a rectangle.
    The wall face is cut into a grid along the openings; solid cells get front and back quads and a
    side quad wherever they border a hole or the outside, so all edges are shared (watertight)."""
    poly = wall["poly"]
    L, W, (ux, uy), (cx, cy) = rect_axes(poly)
    if abs(area(poly) - L * W) > max(1.0, 1e-4 * L * W):
        return None
    vx, vy = -uy, ux
    z0w, z1w = wall["z0"], wall["z1"]
    holes = []
    for op in ops:
        oL = rect_axes(op["poly"])[0]
        ocx, ocy = centroid(op["poly"])
        t = (ocx - cx) * ux + (ocy - cy) * uy
        a0, a1 = max(-L / 2, t - oL / 2), min(L / 2, t + oL / 2)
        h0, h1 = max(z0w, op["z0"]), min(z1w, op["z1"])
        if a1 - a0 > 1e-6 and h1 - h0 > 1e-6:
            holes.append((a0, a1, h0, h1))
    A = sorted({round(v, 6) for v in [-L / 2, L / 2] + [h[0] for h in holes] + [h[1] for h in holes]})
    Z = sorted({round(v, 6) for v in [z0w, z1w] + [h[2] for h in holes] + [h[3] for h in holes]})
    na, nz = len(A) - 1, len(Z) - 1

    def solid(i, j):
        if i < 0 or j < 0 or i >= na or j >= nz:
            return False
        am, zm = (A[i] + A[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2
        return not any(h[0] < am < h[1] and h[2] < zm < h[3] for h in holes)

    pts, index, faces = [], {}, []

    def vid(a, b, z):
        key = (round(a, 4), round(b, 4), round(z, 4))
        if key not in index:
            index[key] = len(pts)
            pts.append((cx + ux * a + vx * b, cy + uy * a + vy * b, z))
        return index[key]

    def quad(corners, normal):
        ids = [vid(*c) for c in corners]
        p = [pts[k] for k in ids]
        e1 = [p[1][d] - p[0][d] for d in range(3)]
        e2 = [p[2][d] - p[0][d] for d in range(3)]
        n = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
        faces.append(ids if sum(n[d] * normal[d] for d in range(3)) > 0 else list(reversed(ids)))

    hw = W / 2
    nu, nv = (ux, uy, 0.0), (vx, vy, 0.0)
    for i in range(na):
        for j in range(nz):
            if not solid(i, j):
                continue
            a0, a1, z0, z1 = A[i], A[i + 1], Z[j], Z[j + 1]
            quad([(a0, -hw, z0), (a1, -hw, z0), (a1, -hw, z1), (a0, -hw, z1)], tuple(-c for c in nv))
            quad([(a0, hw, z0), (a1, hw, z0), (a1, hw, z1), (a0, hw, z1)], nv)
            if not solid(i - 1, j):
                quad([(a0, -hw, z0), (a0, hw, z0), (a0, hw, z1), (a0, -hw, z1)], tuple(-c for c in nu))
            if not solid(i + 1, j):
                quad([(a1, -hw, z0), (a1, hw, z0), (a1, hw, z1), (a1, -hw, z1)], nu)
            if not solid(i, j - 1):
                quad([(a0, -hw, z0), (a1, -hw, z0), (a1, hw, z0), (a0, hw, z0)], (0.0, 0.0, -1.0))
            if not solid(i, j + 1):
                quad([(a0, -hw, z1), (a1, -hw, z1), (a1, hw, z1), (a0, hw, z1)], (0.0, 0.0, 1.0))
    return pts, faces


# ---------------------------------------------------------------- reading

def _num(s):
    s = s.strip()
    if s[:1] in ("T", "t"):
        s = s[1:]
    return float(s)


def _level_numbers(text):
    t = text.strip()
    m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", t)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        return list(range(min(a, b), max(a, b) + 1))
    m = re.fullmatch(r"\d+", t)
    return [int(t)] if m else None


def _closed_points(e):
    if e.dxftype() == "LWPOLYLINE":
        pts = [(p[0], p[1]) for p in e.get_points("xy")]
        closed = e.closed or (len(pts) > 2 and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 1e-6)
        if closed and len(pts) > 2 and math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 1e-6:
            pts = pts[:-1]
        return pts if closed and len(pts) >= 3 else None
    if e.dxftype() == "POLYLINE" and not e.is_3d_polyline:
        pts = [(v.dxf.location[0], v.dxf.location[1]) for v in e.vertices]
        return pts if e.is_closed and len(pts) >= 3 else None
    return None


def _qa(items, severity, code, message, at=None, layer=None, handle=None, bounds=None):
    items.append({"severity": severity, "code": code, "message": message, "at": at, "layer": layer, "handle": handle, "bounds": bounds})


def analyze(path, level_names=None, level_heights=None):
    """Reads the DXF and returns frames, levels, elements and QA items (no IFC yet)."""
    t0 = time.perf_counter()
    doc = ezdxf.readfile(path)
    msp = doc.modelspace()
    qa = []
    ents = list(msp)

    # ---- frames
    frames = []
    for e in ents:
        m = PART_RE.match(e.dxf.layer)
        if not m:
            continue
        pts = _closed_points(e)
        if pts is None:
            _qa(qa, "info", "ignored", "Open or non-polyline geometry on a Part layer ignored.", layer=e.dxf.layer, handle=e.dxf.handle)
            continue
        frames.append({"part": int(m.group(1)), "poly": pts, "bounds": bbox(pts)})
    frames.sort(key=lambda f: (f["part"], f["bounds"][0]))
    if not frames:
        _qa(qa, "error", "no-frames", "No Part-<n> frames found: nothing to build.")

    def frame_of(x, y):
        for i, f in enumerate(frames):
            if point_in(f["poly"], x, y):
                return i
        return None

    for f in frames:
        f.update(origin=None, levels=None, level_label=None, height=None)
    texts = [e for e in ents if e.dxftype() in ("TEXT", "MTEXT")]

    def text_of(e):
        return e.plain_text() if e.dxftype() == "MTEXT" else e.dxf.text

    for e in ents:
        if e.dxf.layer == ORIGIN_LAYER and e.dxftype() == "CIRCLE":
            i = frame_of(e.dxf.center[0], e.dxf.center[1])
            if i is not None:
                if frames[i]["origin"] is not None:
                    _qa(qa, "error", "origin", "Frame has more than one origin circle.", at=list(e.dxf.center)[:2], layer=ORIGIN_LAYER, handle=e.dxf.handle)
                frames[i]["origin"] = (e.dxf.center[0], e.dxf.center[1])
    for e in texts:
        if e.dxf.layer not in (LEVEL_LAYER, HEIGHT_LAYER):
            continue
        ins = e.dxf.insert
        i = frame_of(ins[0], ins[1])
        if i is None:
            continue
        s = text_of(e)
        if e.dxf.layer == LEVEL_LAYER:
            nums = _level_numbers(s)
            if nums is None:
                _qa(qa, "error", "level-label", 'Level label "{}" is not a number or range like "2-4".'.format(s), at=[ins[0], ins[1]], layer=LEVEL_LAYER, handle=e.dxf.handle)
            frames[i]["levels"], frames[i]["level_label"] = nums, s
        else:
            try:
                frames[i]["height"] = float(s)
            except ValueError:
                _qa(qa, "error", "height-label", 'Storey height "{}" is not a number.'.format(s), at=[ins[0], ins[1]], layer=HEIGHT_LAYER, handle=e.dxf.handle)
    for i, f in enumerate(frames):
        b = f["bounds"]
        if f["origin"] is None:
            _qa(qa, "error", "origin", "Frame {} has no origin circle (CH-Origin).".format(i + 1), bounds=list(b))
            f["origin"] = (b[0], b[1])
        if not f["levels"]:
            _qa(qa, "error", "level-label", "Frame {} has no level label (CH-Level).".format(i + 1), bounds=list(b))
            f["levels"] = []

    # ---- levels (Level 1 = foundation frame: the one without a height)
    heights = dict(level_heights or {})
    levels = {}
    elevation = 0.0
    for f in frames:
        if f["height"] is None:
            f["foundation"] = True
            for n in f["levels"]:
                # the foundation frame's level is ±0; its elements hang below it
                levels[n] = {"number": n, "height": None, "elevation": 0.0, "bottom": 0.0, "foundation": True}
        else:
            f["foundation"] = False
    for f in frames:
        if f["foundation"]:
            continue
        for n in f["levels"]:
            h = float(heights.get(str(n), heights.get(n, f["height"])))
            if n in levels:
                _qa(qa, "error", "level-repeat", "Level {} appears in more than one frame.".format(n), bounds=list(f["bounds"]))
            # a level is the top of its storey: the storey runs from `bottom` up to `elevation`
            levels[n] = {"number": n, "height": h, "elevation": elevation + h, "bottom": elevation, "foundation": False}
            elevation += h
    names = dict(level_names or {})
    for n, lv in levels.items():
        lv["name"] = names.get(str(n), names.get(n, "Level {}".format(n)))

    # ---- elements
    placeholders = []
    elements = []
    ignored = {}
    labels_by_layer = {}
    for e in texts:
        labels_by_layer.setdefault(e.dxf.layer, []).append(e)
    # the labels of each layer on a grid: an outline looks only at labels within its own box
    label_grid = {layer: PointGrid(list(enumerate(ts)), lambda it: (it[1].dxf.insert[0], it[1].dxf.insert[1])) for layer, ts in labels_by_layer.items()}

    def labels_inside(layer, pts):
        grid = label_grid.get(layer)
        if grid is None:
            return []
        return [t for _, t in sorted(grid.within(bbox(pts)), key=lambda it: it[0]) if point_in(pts, t.dxf.insert[0], t.dxf.insert[1])]
    used_labels = set()
    seen_labels = set()  # labels that sit inside some outline (ambiguous ones are not "orphans")
    # Identical outlines stacked on the same layer (copy-paste duplicates): report once, build neither.
    shapes = {}
    for e in ents:
        if e.dxf.layer in ELEMENT_LAYERS and e.dxftype() not in ("TEXT", "MTEXT"):
            pts = _closed_points(e)
            if pts is not None:
                shapes.setdefault((e.dxf.layer, tuple(sorted((round(x), round(y)) for x, y in pts))), []).append((e, pts))
    duplicate = set()
    for (layer, _), group in shapes.items():
        if len(group) > 1:
            e0, pts = group[0]
            spec = ELEMENT_LAYERS[layer]
            inside = labels_inside(spec[1], pts)
            cx, cy = centroid(pts)
            handles = ", ".join(g[0].dxf.handle for g in group)
            if len(inside) <= 1:
                # Unambiguous: build the first outline once, skip the copies, and say so.
                for e, _ in group[1:]:
                    duplicate.add(e.dxf.handle)
                _qa(qa, "warning", "duplicate", "{} identical {} outlines stacked (handles {}): built once; delete the copies (AutoCAD OVERKILL).".format(
                    len(group), spec[5].lower(), handles), at=[cx, cy], layer=layer, handle=e0.dxf.handle, bounds=list(bbox(pts)))
                continue
            for t in inside:
                seen_labels.add(t.dxf.handle)
            for e, _ in group:
                duplicate.add(e.dxf.handle)
            _qa(qa, "error", "duplicate", "{} identical {} outlines stacked (handles {}) with {} labels {}: delete the extra outline and label; none is built.".format(
                len(group), spec[5].lower(), handles, len(inside), ", ".join('"{}"'.format(text_of(t)) for t in inside)),
                at=[cx, cy], layer=layer, handle=e0.dxf.handle, bounds=list(bbox(pts)))
    for e in ents:
        if e.dxf.handle in duplicate:
            continue
        spec = ELEMENT_LAYERS.get(e.dxf.layer)
        if not spec or e.dxftype() in ("TEXT", "MTEXT"):
            continue
        pts = _closed_points(e)
        if pts is None:
            ignored.setdefault(e.dxf.layer, []).append(e)
            continue
        kind, tlayer, ifc, predef, material, word = spec
        cx, cy = centroid(pts)
        fi = frame_of(cx, cy)
        if fi is None:
            _qa(qa, "warning", "outside-frame", "{} outline is outside every frame; ignored.".format(word), at=[cx, cy], layer=e.dxf.layer, handle=e.dxf.handle, bounds=list(bbox(pts)))
            continue
        inside = labels_inside(tlayer, pts)
        for t in inside:
            seen_labels.add(t.dxf.handle)
        if len(inside) != 1:
            _qa(qa, "error", "label-count", "{} outline has {} labels inside (needs exactly one).".format(word, len(inside)), at=[cx, cy], layer=e.dxf.layer, handle=e.dxf.handle, bounds=list(bbox(pts)))
            continue
        lab = text_of(inside[0]).strip()
        used_labels.add(inside[0].dxf.handle)
        parts = [p.strip() for p in lab.split(",")]
        f = frames[fi]
        try:
            if kind in OPENING_KINDS:
                if len(parts) != 4:
                    raise ValueError("expected panels,sill,height,MARK")
                panels, sill, height, mark = int(float(parts[0])), _num(parts[1]), _num(parts[2]), parts[3]
                values = {"panels": panels, "sill": sill, "height": height}
            else:
                if len(parts) != 3:
                    raise ValueError("expected level,size,MARK")
                first, size, mark = _num(parts[0]), _num(parts[1]), parts[2]
                values = {"first": first, "size": size}
            if not mark:
                raise ValueError("mark is empty")
        except ValueError as err:
            _qa(qa, "error", "label-format", '{} label "{}" cannot be read: {}.'.format(word, lab, err), at=[inside[0].dxf.insert[0], inside[0].dxf.insert[1]], layer=tlayer, handle=inside[0].dxf.handle, bounds=list(bbox(pts)))
            continue
        if kind in FOUNDATION_KINDS and not f["foundation"]:
            _qa(qa, "warning", "frame-kind", "{} {} is in a storey frame; foundations belong in the foundation frame.".format(word, mark), at=[cx, cy], layer=e.dxf.layer, handle=e.dxf.handle)
        ox, oy = f["origin"]
        local = [(x - ox, y - oy) for x, y in pts]
        for n in f["levels"]:
            lv = levels.get(n)
            if lv is None:
                continue
            base = lv["bottom"]  # the storey's floor; element labels measure down from its top (the level)
            if f["foundation"]:
                top = values.get("first", 0.0)
                z1, z0 = top, top - values.get("size", 0.0)
            elif kind in OPENING_KINDS:
                z0 = base + values["sill"]
                z1 = z0 + values["height"]
            else:
                z1 = base + lv["height"] - values["first"]
                z0 = z1 - values["size"]
            el = {"kind": kind, "layer": e.dxf.layer, "ifc": ifc, "predefined": predef, "material": material, "word": word,
                  "mark": mark, "label": lab, "level": n, "poly": local, "z0": z0, "z1": z1, "handle": e.dxf.handle,
                  "frame": fi, "at": [cx, cy], "bounds": list(bbox(pts))}
            el.update(values)
            elements.append(el)
            if not f["foundation"] and kind == "wall" and z0 < base - TOUCH_MM:
                _qa(qa, "warning", "wall-height", "Wall {} on {} starts {:.0f} mm below its floor: its height is more than the storey allows.".format(mark, lv["name"], base - z0), at=[cx, cy], layer=e.dxf.layer, handle=e.dxf.handle, bounds=list(bbox(pts)))
            if kind in OPENING_KINDS and values["panels"] == 0 and n == f["levels"][0]:
                placeholders.append(mark)

    if placeholders:
        uniq = sorted(set(placeholders), key=lambda m: (re.sub(r"\d+", "", m), int(re.sub(r"\D", "", m) or 0)))
        _qa(qa, "info", "panels", "{} windows/doors have panel count 0 (placeholder), built as 1 panel: {}.".format(len(placeholders), ", ".join(uniq)))
    for layer, es in ignored.items():
        _qa(qa, "info", "ignored", "{} open line(s) or non-polyline object(s) on {} ignored (only closed polylines are used).".format(len(es), layer), at=None, layer=layer, handle=es[0].dxf.handle)
    for layer, ts in labels_by_layer.items():
        if layer.startswith("CHT-"):
            for t in ts:
                if t.dxf.handle not in used_labels and t.dxf.handle not in seen_labels:
                    _qa(qa, "warning", "orphan-label", 'Label "{}" is not inside any {} outline.'.format(text_of(t), "CH-" + layer[4:]), at=[t.dxf.insert[0], t.dxf.insert[1]], layer=layer, handle=t.dxf.handle)

    # ---- openings: find host walls; overlaps between solids on the same level
    by_level = {}
    for el in elements:
        by_level.setdefault(el["level"], []).append(el)
    for n, els in by_level.items():
        walls = [(w, bbox(w["poly"])) for w in els if w["kind"] == "wall"]
        for op in (x for x in els if x["kind"] in OPENING_KINDS):
            c = centroid(op["poly"])
            host = next((w for w, b in walls if b[0] <= c[0] <= b[2] and b[1] <= c[1] <= b[3] and point_in(w["poly"], c[0], c[1])), None)
            op["host"] = host
            if host is None and n == min(frames[op["frame"]]["levels"]):
                _qa(qa, "warning", "no-host", "{} {} is not inside a wall: built without cutting an opening.".format(op["word"], op["mark"]), at=op["at"], layer=op["layer"], handle=op["handle"])
        solids = [x for x in els if x["kind"] not in OPENING_KINDS]
        # Overlaps are reported once per plan, on its frame's first level: repeated levels skip the work.
        # Pairs (i < j, as listed) come from a sweep over boxes sorted by x: only boxes that meet in x are
        # compared, and the report keeps the listed order of each pair.
        reports = [n == min(frames[x["frame"]]["levels"]) for x in solids]
        if not any(reports):
            continue
        boxes = [bbox(x["poly"]) for x in solids]
        order = sorted(range(len(solids)), key=lambda k: boxes[k][0])
        pairs = []
        for oi, i in enumerate(order):
            bi = boxes[i]
            for j in order[oi + 1:]:
                bj = boxes[j]
                if bj[0] >= bi[2]:
                    break  # sorted by x: nothing further meets this box
                if bi[3] <= bj[1] or bj[3] <= bi[1]:
                    continue
                pairs.append((i, j) if i < j else (j, i))
        for i, j in sorted(pairs):
            a, b = solids[i], solids[j]
            if not reports[i]:
                continue
            if a["z1"] <= b["z0"] + TOUCH_MM or b["z1"] <= a["z0"] + TOUCH_MM:
                continue  # different heights, e.g. a wall under its beam
            if {a["kind"], b["kind"]} <= FOUNDATION_KINDS:
                continue
            w = overlap_width(a["poly"], b["poly"])
            if w is not None and w > TOUCH_MM:
                _qa(qa, "warning", "overlap", "{} {} and {} {} overlap by {:.0f} mm in plan (volume counted twice).".format(a["word"], a["mark"], b["word"], b["mark"], w), at=a["at"], layer=a["layer"], handle=a["handle"])

    # Level 1 (foundation) stays at ±0: its elements hang below it, as a storey's hang below its level.
    order = sorted(levels.values(), key=lambda l: (l["elevation"], l["number"]))
    counts = {}
    for el in elements:
        key = (el["level"], el["word"])
        counts[key] = counts.get(key, 0) + 1
    return {
        "version": __version__,
        "file": path,
        "frames": [{"part": f["part"], "levels": f["levels"], "label": f["level_label"], "height": f["height"], "origin": f["origin"], "bounds": list(f["bounds"]), "foundation": f["foundation"]} for f in frames],
        "levels": order,
        "elements": elements,
        "counts": [{"level": k[0], "kind": k[1], "count": v} for k, v in sorted(counts.items())],
        "qa": qa,
        "ms": (time.perf_counter() - t0) * 1000,
    }


# ---------------------------------------------------------------- IFC writing

_B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"


def ifc_guid(key):
    """Deterministic 22-character IFC GlobalId from a key (same key -> same id on every run)."""
    n = uuid.uuid5(uuid.NAMESPACE_URL, "shanku:" + key).int
    chars = []
    for _ in range(22):
        chars.append(_B64[n % 64])
        n //= 64
    return "".join(reversed(chars))


def _s(text):
    return "'" + str(text).replace("\\", "\\\\").replace("'", "''") + "'"


def _f(v):
    r = repr(round(float(v), 4))
    return r if ("." in r or "e" in r or "E" in r) else r + "."


class _Step:
    def __init__(self):
        self.lines = []

    def add(self, text):
        self.lines.append(text)
        return "#{}".format(len(self.lines))


def build_ifc(result, project_name="Shanku DXF model", source_name="drawing.dxf"):
    """IFC4 (Reference View geometry: extrusions) from an analyze() result. Returns the file text."""
    S = _Step()
    a = S.add
    origin = a("IFCCARTESIANPOINT((0.,0.,0.))")
    zdir = a("IFCDIRECTION((0.,0.,1.))")
    xdir = a("IFCDIRECTION((1.,0.,0.))")
    world = a("IFCAXIS2PLACEMENT3D({},{},{})".format(origin, zdir, xdir))
    ctx = a("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,{},$)".format(world))
    body = a("IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,{},$,.MODEL_VIEW.,$)".format(ctx))
    units = [a("IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)"), a("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)"),
             a("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)"), a("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)")]
    ua = a("IFCUNITASSIGNMENT(({}))".format(",".join(units)))
    project = a("IFCPROJECT({},$,{},{},$,$,$,({}),{})".format(_s(ifc_guid("project:" + source_name)), _s(project_name), _s("From " + source_name + " by the Shanku DXF pipeline " + __version__), ctx, ua))
    site_pl = a("IFCLOCALPLACEMENT($,{})".format(world))
    site = a("IFCSITE({},$,'Site',$,$,{},$,$,.ELEMENT.,$,$,$,$,$)".format(_s(ifc_guid("site:" + source_name)), site_pl))
    bld_pl = a("IFCLOCALPLACEMENT({},{})".format(site_pl, world))
    building = a("IFCBUILDING({},$,'Building',$,$,{},$,$,.ELEMENT.,$,$,$)".format(_s(ifc_guid("building:" + source_name)), bld_pl))
    a("IFCRELAGGREGATES({},$,$,$,{},({}))".format(_s(ifc_guid("agg1:" + source_name)), project, site))
    a("IFCRELAGGREGATES({},$,$,$,{},({}))".format(_s(ifc_guid("agg2:" + source_name)), site, building))

    storey = {}
    storey_pl = {}
    for lv in result["levels"]:
        pt = a("IFCCARTESIANPOINT((0.,0.,{}))".format(_f(lv["elevation"])))
        pl = a("IFCLOCALPLACEMENT({},IFCAXIS2PLACEMENT3D({},{},{}))".format(bld_pl, pt, zdir, xdir).replace("IFCAXIS2PLACEMENT3D(", "#AXIS(") )
        # inline axis placements are not allowed in STEP; write it as its own entity
        S.lines.pop()
        ax = a("IFCAXIS2PLACEMENT3D({},{},{})".format(pt, zdir, xdir))
        pl = a("IFCLOCALPLACEMENT({},{})".format(bld_pl, ax))
        st = a("IFCBUILDINGSTOREY({},$,{},$,$,{},$,$,.ELEMENT.,{})".format(_s(ifc_guid("storey:{}:{}".format(source_name, lv["number"]))), _s(lv["name"]), pl, _f(lv["elevation"])))
        storey[lv["number"]], storey_pl[lv["number"]] = st, (pl, lv["elevation"])
    a("IFCRELAGGREGATES({},$,$,$,{},({}))".format(_s(ifc_guid("agg3:" + source_name)), building, ",".join(storey[l["number"]] for l in result["levels"])))

    def solid(poly, z0_rel, depth):
        pts = ",".join(a("IFCCARTESIANPOINT(({},{}))".format(_f(x), _f(y))) for x, y in poly)
        pl = a("IFCPOLYLINE(({},{}))".format(pts, pts.split(",")[0]))
        prof = a("IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,{})".format(pl))
        p0 = a("IFCCARTESIANPOINT((0.,0.,{}))".format(_f(z0_rel)))
        pos = a("IFCAXIS2PLACEMENT3D({},{},{})".format(p0, zdir, xdir))
        return a("IFCEXTRUDEDAREASOLID({},{},{},{})".format(prof, pos, zdir, _f(max(depth, 1.0))))

    def make_shape(solids):
        rep = a("IFCSHAPEREPRESENTATION({},'Body','SweptSolid',({}))".format(body, ",".join(solids)))
        return a("IFCPRODUCTDEFINITIONSHAPE($,$,({}))".format(rep))

    def extrusion(poly, z0_rel, depth):
        return make_shape([solid(poly, z0_rel, depth)])

    # Reference View: walls carry their openings in their own geometry (no opening elements or
    # boolean voids), windows and doors simply sit in the holes. Importers such as Revit then have
    # nothing to cut. Openings are grouped by host wall first.
    openings_of = {}
    for el in result["elements"]:
        if el["kind"] in OPENING_KINDS and el.get("host") is not None:
            openings_of.setdefault(id(el["host"]), []).append(el)

    contained = {n: [] for n in storey}
    by_material = {}
    by_type = {}
    report = {"elements": 0, "openings": 0, "by_kind": {}}

    for el in result["elements"]:
        n = el["level"]
        if n not in storey:
            continue
        spl, elev = storey_pl[n]
        pl = a("IFCLOCALPLACEMENT({},{})".format(spl, world))
        depth = el["z1"] - el["z0"]
        key = "{}|{}|{}|{:.0f}|{:.0f}".format(el["layer"], el["mark"], n, el["at"][0], el["at"][1])
        gid = _s(ifc_guid(key))
        name = _s("{} {}".format(el["word"], el["mark"]))
        tag = _s(el["mark"])
        poly = el["poly"]
        if el["kind"] in OPENING_KINDS:
            L, W, (ux, uy), (cx, cy) = rect_axes(poly)
            t = min(W, 60.0)  # a thin panel on the wall centre line
            vx, vy = -uy, ux
            panel = [(cx - ux * L / 2 - vx * t / 2, cy - uy * L / 2 - vy * t / 2), (cx + ux * L / 2 - vx * t / 2, cy + uy * L / 2 - vy * t / 2),
                     (cx + ux * L / 2 + vx * t / 2, cy + uy * L / 2 + vy * t / 2), (cx - ux * L / 2 + vx * t / 2, cy - uy * L / 2 + vy * t / 2)]
            panel_shape = extrusion(panel, el["z0"] - elev, depth)
            panels = max(1, el.get("panels", 1))
            if el["kind"] == "window":
                part = {1: "SINGLE_PANEL", 2: "DOUBLE_PANEL_VERTICAL", 3: "TRIPLE_PANEL_VERTICAL"}.get(panels, "USERDEFINED")
                ent = a("IFCWINDOW({},$,{},$,$,{},{},{},{},{},.WINDOW.,.{}.,$)".format(gid, name, pl, panel_shape, tag, _f(el["height"]), _f(L), part))
            else:
                op_type = {1: "SINGLE_SWING_LEFT", 2: "DOUBLE_DOOR_SINGLE_SWING"}.get(panels, "USERDEFINED")
                ent = a("IFCDOOR({},$,{},$,$,{},{},{},{},{},.DOOR.,.{}.,$)".format(gid, name, pl, panel_shape, tag, _f(el["height"]), _f(L), op_type))
            if el.get("host") is not None:
                report["openings"] += 1
            el["_ent"] = ent
            qs = [a("IFCQUANTITYLENGTH('Width',$,$,{},$)".format(_f(L))), a("IFCQUANTITYLENGTH('Height',$,$,{},$)".format(_f(el["height"]))),
                  a("IFCQUANTITYAREA('Area',$,$,{},$)".format(_f(L * el["height"] / 1e6)))]
            q = a("IFCELEMENTQUANTITY({},$,{},$,$,({}))".format(_s(ifc_guid("qto:" + key)), _s("Qto_WindowBaseQuantities" if el["kind"] == "window" else "Qto_DoorBaseQuantities"), ",".join(qs)))
            a("IFCRELDEFINESBYPROPERTIES({},$,$,$,({}),{})".format(_s(ifc_guid("qrel:" + key)), ent, q))
        else:
            ops = openings_of.get(id(el), [])
            pieces = wall_pieces(el, ops) if ops else None
            if pieces is None:
                geom = extrusion(poly, el["z0"] - elev, depth)
                if ops:
                    report["uncut"] = report.get("uncut", 0) + len(ops)  # host is not a rectangle
            else:
                # One closed tessellated solid with the holes (several touching extrusions made
                # Revit merge the pieces and drop some of them).
                pts3, faces3 = wall_mesh(el, ops)
                coords = a("IFCCARTESIANPOINTLIST3D(({}),$)".format(",".join("({},{},{})".format(_f(x), _f(y), _f(z - elev)) for x, y, z in pts3)))
                fs = [a("IFCINDEXEDPOLYGONALFACE(({}))".format(",".join(str(k + 1) for k in f))) for f in faces3]
                tess = a("IFCPOLYGONALFACESET({},.T.,({}),$)".format(coords, ",".join(fs)))
                rep = a("IFCSHAPEREPRESENTATION({},'Body','Tessellation',({}))".format(body, tess))
                geom = a("IFCPRODUCTDEFINITIONSHAPE($,$,({}))".format(rep))
                el["_net"] = sum(area(pp) * (z1 - z0) for pp, z0, z1 in pieces) / 1e9
                el["_cut_ops"] = ops
            cls = el["ifc"]
            ent = a("{}({},$,{},$,{},{},{},{},.{}.)".format(cls, gid, name, _s(el["word"]), pl, geom, tag, el["predefined"]))
            el["_ent"] = ent
            by_material.setdefault(el["material"], []).append(ent)
            if el["kind"] in ("column", "pedestal", "beam", "footing", "pcc", "wall"):
                L, W, _, _ = rect_axes(poly)
                size = "{:.0f}x{:.0f}".format(W, L) if el["kind"] not in ("beam", "wall") else "{:.0f}x{:.0f}".format(W, depth)
            else:
                size = "{:.0f}".format(depth)
            tname = "{} {}".format(el["word"], size)
            by_type.setdefault((cls, tname, el["predefined"]), []).append(ent)
        by_kind = report["by_kind"]
        by_kind[el["word"]] = by_kind.get(el["word"], 0) + 1
        report["elements"] += 1
        contained[n].append(ent)
        # properties: mark, label, source
        props = [a("IFCPROPERTYSINGLEVALUE('Mark',$,IFCLABEL({}),$)".format(tag)),
                 a("IFCPROPERTYSINGLEVALUE('DXF label',$,IFCLABEL({}),$)".format(_s(el["label"]))),
                 a("IFCPROPERTYSINGLEVALUE('DXF layer',$,IFCLABEL({}),$)".format(_s(el["layer"]))),
                 a("IFCPROPERTYSINGLEVALUE('DXF handle',$,IFCLABEL({}),$)".format(_s(el["handle"])))]
        if el["kind"] in OPENING_KINDS:
            host = el.get("host")
            props.append(a("IFCPROPERTYSINGLEVALUE('Host wall',$,IFCLABEL({}),$)".format(_s(host["mark"] if host else ""))))
        ps = a("IFCPROPERTYSET({},$,'Shanku_DXF',$,({}))".format(_s(ifc_guid("pset:" + key)), ",".join(props)))
        a("IFCRELDEFINESBYPROPERTIES({},$,$,$,({}),{})".format(_s(ifc_guid("prel:" + key)), ent, ps))

    # quantities for all solids (walls use their net volume after openings)
    for el in result["elements"]:
        if el["kind"] in OPENING_KINDS or "_ent" not in el:
            continue
        ent = el["_ent"]
        key = "{}|{}|{}|{:.0f}|{:.0f}".format(el["layer"], el["mark"], el["level"], el["at"][0], el["at"][1])
        depth = el["z1"] - el["z0"]
        plan = area(el["poly"])  # mm²
        gross = plan * depth / 1e9
        net = el.get("_net", gross)
        L, W, _, _ = rect_axes(el["poly"])
        qs = [a("IFCQUANTITYVOLUME('GrossVolume',$,$,{},$)".format(_f(gross))), a("IFCQUANTITYVOLUME('NetVolume',$,$,{},$)".format(_f(net)))]
        if el["kind"] in ("beam",):
            qs += [a("IFCQUANTITYLENGTH('Length',$,$,{},$)".format(_f(L))), a("IFCQUANTITYLENGTH('Width',$,$,{},$)".format(_f(W))), a("IFCQUANTITYLENGTH('Depth',$,$,{},$)".format(_f(depth)))]
        elif el["kind"] in ("slab", "chajja"):
            qs += [a("IFCQUANTITYAREA('NetArea',$,$,{},$)".format(_f(plan / 1e6))), a("IFCQUANTITYLENGTH('Depth',$,$,{},$)".format(_f(depth)))]
        elif el["kind"] == "wall":
            side = L * depth / 1e6 - sum(rect_axes(op["poly"])[0] * max(0.0, min(op["z1"], el["z1"]) - max(op["z0"], el["z0"])) for op in el.get("_cut_ops", [])) / 1e6
            qs += [a("IFCQUANTITYLENGTH('Length',$,$,{},$)".format(_f(L))), a("IFCQUANTITYLENGTH('Width',$,$,{},$)".format(_f(W))),
                   a("IFCQUANTITYLENGTH('Height',$,$,{},$)".format(_f(depth))), a("IFCQUANTITYAREA('NetSideArea',$,$,{},$)".format(_f(side)))]
        else:
            qs += [a("IFCQUANTITYLENGTH('Length',$,$,{},$)".format(_f(L))), a("IFCQUANTITYLENGTH('Width',$,$,{},$)".format(_f(W))), a("IFCQUANTITYLENGTH('Height',$,$,{},$)".format(_f(depth)))]
        qname = {"IFCCOLUMN": "Qto_ColumnBaseQuantities", "IFCBEAM": "Qto_BeamBaseQuantities", "IFCSLAB": "Qto_SlabBaseQuantities", "IFCWALL": "Qto_WallBaseQuantities", "IFCFOOTING": "Qto_FootingBaseQuantities"}[el["ifc"]]
        q = a("IFCELEMENTQUANTITY({},$,{},$,$,({}))".format(_s(ifc_guid("qto:" + key)), _s(qname), ",".join(qs)))
        a("IFCRELDEFINESBYPROPERTIES({},$,$,$,({}),{})".format(_s(ifc_guid("qrel:" + key)), ent, q))

    for n, ents in contained.items():
        if ents:
            a("IFCRELCONTAINEDINSPATIALSTRUCTURE({},$,$,$,({}),{})".format(_s(ifc_guid("cont:{}:{}".format(source_name, n))), ",".join(ents), storey[n]))
    for mat, ents in by_material.items():
        m = a("IFCMATERIAL({},$,$)".format(_s(mat)))
        a("IFCRELASSOCIATESMATERIAL({},$,$,$,({}),{})".format(_s(ifc_guid("mat:{}:{}".format(source_name, mat))), ",".join(ents), m))
    for (cls, tname, predef), ents in by_type.items():
        t = a("{}TYPE({},$,{},$,$,$,$,$,$,.{}.)".format(cls, _s(ifc_guid("type:{}:{}".format(source_name, tname))), _s(tname), predef))
        a("IFCRELDEFINESBYTYPE({},$,$,$,({}),{})".format(_s(ifc_guid("trel:{}:{}".format(source_name, tname))), ",".join(ents), t))

    header = "\n".join([
        "ISO-10303-21;", "HEADER;",
        "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
        "FILE_NAME({},{},(''),(''),'Shanku DXF pipeline {}','Shanku','');".format(_s(project_name + ".ifc"), _s(time.strftime("%Y-%m-%dT%H:%M:%S")), __version__),
        "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;"])
    body_txt = "\n".join("#{}={};".format(i + 1, line) for i, line in enumerate(S.lines))
    return header + "\n" + body_txt + "\nENDSEC;\nEND-ISO-10303-21;\n", report


# ---------------------------------------------------------------- Revit exchange (Export to Revit)

EXCHANGE_VERSION = 1
RECT_KINDS = {"column", "pedestal", "beam", "wall", "footing", "pcc"}


def _rect_or_round(poly):
    """('rect', long, short, (ux, uy), centre) for a rectangle; ('round', diameter, centre) for a
    many-sided near-circle; None otherwise. Tolerance 1 % of the area."""
    L, W, u, c = rect_axes(poly)
    a = area(poly)
    if L * W > 0 and abs(a - L * W) <= 0.01 * L * W:
        return ("rect", L, W, u, c)
    if len(poly) >= 8 and L > 0 and abs(L - W) <= 0.02 * L and abs(a - math.pi * (L / 2) ** 2) <= 0.03 * a:
        # CAD polygonises a circle with its vertices on the circle: the diameter is twice their distance
        cx, cy = sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)
        d = 2 * sum(math.hypot(p[0] - cx, p[1] - cy) for p in poly) / len(poly)
        return ("round", d, (cx, cy))
    return None


def exchange(result):
    """The model as Revit needs it: levels, and per element its exact geometry in mm, relative to the
    drawing origin (which goes to Revit's Project Base Point). Every element carries a stable id
    (drawing handle and level) so a second export can tell what Revit already has."""
    by_num = {lv["number"]: lv for lv in result["levels"]}
    items, skipped = [], []
    r1 = lambda v: round(float(v), 1)
    pt = lambda p: [r1(p[0]), r1(p[1])]
    for el in result["elements"]:
        lv = by_num.get(el["level"])
        if lv is None:
            continue
        item = {"id": "DXF:{}:L{}".format(el["handle"], el["level"]), "kind": el["kind"], "mark": el["mark"],
                "material": el["material"], "level": lv["name"], "z0": r1(el["z0"]), "z1": r1(el["z1"])}
        poly = el["poly"]
        if el["kind"] in OPENING_KINDS:
            skipped.append(dict(item, reason="Windows and doors come in a later version."))
            continue
        if el["kind"] in ("slab", "chajja"):
            item.update(outline=[pt(p) for p in poly], thickness=r1(el["z1"] - el["z0"]))
            items.append(item)
            continue
        shape = _rect_or_round(poly)
        if shape is None:
            skipped.append(dict(item, reason="The outline is not a rectangle{}.".format(" or a circle" if el["kind"] in ("column", "pedestal") else "")))
            continue
        if shape[0] == "round":
            if el["kind"] not in ("column", "pedestal"):
                skipped.append(dict(item, reason="Only columns can be round."))
                continue
            item.update(shape="round", center=pt(shape[2]), diameter=r1(shape[1]))
            items.append(item)
            continue
        _, L, W, u, c = shape
        angle = round(math.degrees(math.atan2(u[1], u[0])), 3)
        if el["kind"] in ("beam", "wall"):
            half = L / 2
            item.update(start=pt((c[0] - u[0] * half, c[1] - u[1] * half)), end=pt((c[0] + u[0] * half, c[1] + u[1] * half)),
                        width=r1(W), depth=r1(el["z1"] - el["z0"]))
        else:  # column, pedestal, footing, pcc: centred rectangles
            item.update(shape="rect", center=pt(c), width=r1(W), length=r1(L), angle=angle, thickness=r1(el["z1"] - el["z0"]))
        items.append(item)
    return {
        "version": EXCHANGE_VERSION,
        "units": "mm",
        "levels": [{"name": lv["name"], "elevation": r1(lv["elevation"]), "foundation": bool(lv["foundation"])} for lv in result["levels"]],
        "elements": items,
        "skipped": skipped,
    }


def summary_for_js(result):
    """analyze() result without the heavy/internal parts, for the review screen."""
    return {k: result[k] for k in ("version", "frames", "levels", "counts", "qa", "ms")}


def run_for_js(path, options_json):
    """Entry point for the browser worker. options: {names, heights, build, project}. Returns (summary JSON, IFC text or '')."""
    import json
    opts = json.loads(options_json or "{}")
    r = analyze(path, level_names=opts.get("names"), level_heights=opts.get("heights"))
    ifc, report = ("", None)
    if opts.get("build"):
        ifc, report = build_ifc(r, opts.get("project") or "Shanku model", opts.get("source") or "drawing.dxf")
    out = summary_for_js(r)
    out["report"] = report
    if opts.get("exchange"):
        out["exchange"] = exchange(r)  # for Export to Revit
    return json.dumps(out, default=str), ifc
