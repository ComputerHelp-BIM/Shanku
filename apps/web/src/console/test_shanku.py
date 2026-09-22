"""Tests for the console API. Run: pytest apps/web/src/console"""
import json

import shanku

DATA = {
    "elements": [
        {"index": 0, "expressId": 10, "globalId": "G0", "mark": "C1", "category": "Column", "ifcClass": "IfcColumn", "typeName": "C 300x900", "level": "L1", "grade": "M40", "volume": 0.756, "dims": {"width": 0.3, "depth": 0.9, "height": 2.8}},
        {"index": 1, "expressId": 11, "globalId": "G1", "mark": "B1", "category": "Beam", "ifcClass": "IfcBeam", "typeName": "B 230x450", "level": "L1", "grade": "M30", "volume": 0.4, "dims": {"length": 3.9, "width": 0.23, "depth": 0.45}},
        {"index": 2, "expressId": 12, "globalId": "G2", "mark": "", "category": "Beam", "ifcClass": "IfcBeam", "typeName": "B 250x600", "level": "L2", "grade": "M30", "volume": 0.6, "dims": {"length": 4, "width": 0.25, "depth": 0.6}},
    ],
    "levels": [{"name": "L1", "elevation": 0, "count": 2}, {"name": "L2", "elevation": 3, "count": 1}],
    "info": {"fileName": "m.ifc"},
}


def setup_function():
    shanku._load(json.dumps(DATA))


def test_queries():
    assert len(shanku.elements(category="beam")) == 2
    assert shanku.elements(category="Beam", level="L2").volume == 0.6
    assert shanku.get("c1").id == 10 and shanku.get(11).mark == "B1" and shanku.get("nope") is None
    deep = shanku.elements().where(lambda e: e.dims.get("depth", 0) > 0.5)
    assert sorted(deep.ids) == [10, 12]
    assert list(shanku.elements().by("level")) == ["L1", "L2"]
    assert shanku.boq(by=("category",)) == [{"category": "Beam", "count": 2, "volume": 1.0}, {"category": "Column", "count": 1, "volume": 0.756}]


def test_repl_shows_last_expression_as_table_and_collects_actions():
    env = {"shanku": shanku}
    r = json.loads(shanku._run("b = shanku.elements(category='Beam')\nshanku.select(b)\nb", env))
    assert r["error"] is None
    assert r["table"]["total"] == 2 and "mark" in r["table"]["columns"]
    assert r["repr"] == "ElementList(2 elements, 1.000 m³)"
    assert r["actions"] == [{"type": "select", "indices": [1, 2]}]
    r2 = json.loads(shanku._run("print('hi'); 1/0", env))
    assert r2["stdout"] == "hi\n" and "ZeroDivisionError" in r2["error"]
    assert "_run" not in r2["error"]  # the runner's own frame is hidden


def test_selection_round_trip():
    shanku._set_selection("[0, 2]")
    assert shanku.selection().ids == [10, 12]
