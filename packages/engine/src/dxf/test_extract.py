"""Tests for the DXF extractor. Run: pip install ezdxf==1.4.4 pytest && pytest packages/engine/src/dxf"""
import json
from array import array

import ezdxf
import pytest

import extract as X


@pytest.fixture()
def dxf_path(tmp_path):
    doc = ezdxf.new("R2018", setup=True)
    doc.header["$INSUNITS"] = 4
    doc.layers.add("S-COLUMN", color=1)
    doc.layers.add("S-BEAM", color=7)
    hidden = doc.layers.add("S-HIDDEN", color=3)
    hidden.off()
    msp = doc.modelspace()
    msp.add_line((1000, 2000), (5000, 2000), dxfattribs={"layer": "S-BEAM"})
    msp.add_circle((3000, 3000), 200, dxfattribs={"layer": "S-COLUMN"})
    msp.add_line((0, 0), (10, 10), dxfattribs={"layer": "S-HIDDEN"})
    blk = doc.blocks.new("COL")
    blk.add_lwpolyline([(0, 0), (300, 0), (300, 600), (0, 600)], close=True)
    msp.add_blockref("COL", (8000, 1000), dxfattribs={"layer": "S-COLUMN"})
    hatch = msp.add_hatch(color=1, dxfattribs={"layer": "S-COLUMN"})
    hatch.paths.add_polyline_path([(6000, 0), (6300, 0), (6300, 600), (6000, 600)], is_closed=True)
    msp.add_text("C1", height=150, dxfattribs={"layer": "S-COLUMN"}).set_placement((6000, 800))
    msp.add_mtext("450X600\\PM30", dxfattribs={"layer": "S-BEAM", "char_height": 100, "insert": (1000, 2500)})
    path = tmp_path / "t.dxf"
    doc.saveas(path)
    return str(path)


def test_extracts_geometry_text_layers_and_units(dxf_path):
    r = X.extract(dxf_path)
    info = r["info"]
    assert info["units"] == "mm"
    assert info["segments"] > 30  # line + flattened circle + block rectangle + hidden-layer line
    assert info["polygons"] == 1  # the solid hatch
    assert info["texts"] == 2
    names = {l["name"]: l for l in r["layers"]}
    assert names["S-HIDDEN"]["on"] is False and names["S-HIDDEN"]["count"] == 1
    assert names["S-COLUMN"]["on"] is True
    texts = sorted(t[6] for t in r["texts"])
    assert texts == ["450X600\nM30", "C1"]


def test_colour_seven_is_black_and_coordinates_are_rebased(dxf_path):
    r = X.extract(dxf_path)
    assert "#000000" in r["palette"]  # S-BEAM is colour 7
    seg = array("f")
    seg.frombytes(r["seg"])
    assert min(seg) >= -1e-3  # rebased to the drawing's lower-left
    ox, oy = r["info"]["origin"]
    assert (ox, oy) == (0.0, 0.0)


def test_js_packing_round_trips(dxf_path):
    out = X.extract_for_js(dxf_path)
    head = json.loads(out[0])
    seg = array("f"); seg.frombytes(out[1])
    color = array("H"); color.frombytes(out[2])
    assert len(seg) == 4 * len(color) == 4 * head["info"]["segments"]


def test_every_primitive_knows_its_entity_and_props_answer(dxf_path):
    out = X.extract_for_js(dxf_path, "d1")
    head = json.loads(out[0])
    seg_ent = array("I"); seg_ent.frombytes(out[8])
    assert len(seg_ent) == head["info"]["segments"]
    handles = head["handles"]
    assert len(head["types"]) == len(handles) and {"LINE", "CIRCLE", "INSERT", "HATCH", "TEXT", "MTEXT"} <= set(head["types"])
    types = {json.loads(X.entity_props_json("d1", handles[i]))["Type"] for i in set(seg_ent)}
    assert {"Line", "Circle", "Insert"} <= types  # block contents belong to their INSERT
    assert all(t[9] < len(handles) for t in head["texts"])
    line = json.loads(X.entity_props_json("d1", handles[0]))
    assert line["Length"] == 4000 and line["Layer"] == "S-BEAM"
    insert = json.loads(X.entity_props_json("d1", handles[head["types"].index("INSERT")]))
    assert insert["Block"] == "COL"
    X.forget("d1")
    assert json.loads(X.entity_props_json("d1", handles[0])) is None


def test_polyline_quick_properties(tmp_path):
    doc = ezdxf.new("R2018")
    doc.modelspace().add_lwpolyline([(0, 0), (100, 0), (100, 50)], close=True, dxfattribs={"layer": "Part-1", "const_width": 2.5})
    path = tmp_path / "p.dxf"
    doc.saveas(path)
    out = X.extract_for_js(str(path), "p1")
    head = json.loads(out[0])
    props = json.loads(X.entity_props_json("p1", head["handles"][0]))
    assert head["types"] == ["LWPOLYLINE"]
    assert (props["Type"], props["Layer"], props["Closed"], props["Global width"]) == ("Polyline", "Part-1", "Yes", 2.5)
    X.forget("p1")
