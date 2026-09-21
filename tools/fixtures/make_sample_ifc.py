#!/usr/bin/env python3
"""Generate synthetic RCC frame IFC4 files for Shanku development and performance tests.

Usage:
    python tools/fixtures/make_sample_ifc.py small  apps/web/public/samples/sample-frame.ifc
    python tools/fixtures/make_sample_ifc.py large  /tmp/large-frame.ifc   # ~50k elements, not committed

Requires IfcOpenShell (pip install ifcopenshell). Dev-only tool: nothing here ships in the app.
Version 1.1.0 — large mode builds in seconds with shared representations.
Version 1.0.1 — lengths in quantity sets are written in project units (mm).
"""
import sys
import time
import numpy as np
import ifcopenshell
import ifcopenshell.api as api
import ifcopenshell.guid

__version__ = "1.1.0"


def translation(x_m, y_m, z_m, z_axis=(0, 0, 1), x_axis=(1, 0, 0)):
    """4x4 placement matrix in metres with the given local Z and X axes."""
    z = np.array(z_axis, float)
    x = np.array(x_axis, float)
    y = np.cross(z, x)
    m = np.eye(4)
    m[:3, 0], m[:3, 1], m[:3, 2], m[:3, 3] = x, y, z, (x_m, y_m, z_m)
    return m


def build(bays_x, bays_y, span_x, span_y, storeys, storey_h, name):
    f = api.run("project.create_file", version="IFC4")
    project = api.run("root.create_entity", f, ifc_class="IfcProject", name=name)
    api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "MILLIMETERS"})
    model = api.run("context.add_context", f, context_type="Model")
    body = api.run("context.add_context", f, context_type="Model", context_identifier="Body",
                   target_view="MODEL_VIEW", parent=model)
    site = api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
    building = api.run("root.create_entity", f, ifc_class="IfcBuilding", name="Tower A")
    api.run("aggregate.assign_object", f, relating_object=project, products=[site])
    api.run("aggregate.assign_object", f, relating_object=site, products=[building])

    col = api.run("root.create_entity", f, ifc_class="IfcColumnType", name="C-400x400")
    beam_t = api.run("root.create_entity", f, ifc_class="IfcBeamType", name="B-300x500")
    slab_t = api.run("root.create_entity", f, ifc_class="IfcSlabType", name="S-150")
    ftg_t = api.run("root.create_entity", f, ifc_class="IfcFootingType", name="F-1800x1800x600")
    col_prof = f.createIfcRectangleProfileDef("AREA", "400x400", None, 400.0, 400.0)
    beam_prof = f.createIfcRectangleProfileDef("AREA", "300x500", None, 300.0, 500.0)
    ftg_prof = f.createIfcRectangleProfileDef("AREA", "1800x1800", None, 1800.0, 1800.0)
    slab_prof = f.createIfcRectangleProfileDef(
        "AREA", "slab", None, bays_x * span_x * 1000 + 400.0, bays_y * span_y * 1000 + 400.0)

    counters = {"C": 0, "B": 0, "S": 0, "F": 0}

    def element(ifc_class, type_obj, storey, rep, matrix, mark, grade, qto):
        counters[mark[0]] += 1
        el = api.run("root.create_entity", f, ifc_class=ifc_class, name=f"{mark[0]}{counters[mark[0]]}")
        api.run("type.assign_type", f, related_objects=[el], relating_type=type_obj)
        api.run("spatial.assign_container", f, relating_structure=storey, products=[el])
        api.run("geometry.assign_representation", f, product=el, representation=rep)
        api.run("geometry.edit_object_placement", f, product=el, matrix=matrix)
        common = {"IfcColumn": "Pset_ColumnCommon", "IfcBeam": "Pset_BeamCommon",
                  "IfcSlab": "Pset_SlabCommon", "IfcFooting": "Pset_FootingCommon"}[ifc_class]
        ps = api.run("pset.add_pset", f, product=el, name=common)
        api.run("pset.edit_pset", f, pset=ps, properties={"Reference": type_obj.Name, "LoadBearing": True, "IsExternal": False})
        ps2 = api.run("pset.add_pset", f, product=el, name="Shanku_Structural")
        api.run("pset.edit_pset", f, pset=ps2, properties={"Mark": f"{mark[0]}{counters[mark[0]]}", "ConcreteGrade": grade})
        q = api.run("pset.add_qto", f, product=el, name=qto[0])
        api.run("pset.edit_qto", f, qto=q, properties=qto[1])
        return el

    xs = [i * span_x for i in range(bays_x + 1)]
    ys = [j * span_y for j in range(bays_y + 1)]
    footing_storey = api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name="Foundation")
    footing_storey.Elevation = -1500.0
    api.run("aggregate.assign_object", f, relating_object=building, products=[footing_storey])
    ftg_rep = api.run("geometry.add_profile_representation", f, context=body, profile=ftg_prof, depth=0.6)
    for x in xs:
        for y in ys:
            element("IfcFooting", ftg_t, footing_storey, ftg_rep, translation(x, y, -1.5), "F", "M25",
                    ("Qto_FootingBaseQuantities", {"NetVolume": 1.8 * 1.8 * 0.6}))

    col_h = storey_h - 0.15
    col_rep = None
    for s in range(storeys):
        z = s * storey_h
        storey = api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name=f"Level {s + 1}")
        storey.Elevation = z * 1000
        api.run("aggregate.assign_object", f, relating_object=building, products=[storey])
        if col_rep is None:
            col_rep = api.run("geometry.add_profile_representation", f, context=body, profile=col_prof, depth=col_h)
        grade = "M40" if s < storeys // 2 else "M30"
        for x in xs:
            for y in ys:
                element("IfcColumn", col, storey, col_rep, translation(x, y, z), "C", grade,
                        ("Qto_ColumnBaseQuantities", {"Length": col_h * 1000, "NetVolume": 0.16 * col_h}))
        top = z + storey_h - 0.15
        for y in ys:
            for i in range(bays_x):
                length = span_x - 0.4
                rep = api.run("geometry.add_profile_representation", f, context=body, profile=beam_prof,
                              depth=length, cardinal_point="top centre")
                element("IfcBeam", beam_t, storey, rep, translation(xs[i] + 0.2, y, top, (1, 0, 0), (0, 1, 0)),
                        "B", "M30", ("Qto_BeamBaseQuantities", {"Length": length * 1000, "NetVolume": 0.15 * length}))
        for x in xs:
            for j in range(bays_y):
                length = span_y - 0.4
                rep = api.run("geometry.add_profile_representation", f, context=body, profile=beam_prof,
                              depth=length, cardinal_point="top centre")
                element("IfcBeam", beam_t, storey, rep, translation(x, ys[j] + 0.2, top, (0, 1, 0), (-1, 0, 0)),
                        "B", "M30", ("Qto_BeamBaseQuantities", {"Length": length * 1000, "NetVolume": 0.15 * length}))
        slab_rep = api.run("geometry.add_profile_representation", f, context=body, profile=slab_prof,
                           depth=0.15, cardinal_point="bottom right")
        element("IfcSlab", slab_t, storey, slab_rep,
                translation(-0.2, -0.2, z + storey_h - 0.15), "S", "M30",
                ("Qto_SlabBaseQuantities", {"Depth": 150.0}))
    return f, counters


def build_fast(bays_x, bays_y, span_x, span_y, storeys, storey_h, name):
    """Large performance model built with low-level entities and shared representations.

    Seconds instead of minutes: no property sets, one shared representation per
    element shape (as mapped geometry in real exports). Geometry matches build().
    """
    f = api.run("project.create_file", version="IFC4")
    project = api.run("root.create_entity", f, ifc_class="IfcProject", name=name)
    api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "MILLIMETERS"})
    model = api.run("context.add_context", f, context_type="Model")
    body = api.run("context.add_context", f, context_type="Model", context_identifier="Body",
                   target_view="MODEL_VIEW", parent=model)
    site = api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
    building = api.run("root.create_entity", f, ifc_class="IfcBuilding", name="Tower P")
    api.run("aggregate.assign_object", f, relating_object=project, products=[site])
    api.run("aggregate.assign_object", f, relating_object=site, products=[building])

    col_rep = api.run("geometry.add_profile_representation", f, context=body,
                      profile=f.createIfcRectangleProfileDef("AREA", "400x400", None, 400.0, 400.0), depth=storey_h - 0.15)
    beam_prof = f.createIfcRectangleProfileDef("AREA", "300x500", None, 300.0, 500.0)
    bx_rep = api.run("geometry.add_profile_representation", f, context=body, profile=beam_prof,
                     depth=span_x - 0.4, cardinal_point="top centre")
    by_rep = api.run("geometry.add_profile_representation", f, context=body, profile=beam_prof,
                     depth=span_y - 0.4, cardinal_point="top centre")
    slab_rep = api.run("geometry.add_profile_representation", f, context=body,
                       profile=f.createIfcRectangleProfileDef("AREA", "slab", None, bays_x * span_x * 1000 + 400.0,
                                                              bays_y * span_y * 1000 + 400.0),
                       depth=0.15, cardinal_point="bottom right")
    shape = {}

    def product_shape(rep):
        if rep not in shape:
            shape[rep] = f.createIfcProductDefinitionShape(None, None, [rep])
        return shape[rep]

    def placement(x, y, z, zdir=(0.0, 0.0, 1.0), xdir=(1.0, 0.0, 0.0)):
        return f.createIfcLocalPlacement(None, f.createIfcAxis2Placement3D(
            f.createIfcCartesianPoint((x * 1000, y * 1000, z * 1000)),
            f.createIfcDirection(zdir), f.createIfcDirection(xdir)))

    count = 0
    xs = [i * span_x for i in range(bays_x + 1)]
    ys = [j * span_y for j in range(bays_y + 1)]
    for s in range(storeys):
        z = s * storey_h
        storey = api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name=f"Level {s + 1}")
        storey.Elevation = z * 1000
        api.run("aggregate.assign_object", f, relating_object=building, products=[storey])
        members = []
        top = z + storey_h - 0.15
        for x in xs:
            for y in ys:
                count += 1
                members.append(f.createIfcColumn(ifcopenshell.guid.new(), None, f"C{count}", None, None,
                                                 placement(x, y, z), product_shape(col_rep), None, None))
        for y in ys:
            for i in range(bays_x):
                count += 1
                members.append(f.createIfcBeam(ifcopenshell.guid.new(), None, f"B{count}", None, None,
                                               placement(xs[i] + 0.2, y, top, (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
                                               product_shape(bx_rep), None, None))
        for x in xs:
            for j in range(bays_y):
                count += 1
                members.append(f.createIfcBeam(ifcopenshell.guid.new(), None, f"B{count}", None, None,
                                               placement(x, ys[j] + 0.2, top, (0.0, 1.0, 0.0), (-1.0, 0.0, 0.0)),
                                               product_shape(by_rep), None, None))
        count += 1
        members.append(f.createIfcSlab(ifcopenshell.guid.new(), None, f"S{count}", None, None,
                                       placement(-0.2, -0.2, top), product_shape(slab_rep), None, None))
        f.createIfcRelContainedInSpatialStructure(ifcopenshell.guid.new(), None, None, None, members, storey)
    return f, {"elements": count}


if __name__ == "__main__":
    size, out = sys.argv[1], sys.argv[2]
    t = time.time()
    if size == "small":
        f, c = build(3, 2, 6.0, 5.0, 2, 3.2, "Sample RCC frame")
    elif size == "large":
        f, c = build_fast(20, 20, 6.0, 6.0, 40, 3.2, "Performance RCC frame")
    else:
        sys.exit("size must be small or large")
    f.write(out)
    total = sum(c.values())
    print(f"{out}: {total} elements {c} in {time.time() - t:.1f}s")
