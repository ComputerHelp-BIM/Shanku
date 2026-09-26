#!/usr/bin/env python3
"""Showcase RCC buildings as IFC4 files: the sample buildings on Shanku's start page.

Usage:
    python tools/fixtures/make_showcase_ifc.py tower  apps/web/public/samples/g14-tower.ifc
    python tools/fixtures/make_showcase_ifc.py twin   apps/web/public/samples/g24-twin-towers.ifc
    (add --gzip to write .ifc.gz, which the app opens directly)

tower: G+14 residential tower. 5 x 3 bays (6.0 / 4.5 m by 5.5 / 5.0 m), ground 4.0 m and floors
    3.0 m, columns stepped 750 / 600 / 450 square (M40 / M35 / M30), 300 x 600 primary and
    230 x 450 secondary beams, 150 mm slabs with the core cut out, a 250 mm shear-wall lift and stair
    core with stairs, a raft on 600 mm piles under the core, isolated footings, an entrance canopy on
    four 600 mm round columns, a 1:12 entrance ramp, terrace parapets and a water tank.
twin: two G+24 towers on a G+3 podium. 8 x 5 bays of 8.0 m podium (parking) with 700 mm round
    columns in an atrium, two 1:10 parking ramps, 600 x 1500 transfer beams at the podium roof, and
    two 5 x 4 bay towers of 3.2 m floors with shear-wall cores and stairs.

Every element carries a mark and concrete grade (Shanku_Structural), Pset_*Common and IFC base
quantities (lengths in mm, areas m2, volumes m3), so marks, BOQ, QA, colour by grade and every
measure and dimension tool have something real to work on.

Built with low-level entities and shared representations: seconds, not minutes.
Requires IfcOpenShell. Dev-only tool: nothing here ships in the app except the files it writes.
Version 1.0.0
"""
import gzip
import math
import sys
import time

import ifcopenshell
import ifcopenshell.guid

__version__ = "1.0.0"

MM = 1000.0


class Model:
    """A small IFC4 writer for structural elements with marks, grades and quantities."""

    def __init__(self, project_name, building_name):
        f = self.f = ifcopenshell.file(schema="IFC4")
        # Structural models for design exchange (what Shanku rates as Supported)
        f.header.file_description.description = ("ViewDefinition[DesignTransferView]",)
        f.header.file_name.name = project_name
        f.header.file_name.organization = ("Shanku samples",)
        f.header.file_name.originating_system = f"Shanku make_showcase_ifc.py {__version__}"
        units = f.createIfcUnitAssignment([
            f.createIfcSIUnit(None, "LENGTHUNIT", "MILLI", "METRE"),
            f.createIfcSIUnit(None, "AREAUNIT", None, "SQUARE_METRE"),
            f.createIfcSIUnit(None, "VOLUMEUNIT", None, "CUBIC_METRE"),
            f.createIfcSIUnit(None, "PLANEANGLEUNIT", None, "RADIAN"),
        ])
        origin = f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.0, 0.0, 0.0)), None, None)
        ctx = f.createIfcGeometricRepresentationContext(None, "Model", 3, 1.0e-5, origin, f.createIfcDirection((0.0, 1.0)))
        self.body = f.createIfcGeometricRepresentationSubContext("Body", "Model", None, None, None, None, ctx, None, "MODEL_VIEW", None)
        self.project = f.createIfcProject(self.guid(), None, project_name, None, None, None, None, [ctx], units)
        self.site = f.createIfcSite(self.guid(), None, "Site", None, None, self.place(0, 0, 0), None, None, "ELEMENT", None, None, None, None, None)
        self.building = f.createIfcBuilding(self.guid(), None, building_name, None, None, self.place(0, 0, 0), None, None, "ELEMENT", None, None, None)
        f.createIfcRelAggregates(self.guid(), None, None, None, self.project, [self.site])
        f.createIfcRelAggregates(self.guid(), None, None, None, self.site, [self.building])
        self.storeys = []
        self.contained = {}
        self.types = {}
        self.typed = {}
        self.reps = {}
        self.count = {}
        self.z_dir = f.createIfcDirection((0.0, 0.0, 1.0))

    @staticmethod
    def guid():
        return ifcopenshell.guid.new()

    # ------------------------------------------------------------ placement and geometry

    def place(self, x, y, z, zdir=(0.0, 0.0, 1.0), xdir=(1.0, 0.0, 0.0)):
        f = self.f
        return f.createIfcLocalPlacement(None, f.createIfcAxis2Placement3D(
            f.createIfcCartesianPoint((x * MM, y * MM, z * MM)), f.createIfcDirection(tuple(map(float, zdir))), f.createIfcDirection(tuple(map(float, xdir)))))

    def _pos2d(self, dx=0.0, dy=0.0):
        return self.f.createIfcAxis2Placement2D(self.f.createIfcCartesianPoint((dx * MM, dy * MM)), None)

    def rect(self, w, d, dx=0.0, dy=0.0):
        """Rectangle w x d (m) centred at (dx, dy) in the profile plane."""
        return self.f.createIfcRectangleProfileDef("AREA", None, self._pos2d(dx, dy), w * MM, d * MM)

    def circle(self, r):
        return self.f.createIfcCircleProfileDef("AREA", None, self._pos2d(), r * MM)

    def polygon(self, pts, holes=()):
        f = self.f

        def poly(p):
            pts2 = [f.createIfcCartesianPoint((x * MM, y * MM)) for x, y in p]
            return f.createIfcPolyline(pts2 + [pts2[0]])

        if holes:
            return f.createIfcArbitraryProfileDefWithVoids("AREA", None, poly(pts), [poly(h) for h in holes])
        return f.createIfcArbitraryClosedProfileDef("AREA", None, poly(pts))

    def shape(self, key, profile_fn, depth):
        """Shared product shape: one extrusion of `depth` m along local Z (cached by key)."""
        if key not in self.reps:
            f = self.f
            solid = f.createIfcExtrudedAreaSolid(profile_fn(), f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.0, 0.0, 0.0)), None, None), self.z_dir, depth * MM)
            rep = f.createIfcShapeRepresentation(self.body, "Body", "SweptSolid", [solid])
            self.reps[key] = f.createIfcProductDefinitionShape(None, None, [rep])
        return self.reps[key]

    # ------------------------------------------------------------ spatial structure

    def storey(self, name, elevation_m):
        s = self.f.createIfcBuildingStorey(self.guid(), None, name, None, None, self.place(0, 0, elevation_m), None, None, "ELEMENT", elevation_m * MM)
        self.storeys.append(s)
        self.contained[s] = []
        return s

    def type_of(self, ifc_type, name, predefined):
        key = (ifc_type, name)
        if key not in self.types:
            self.types[key] = self.f.create_entity(ifc_type, GlobalId=self.guid(), Name=name, PredefinedType=predefined)
            self.typed[key] = []
        return key

    # ------------------------------------------------------------ elements

    def element(self, cls, prefix, storey, placement, shape, grade, type_key=None, qto=None, predefined=None, name=None):
        """One element with its mark (prefix + running number), grade, type and base quantities."""
        f = self.f
        n = self.count[prefix] = self.count.get(prefix, 0) + 1
        mark = f"{prefix}{n}"
        attrs = dict(GlobalId=self.guid(), Name=name or mark, ObjectPlacement=placement, Representation=shape, Tag=mark)
        if predefined:
            attrs["PredefinedType"] = predefined
        el = f.create_entity(cls, **attrs)
        self.contained[storey].append(el)
        if type_key:
            self.typed[type_key].append(el)
        common = {"IfcColumn": "Pset_ColumnCommon", "IfcBeam": "Pset_BeamCommon", "IfcSlab": "Pset_SlabCommon", "IfcWall": "Pset_WallCommon",
                  "IfcFooting": "Pset_FootingCommon", "IfcPile": "Pset_PileCommon", "IfcStair": "Pset_StairCommon"}.get(cls)
        props = []
        if common:
            props.append(self._pset(common, {"Reference": type_key[1] if type_key else mark, "LoadBearing": True, "IsExternal": False}))
        props.append(self._pset("Shanku_Structural", {"Mark": mark, "ConcreteGrade": grade}))
        if qto:
            props.append(self._qto(qto[0], qto[1]))
        for p in props:
            f.createIfcRelDefinesByProperties(self.guid(), None, None, None, [el], p)
        return el

    def _pset(self, name, values):
        f = self.f
        props = []
        for k, v in values.items():
            val = f.createIfcBoolean(v) if isinstance(v, bool) else f.createIfcLabel(str(v))
            props.append(f.createIfcPropertySingleValue(k, None, val, None))
        return f.createIfcPropertySet(self.guid(), None, name, None, props)

    def _qto(self, name, values):
        f = self.f
        qs = []
        for k, v in values.items():
            if k.endswith("Volume"):
                qs.append(f.createIfcQuantityVolume(k, None, None, round(v, 6), None))
            elif k.endswith("Area"):
                qs.append(f.createIfcQuantityArea(k, None, None, round(v, 6), None))
            else:  # lengths in project units (mm)
                qs.append(f.createIfcQuantityLength(k, None, None, round(v * MM, 3), None))
        return f.createIfcElementQuantity(self.guid(), None, name, None, None, qs)

    # ------------------------------------------------------------ common members

    def column_rect(self, storey, x, y, z0, h, w, d, grade):
        t = self.type_of("IfcColumnType", f"C-{int(w * MM)}x{int(d * MM)}", "COLUMN")
        shape = self.shape(("col", w, d, h), lambda: self.rect(w, d), h)
        return self.element("IfcColumn", "C", storey, self.place(x, y, z0), shape, grade, t,
                            ("Qto_ColumnBaseQuantities", {"Length": h, "CrossSectionArea": w * d, "NetVolume": w * d * h}), "COLUMN")

    def column_round(self, storey, x, y, z0, h, dia, grade, prefix="RC"):
        t = self.type_of("IfcColumnType", f"C-{int(dia * MM)} dia", "COLUMN")
        shape = self.shape(("rcol", dia, h), lambda: self.circle(dia / 2), h)
        a = math.pi * dia * dia / 4
        return self.element("IfcColumn", prefix, storey, self.place(x, y, z0), shape, grade, t,
                            ("Qto_ColumnBaseQuantities", {"Length": h, "CrossSectionArea": a, "NetVolume": a * h}), "COLUMN")

    def beam(self, storey, p0, p1, top, w, d, grade, prefix="B"):
        """A beam between plan points p0 -> p1 (m), its top at `top`."""
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        length = math.hypot(dx, dy)
        ux, uy = dx / length, dy / length
        t = self.type_of("IfcBeamType", f"B-{int(w * MM)}x{int(d * MM)}", "BEAM")
        shape = self.shape(("beam", w, d, round(length, 4)), lambda: self.rect(w, d, 0.0, -d / 2), length)
        return self.element("IfcBeam", prefix, storey, self.place(p0[0], p0[1], top, (ux, uy, 0.0), (-uy, ux, 0.0)), shape, grade, t,
                            ("Qto_BeamBaseQuantities", {"Length": length, "CrossSectionArea": w * d, "NetVolume": w * d * length}), "BEAM")

    def slab(self, storey, outline, holes, z_bottom, thickness, grade, prefix="S", name=None, type_name="S-150"):
        t = self.type_of("IfcSlabType", type_name, "FLOOR")
        key = ("slab", tuple(outline), tuple(tuple(h) for h in holes), thickness)
        shape = self.shape(key, lambda: self.polygon(outline, holes), thickness)
        area = _area(outline) - sum(_area(h) for h in holes)
        return self.element("IfcSlab", prefix, storey, self.place(0, 0, z_bottom), shape, grade, t,
                            ("Qto_SlabBaseQuantities", {"Depth": thickness, "NetArea": area, "NetVolume": area * thickness}), "FLOOR", name)

    def wall(self, storey, p0, p1, z0, h, thick, grade, prefix="W", type_name=None):
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        length = math.hypot(dx, dy)
        ux, uy = dx / length, dy / length
        t = self.type_of("IfcWallType", type_name or f"W-{int(thick * MM)} RCC", "SHEAR" if thick >= 0.2 else "PARAPET")
        shape = self.shape(("wall", round(length, 4), thick, h), lambda: self.rect(length, thick, length / 2, 0.0), h)
        return self.element("IfcWall", prefix, storey, self.place(p0[0], p0[1], z0, (0.0, 0.0, 1.0), (ux, uy, 0.0)), shape, grade, t,
                            ("Qto_WallBaseQuantities", {"Length": length, "Height": h, "Width": thick, "NetSideArea": length * h, "NetVolume": length * h * thick}),
                            "SHEAR" if thick >= 0.2 else "PARAPET")

    def footing(self, storey, x, y, top, w, d, depth, grade, prefix="F", predefined="PAD_FOOTING"):
        t = self.type_of("IfcFootingType", f"F-{int(w * MM)}x{int(d * MM)}x{int(depth * MM)}", predefined)
        shape = self.shape(("ftg", w, d, depth), lambda: self.rect(w, d), depth)
        return self.element("IfcFooting", prefix, storey, self.place(x, y, top - depth), shape, grade, t,
                            ("Qto_FootingBaseQuantities", {"Length": w, "Width": d, "Height": depth, "NetVolume": w * d * depth}), predefined)

    def pile(self, storey, x, y, top, dia, length, grade):
        t = self.type_of("IfcPileType", f"P-{int(dia * MM)} dia x {length:g} m", "BORED")
        shape = self.shape(("pile", dia, length), lambda: self.circle(dia / 2), length)
        a = math.pi * dia * dia / 4
        return self.element("IfcPile", "P", storey, self.place(x, y, top - length), shape, grade, t,
                            ("Qto_PileBaseQuantities", {"Length": length, "CrossSectionArea": a, "NetVolume": a * length}), "BORED")

    def sloped(self, cls, prefix, storey, x, y, z, length, width, rise, thickness, grade, along=(1.0, 0.0), name=None, type_name="Ramp", predefined=None):
        """A sloped plate (ramp or stair flight) starting at (x, y, z) running `length` in plan along `along`, rising `rise`."""
        a = math.atan2(rise, length)
        ux, uy = along
        run = math.hypot(length, rise)
        zdir = (-math.sin(a) * ux, -math.sin(a) * uy, math.cos(a))
        xdir = (math.cos(a) * ux, math.cos(a) * uy, math.sin(a))
        shape = self.shape(("sloped", cls, round(run, 4), width, thickness), lambda: self.rect(run, width, run / 2, 0.0), thickness)
        vol = run * width * thickness
        if cls == "IfcStair":
            t = self.type_of("IfcStairType", type_name, "STRAIGHT_RUN_STAIR")
            qto = ("Qto_StairBaseQuantities", {"Length": run, "NetVolume": vol})
        else:
            t = self.type_of("IfcSlabType", type_name, "USERDEFINED")
            qto = ("Qto_SlabBaseQuantities", {"Depth": thickness, "NetArea": run * width, "NetVolume": vol})
        return self.element(cls, prefix, storey, self.place(x, y, z, zdir, xdir), shape, grade, t, qto, predefined, name)

    # ------------------------------------------------------------ finish

    def write(self, path, gz=False):
        f = self.f
        f.createIfcRelAggregates(self.guid(), None, None, None, self.building, self.storeys)
        for s, els in self.contained.items():
            if els:
                f.createIfcRelContainedInSpatialStructure(self.guid(), None, None, None, els, s)
        for key, els in self.typed.items():
            if els:
                f.createIfcRelDefinesByType(self.guid(), None, None, None, els, self.types[key])
        if gz:
            data = f.to_string().encode("utf-8")
            with gzip.open(path, "wb", compresslevel=9) as out:
                out.write(data)
        else:
            f.write(path)
        return sum(len(v) for v in self.contained.values())


def _area(pts):
    return abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2


def cum(spans):
    out = [0.0]
    for s in spans:
        out.append(round(out[-1] + s, 4))
    return out


def rect_pts(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


# ============================================================ G+14 tower

def tower(m=None, x_off=0.0, y_off=0.0, floors=15, storey_names=None, base_storeys=None, z0=0.0, first_h=4.0, h=3.0,
          xs_spans=(6.0, 6.0, 4.5, 6.0, 6.0), ys_spans=(5.5, 5.0, 5.5), core_bay=(2, 1), label="Tower", foundations=True, canopy=True):
    """A residential RCC tower. Returns the model and the list of level heights."""
    m = m or Model("Shanku sample: G+14 residential tower", "Tower A")
    xs = [x + x_off for x in cum(xs_spans)]
    ys = [y + y_off for y in cum(ys_spans)]
    cx0, cx1 = xs[core_bay[0]], xs[core_bay[0] + 1]
    cy0, cy1 = ys[core_bay[1]], ys[core_bay[1] + 1]
    core_corners = {(cx0, cy0), (cx1, cy0), (cx0, cy1), (cx1, cy1)}
    edge = 0.2
    outline = rect_pts(xs[0] - edge, ys[0] - edge, xs[-1] + edge, ys[-1] + edge)
    core_hole = rect_pts(cx0 + 0.125, cy0 + 0.125, cx1 - 0.125, cy1 - 0.125)

    # Levels: ground + upper floors + terrace
    levels = []
    z = z0
    for i in range(floors + 1):
        levels.append(z)
        z += first_h if i == 0 else h
    names = storey_names or (["Ground"] + [f"Level {i}" for i in range(1, floors)] + ["Terrace"])
    storeys = base_storeys or {}
    for i, zl in enumerate(levels):
        if names[i] not in storeys:
            storeys[names[i]] = m.storey(names[i], zl)
    st = [storeys[n] for n in names]

    if foundations:
        fnd = m.storey("Foundation", z0 - 1.8)
        for x in xs:
            for y in ys:
                if (x, y) in core_corners:
                    continue
                m.footing(fnd, x, y, z0 - 0.9, 2.6, 2.6, 0.9, "M30")
        # Raft under the core on bored piles
        rx0, ry0, rx1, ry1 = cx0 - 1.0, cy0 - 1.0, cx1 + 1.0, cy1 + 1.0
        m.footing(fnd, (rx0 + rx1) / 2, (ry0 + ry1) / 2, z0 - 0.9, rx1 - rx0, ry1 - ry0, 1.2, "M35", prefix="RF", predefined="FOOTING_BEAM")
        for i in range(3):
            for j in range(3):
                px = rx0 + 0.9 + i * ((rx1 - rx0) - 1.8) / 2
                py = ry0 + 0.9 + j * ((ry1 - ry0) - 1.8) / 2
                m.pile(fnd, px, py, z0 - 2.1, 0.6, 12.0, "M30")

    for i in range(floors):
        s = st[i]
        base, top = levels[i], levels[i + 1]
        col_top = top - 0.15
        size, grade = (0.75, "M40") if i < 5 else (0.6, "M35") if i < 10 else (0.45, "M30")
        c_base = z0 - 0.9 if (i == 0 and foundations) else base
        for x in xs:
            for y in ys:
                if (x, y) in core_corners:
                    continue
                m.column_rect(s, x, y, c_base, col_top - c_base, size, size, grade)
        # Shear-wall core (lift + stair), a door gap on the south wall
        wall_h = top - base - 0.15 if i > 0 or not foundations else top - (z0 - 0.9) - 0.15
        wz = base if i > 0 or not foundations else z0 - 0.9
        t = 0.25
        m.wall(s, (cx0, cy1), (cx1, cy1), wz, wall_h, t, grade)
        m.wall(s, (cx0, cy0), (cx0, cy1), wz, wall_h, t, grade)
        m.wall(s, (cx1, cy0), (cx1, cy1), wz, wall_h, t, grade)
        mid = (cx0 + cx1) / 2
        m.wall(s, (cx0, cy0), (mid - 0.6, cy0), wz, wall_h, t, grade)
        m.wall(s, (mid + 0.6, cy0), (cx1, cy0), wz, wall_h, t, grade)
        m.wall(s, (mid, cy0 + 0.125), (mid, cy1 - 0.125), wz, wall_h, 0.2, grade, type_name="W-200 RCC")  # lift / stair divider
        # Stair: two flights with a mid landing, in the east half of the core
        sx0 = mid + 0.35
        half = (top - base) / 2
        m.sloped("IfcStair", "ST", s, sx0, cy0 + 0.4, base, (cx1 - 0.35) - sx0 - 1.2, 1.1, half, 0.175, "M30", along=(1.0, 0.0), type_name="Stair 1100 wide", predefined="STRAIGHT_RUN_STAIR")
        m.sloped("IfcStair", "ST", s, cx1 - 0.35 - 1.2, cy1 - 0.4, base + half, (cx1 - 0.35 - 1.2) - sx0, 1.1, half, 0.175, "M30", along=(-1.0, 0.0), type_name="Stair 1100 wide", predefined="STRAIGHT_RUN_STAIR")
        # Beams: primary on every grid line, secondary at mid-bay across the long spans
        for y in ys:
            for a, b in zip(xs[:-1], xs[1:]):
                m.beam(s, (a, y), (b, y), top, 0.3, 0.6, "M30")
        for x in xs:
            for a, b in zip(ys[:-1], ys[1:]):
                m.beam(s, (x, a), (x, b), top, 0.3, 0.6, "M30")
        for a, b in zip(xs[:-1], xs[1:]):
            if a == cx0:
                continue
            xm = (a + b) / 2
            for c, d in zip(ys[:-1], ys[1:]):
                m.beam(s, (xm, c), (xm, d), top, 0.23, 0.45, "M30", prefix="SB")
        # Floor slab with the core open
        m.slab(s, outline, [core_hole], top - 0.15, 0.15, "M30", type_name="S-150")

    # Terrace: parapets and a water tank over the core
    ts = st[floors]
    tz = levels[floors]
    x0, y0, x1, y1 = xs[0] - edge, ys[0] - edge, xs[-1] + edge, ys[-1] + edge
    for p, q in [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))]:
        m.wall(ts, p, q, tz, 1.0, 0.15, "M25", prefix="PW", type_name="Parapet 150")
    for p, q in [((cx0, cy0), (cx1, cy0)), ((cx1, cy0), (cx1, cy1)), ((cx1, cy1), (cx0, cy1)), ((cx0, cy1), (cx0, cy0))]:
        m.wall(ts, p, q, tz, 2.0, 0.2, "M30", prefix="WT", type_name="Water tank wall 200")
    m.slab(ts, rect_pts(cx0 - 0.1, cy0 - 0.1, cx1 + 0.1, cy1 + 0.1), [], tz + 2.0, 0.15, "M30", prefix="WTS", name="Water tank roof", type_name="S-150")

    if canopy:
        # Entrance canopy on four round columns, and a 1:12 ramp to the entrance
        g = st[0]
        cy = ys[0] - 3.2
        cxs = [xs[1], xs[2], xs[3], xs[4]] if len(xs) > 4 else xs
        for x in cxs:
            if foundations:
                m.footing(storeys.get("Foundation") or g, x, cy, z0 - 0.9, 1.6, 1.6, 0.6, "M30")
            m.column_round(g, x, cy, z0 - 0.9 if foundations else z0, (z0 + 3.6) - (z0 - 0.9 if foundations else z0) - 0.15, 0.6, "M35")
        m.slab(g, rect_pts(cxs[0] - 1.0, cy - 1.2, cxs[-1] + 1.0, ys[0] - edge), [], z0 + 3.45, 0.15, "M30", prefix="CS", name="Entrance canopy", type_name="S-150 canopy")
        m.beam(g, (cxs[0], cy), (cxs[-1], cy), z0 + 3.6, 0.3, 0.6, "M30", prefix="CB")
        m.sloped("IfcSlab", "RMP", g, cxs[0] - 7.2, cy - 0.6, z0 - 0.6, 7.2, 2.4, 0.6, 0.2, "M30", along=(1.0, 0.0), name="Entrance ramp 1:12", type_name="Ramp 200", predefined="USERDEFINED")
    return m, levels


# ============================================================ twin towers on a podium

def twin():
    m = Model("Shanku sample: G+24 twin towers on a G+3 podium", "Twin Towers")
    span = 8.0
    xs = cum([span] * 8)
    ys = cum([span] * 5)
    pod_h = 4.5
    pod_levels = [0.0, 4.5, 9.0, 13.5, 18.0]
    names = ["Ground", "Podium 1", "Podium 2", "Podium 3", "Podium roof"]
    storeys = {n: m.storey(n, z) for n, z in zip(names, pod_levels)}
    fnd = m.storey("Foundation", -2.0)
    atrium = {(xs[3], ys[2]), (xs[4], ys[2]), (xs[3], ys[3]), (xs[4], ys[3])}
    ramp_bays = [(xs[0], ys[0], xs[1], ys[1]), (xs[7], ys[4], xs[8], ys[5])]
    for x in xs:
        for y in ys:
            m.footing(fnd, x, y, -1.0, 3.2, 3.2, 1.0, "M30")
    edge = 0.3
    outline = rect_pts(xs[0] - edge, ys[0] - edge, xs[-1] + edge, ys[-1] + edge)
    atrium_hole = rect_pts(xs[3] + 0.2, ys[2] + 0.2, xs[4] - 0.2, ys[3] - 0.2)
    for i in range(4):
        s = storeys[names[i]]
        base, top = pod_levels[i], pod_levels[i + 1]
        c_base = -1.0 if i == 0 else base
        for x in xs:
            for y in ys:
                if (x, y) in atrium:
                    m.column_round(s, x, y, c_base, top - 0.2 - c_base, 0.7, "M40")
                else:
                    m.column_rect(s, x, y, c_base, top - 0.2 - c_base, 0.8, 0.8, "M40")
        big = i == 3  # transfer level at the podium roof
        for y in ys:
            for a, b in zip(xs[:-1], xs[1:]):
                m.beam(s, (a, y), (b, y), top, 0.6 if big else 0.4, 1.5 if big else 0.75, "M40" if big else "M35", prefix="TB" if big else "B")
        for x in xs:
            for a, b in zip(ys[:-1], ys[1:]):
                m.beam(s, (x, a), (x, b), top, 0.6 if big else 0.4, 1.5 if big else 0.75, "M40" if big else "M35", prefix="TB" if big else "B")
        for a, b in zip(xs[:-1], xs[1:]):
            for c, d in zip(ys[:-1], ys[1:]):
                m.beam(s, ((a + b) / 2, c), ((a + b) / 2, d), top, 0.3, 0.6, "M35", prefix="SB")
        holes = [atrium_hole] if i < 3 else []
        holes += [rect_pts(r[0] + 0.3, r[1] + 0.3, r[2] - 0.3, r[3] - 0.3) for r in ramp_bays] if i < 3 else []
        m.slab(s, outline, holes, top - 0.2, 0.2, "M35", type_name="S-200 podium")
        # Parking ramps 1:10 in the corner bays, each floor to the next
        for k, r in enumerate(ramp_bays):
            run = (r[2] - r[0]) - 0.6
            rise = top - base
            if i < 3:
                m.sloped("IfcSlab", "RMP", s, r[0] + 0.3 if k == 0 else r[2] - 0.3, (r[1] + r[3]) / 2 - 1.8, base, run, 3.6, rise, 0.25, "M35",
                         along=(1.0, 0.0) if k == 0 else (-1.0, 0.0), name=f"Parking ramp {k + 1}", type_name="Ramp 250 (1:{:.0f})".format(run / rise), predefined="USERDEFINED")
    # Two towers on the podium roof
    tower_names = ["Podium roof"] + [f"Level {i}" for i in range(5, 29)] + ["Terrace"]
    for label, ox in [("Tower 1", 2.0), ("Tower 2", 34.0)]:
        tower(m, x_off=ox, y_off=6.0, floors=25, storey_names=tower_names, base_storeys=storeys, z0=18.0, first_h=3.2, h=3.2,
              xs_spans=(6.0, 6.0, 4.5, 6.0, 6.0) if label == "Tower 1" else (6.0, 6.0, 4.5, 6.0, 6.0), ys_spans=(6.0, 5.0, 6.0), core_bay=(2, 1),
              label=label, foundations=False, canopy=False)
    return m


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in ("tower", "twin"):
        sys.exit(__doc__)
    kind, out = sys.argv[1], sys.argv[2]
    gz = "--gzip" in sys.argv or out.endswith(".gz")
    t0 = time.time()
    model = tower()[0] if kind == "tower" else twin()
    n = model.write(out, gz)
    print(f"{out}: {n} elements in {time.time() - t0:.1f}s")
