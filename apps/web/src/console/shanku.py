"""shanku: the Python API inside the Shanku console (read-only queries + view actions).

    >>> shanku.help()
    >>> beams = shanku.elements(category="Beam", level="04 1ST LEVEL")
    >>> beams.volume                    # m³
    >>> shanku.select(beams.where(lambda e: e.dims["depth"] > 0.5))
    >>> shanku.boq(by=("level", "category"))

Version 1.0.0
"""
import ast
import contextlib
import io
import json
import sys
import traceback

__version__ = "1.0.0"

_ELEMENTS = []   # list[Element]
_LEVELS = []     # list[dict]
_INFO = {}
_SELECTION = []  # element indices
_ACTIONS = []    # view actions for the app, drained after each run


class Element:
    """One model element. Quantities in SI: volume m³, area m², length and dims in m."""

    __slots__ = ("index", "id", "global_id", "mark", "name", "category", "ifc_class", "type", "level",
                 "grade", "volume", "area", "length", "dims", "quantity_source")

    def __init__(self, d):
        self.index = d["index"]
        self.id = d["expressId"]
        self.global_id = d["globalId"]
        self.mark = d.get("mark") or ""
        self.name = d.get("name") or ""
        self.category = d["category"]
        self.ifc_class = d["ifcClass"]
        self.type = d.get("typeName") or ""
        self.level = d.get("level") or ""
        self.grade = d.get("grade") or ""
        self.volume = d.get("volume") or 0.0
        self.area = d.get("area")
        self.length = d.get("length")
        self.dims = d.get("dims") or {}
        self.quantity_source = d.get("quantitySource", "")

    def __repr__(self):
        label = self.mark or self.type or self.name
        return "<{} {} #{} · {} · {:.3f} m³>".format(self.category, label, self.id, self.level or "no level", self.volume)

    def as_dict(self):
        return {"id": self.id, "mark": self.mark, "category": self.category, "level": self.level, "type": self.type,
                "grade": self.grade, "volume": round(self.volume, 3),
                "length": _r(self.dims.get("length")), "width": _r(self.dims.get("width")),
                "depth": _r(self.dims.get("depth")), "height": _r(self.dims.get("height"))}


def _r(v, n=3):
    return None if v is None else round(v, n)


class ElementList(list):
    """A list of elements with totals and filters. Shows as a table in the console."""

    @property
    def volume(self):
        """Total volume, m³."""
        return round(sum(e.volume for e in self), 3)

    @property
    def ids(self):
        return [e.id for e in self]

    def where(self, predicate=None, **match):
        """Filter by a function and/or field values: .where(lambda e: e.volume > 1, level="04 1ST LEVEL")."""
        out = ElementList(e for e in self if _matches(e, match))
        return ElementList(e for e in out if predicate(e)) if predicate else out

    def by(self, field):
        """Group into {value: ElementList}, e.g. .by("level")."""
        groups = {}
        for e in self:
            groups.setdefault(getattr(e, field), ElementList()).append(e)
        return groups

    def __repr__(self):
        return "ElementList({} elements, {:.3f} m³)".format(len(self), self.volume)


def _matches(e, match):
    for key, want in match.items():
        if want is None:
            continue
        have = getattr(e, key)
        wants = want if isinstance(want, (list, tuple, set)) else [want]
        if isinstance(have, str):
            if not any(have.lower() == str(w).lower() for w in wants):
                return False
        elif have not in wants:
            return False
    return True


# ------------------------------------------------------------------ queries

def elements(category=None, level=None, grade=None, mark=None, type=None):
    """All elements, optionally filtered (case-insensitive; each argument may be a list)."""
    return ElementList(_ELEMENTS).where(category=category, level=level, grade=grade, mark=mark, type=type)


def selection():
    """The elements selected in the 3D view."""
    return ElementList(_ELEMENTS[i] for i in _SELECTION if 0 <= i < len(_ELEMENTS))


def get(key):
    """One element by Element ID (int), GlobalId or mark. Returns None when not found."""
    for e in _ELEMENTS:
        if e.id == key or e.global_id == key or (isinstance(key, str) and e.mark and e.mark.lower() == key.lower()):
            return e
    return None


def levels():
    """Levels in elevation order, with element counts."""
    return [dict(l) for l in _LEVELS]


def info():
    """File, schema, units and export rating."""
    return dict(_INFO)


def boq(by=("level", "category", "grade")):
    """Concrete BOQ rows grouped by any of level, category, grade (same numbers as the BOQ window)."""
    by = (by,) if isinstance(by, str) else tuple(by)
    rows = {}
    for e in _ELEMENTS:
        key = tuple(getattr(e, f) or "—" for f in by)
        r = rows.setdefault(key, {**dict(zip(by, key)), "count": 0, "volume": 0.0})
        r["count"] += 1
        r["volume"] += e.volume
    order = {l["name"]: i for i, l in enumerate(_LEVELS)}
    out = sorted(rows.values(), key=lambda r: tuple(order.get(r.get(f), 1e9) if f == "level" else str(r.get(f)) for f in by))
    for r in out:
        r["volume"] = round(r["volume"], 3)
    return out


# ------------------------------------------------------------------ view actions

def _indices(items):
    if items is None:
        return []
    if isinstance(items, Element):
        items = [items]
    return [e.index if isinstance(e, Element) else get(e).index for e in items if isinstance(e, Element) or get(e)]


def select(items):
    """Select these elements in the 3D view."""
    _ACTIONS.append({"type": "select", "indices": _indices(items)})
    return "selected {} elements".format(len(_indices(items)))


def isolate(items):
    """Show only these elements (temporary, like Revit HI; reset() restores)."""
    _ACTIONS.append({"type": "isolate", "indices": _indices(items)})
    return "isolated {} elements".format(len(_indices(items)))


def hide(items):
    """Hide these elements temporarily."""
    _ACTIONS.append({"type": "hide", "indices": _indices(items)})
    return "hid {} elements".format(len(_indices(items)))


def reset():
    """Undo isolate/hide."""
    _ACTIONS.append({"type": "reset"})
    return "view reset"


def fit(items=None):
    """Zoom to these elements, or the whole model."""
    _ACTIONS.append({"type": "fit", "indices": _indices(items) if items is not None else None})
    return "zoomed"


def help():  # noqa: A001 - console convenience, shadows builtin on purpose
    print(__doc__.split("Version")[0].strip())
    print("\nQueries: elements(category, level, grade, mark, type) · selection() · get(id|GlobalId|mark) · levels() · info() · boq(by)")
    print("Actions: select(x) · isolate(x) · hide(x) · reset() · fit(x)")
    print("Element: id, global_id, mark, name, category, ifc_class, type, level, grade, volume, area, length, dims")
    print("ElementList: .volume · .ids · .where(fn, **fields) · .by(field)")


# ------------------------------------------------------------------ console plumbing (called from JS)

def _load(payload):
    global _ELEMENTS, _LEVELS, _INFO, _SELECTION
    data = json.loads(payload)
    _ELEMENTS = [Element(d) for d in data["elements"]]
    _LEVELS = data.get("levels", [])
    _INFO = data.get("info", {})
    _SELECTION = []
    return len(_ELEMENTS)


def _set_selection(payload):
    global _SELECTION
    _SELECTION = json.loads(payload)


def _table(value):
    """Rows and columns when a value reads best as a table, else None."""
    if isinstance(value, Element):
        value = [value]
    if isinstance(value, list) and value and all(isinstance(v, Element) for v in value):
        rows = [v.as_dict() for v in value]
    elif isinstance(value, list) and value and all(isinstance(v, dict) for v in value):
        rows = value
    else:
        return None
    cols = list(rows[0].keys())
    for r in rows[1:]:
        cols += [k for k in r if k not in cols]
    return {"columns": cols, "rows": [[r.get(c) for c in cols] for r in rows[:500]], "total": len(rows)}


def _run(code, env):
    """Runs console input like a REPL: statements execute, a final expression is shown."""
    out, err = io.StringIO(), io.StringIO()
    result = {"stdout": "", "stderr": "", "repr": None, "table": None, "error": None, "actions": []}
    try:
        tree = ast.parse(code, "<console>", "exec")
        last = tree.body.pop() if tree.body and isinstance(tree.body[-1], ast.Expr) else None
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            if tree.body:
                exec(compile(tree, "<console>", "exec"), env)
            if last is not None:
                value = eval(compile(ast.Expression(last.value), "<console>", "eval"), env)
                if value is not None:
                    env["_"] = value
                    result["table"] = _table(value)
                    result["repr"] = None if result["table"] else repr(value)
                    if result["table"] and isinstance(value, ElementList):
                        result["repr"] = repr(value)
    except BaseException:  # show every error in the console, never crash it
        etype, evalue, tb = sys.exc_info()
        # Skip this runner's own frame so the traceback starts at the user's code.
        result["error"] = "".join(traceback.format_exception(etype, evalue, tb.tb_next if tb else None)).rstrip()
    result["stdout"], result["stderr"] = out.getvalue(), err.getvalue()
    result["actions"] = list(_ACTIONS)
    _ACTIONS.clear()
    return json.dumps(result, default=str)
