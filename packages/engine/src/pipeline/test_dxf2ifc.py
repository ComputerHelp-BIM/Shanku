"""Tests for the DXF -> 3D pipeline on a small synthetic drawing in the CH format.
Run: pip install ezdxf==1.4.4 pillow pytest && pytest packages/engine/src/pipeline"""
import re

import ezdxf
import pytest

import dxf2ifc as P


def rect(msp, layer, x, y, w, h):
    msp.add_lwpolyline([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], close=True, dxfattribs={"layer": layer})


def label(msp, layer, text, x, y):
    msp.add_text(text, height=25, dxfattribs={"layer": layer}).set_placement((x, y))


@pytest.fixture()
def drawing(tmp_path):
    doc = ezdxf.new("R2018")
    doc.header["$INSUNITS"] = 4
    msp = doc.modelspace()
    # frame A: foundation (level 1), origin at (0,0)
    rect(msp, "Part-1", -500, -500, 10000, 10000)
    msp.add_circle((0, 0), 200, dxfattribs={"layer": "CH-Origin"})
    label(msp, "CH-Level", "1", -400, 9000)
    rect(msp, "CH-PCC", 1000, 1000, 1730, 2000); label(msp, "CHT-PCC", "-2000,150,PC-1", 1100, 1100)
    rect(msp, "CH-Footing", 1150, 1150, 1430, 1700); label(msp, "CHT-Footing", "-1500,500,FT-1", 1300, 1300)
    rect(msp, "CH-Pedestal", 1650, 1650, 430, 700); label(msp, "CHT-Pedestal", "0,1500,PD-1", 1700, 1700)
    # frame B: levels 2-3, height 3000, origin at (20000,0)
    rect(msp, "Part-1", 19500, -500, 10000, 10000)
    msp.add_circle((20000, 0), 200, dxfattribs={"layer": "CH-Origin"})
    label(msp, "CH-Level", "2-3", 19600, 9000)
    label(msp, "CH-Height", "3000", 19600, 9200)
    rect(msp, "CH-Column", 21750, 1750, 230, 500); label(msp, "CHT-Column", "T0,3000,C-1", 21760, 1800)
    rect(msp, "CH-Beam", 21980, 1750, 4000, 230); label(msp, "CHT-Beam", "T0,600,B-1", 23000, 1800)
    rect(msp, "CH-Wall-RCC", 21980, 1750, 4000, 230); label(msp, "CHT-Wall-RCC", "600,2400,W-1", 22500, 1800)
    rect(msp, "CH-Window", 23500, 1750, 1000, 230); label(msp, "CHT-Window", "2,1000,1400,WN-1", 23800, 1800)
    rect(msp, "CH-Slab", 21980, 1980, 4000, 3000); label(msp, "CHT-Slab", "T0,125,S-1", 23000, 3000)
    msp.add_line((22000, 6000), (24000, 6000), dxfattribs={"layer": "CH-Beam"})  # stray line: ignored
    rect(msp, "CH-Column", 25000, 7000, 230, 500); rect(msp, "CH-Column", 25000, 7000, 230, 500)  # duplicate
    label(msp, "CHT-Column", "T0,3000,C-8", 25010, 7100); label(msp, "CHT-Column", "T0,3000,C-9", 25010, 7100)
    path = tmp_path / "t.dxf"
    doc.saveas(path)
    return str(path)


def test_levels_stack_from_zero_and_foundation_sits_below(drawing):
    r = P.analyze(drawing)
    lv = {l["number"]: l for l in r["levels"]}
    assert (lv[2]["elevation"], lv[3]["elevation"]) == (0, 3000)
    assert lv[1]["foundation"] and lv[1]["elevation"] == -2150  # lowest foundation bottom


def test_label_grammar(drawing):
    r = P.analyze(drawing)
    by = {(e["mark"], e["level"]): e for e in r["elements"]}
    assert (by[("PC-1", 1)]["z0"], by[("PC-1", 1)]["z1"]) == (-2150, -2000)
    assert (by[("FT-1", 1)]["z0"], by[("PD-1", 1)]["z1"]) == (-2000, 0)
    assert (by[("C-1", 3)]["z0"], by[("C-1", 3)]["z1"]) == (3000, 6000)  # plan repeated on level 3
    assert (by[("B-1", 2)]["z0"], by[("B-1", 2)]["z1"]) == (2400, 3000)
    assert (by[("W-1", 2)]["z0"], by[("W-1", 2)]["z1"]) == (0, 2400)   # floor to beam soffit
    w = by[("WN-1", 2)]
    assert (w["z0"], w["z1"], w["panels"]) == (1000, 2400, 2)
    assert w["host"]["mark"] == "W-1"


def test_qa(drawing):
    r = P.analyze(drawing)
    codes = [q["code"] for q in r["qa"]]
    assert "duplicate" in codes and "C-8" in next(q["message"] for q in r["qa"] if q["code"] == "duplicate")
    assert "ignored" in codes
    assert "orphan-label" not in codes  # labels of the duplicate are reported with it, not twice
    assert not any(e["mark"] in ("C-8", "C-9") for e in r["elements"])


def test_ifc_is_valid_step_with_openings_and_stable_ids(drawing):
    r = P.analyze(drawing)
    ifc, rep = P.build_ifc(r, "T", "t.dxf")
    assert ifc.startswith("ISO-10303-21;") and "FILE_SCHEMA(('IFC4'))" in ifc
    assert rep["openings"] == 2 and ifc.count("IFCRELVOIDSELEMENT") == 2 and ifc.count("IFCWINDOW(") == 2
    ids = re.findall(r"#(\d+)=", ifc)
    assert [int(i) for i in ids] == list(range(1, len(ids) + 1))
    refs = {int(x) for x in re.findall(r"#(\d+)", ifc.split("DATA;")[1])}
    assert max(refs) <= len(ids)  # no dangling references
    ifc2, _ = P.build_ifc(P.analyze(drawing), "T", "t.dxf")
    g1 = re.findall(r"IFCCOLUMN\('([^']+)'", ifc)
    assert g1 and g1 == re.findall(r"IFCCOLUMN\('([^']+)'", ifc2)  # same drawing -> same GlobalIds
    assert all(len(g) == 22 for g in g1)


def test_wall_net_volume_deducts_the_window(drawing):
    r = P.analyze(drawing)
    ifc, _ = P.build_ifc(r, "T", "t.dxf")
    vols = [float(v) for v in re.findall(r"IFCQUANTITYVOLUME\('NetVolume',\$,\$,([0-9.eE-]+),\$\)", ifc)]
    wall_net = 4.0 * 0.23 * 2.4 - 1.0 * 0.23 * 1.4
    assert any(abs(v - wall_net) < 1e-6 for v in vols)
