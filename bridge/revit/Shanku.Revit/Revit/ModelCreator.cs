using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using Shanku.Revit.Core;

namespace Shanku.Revit.Revit;

/// <summary>
/// Export to Revit: builds native elements from Shanku's DXF → 3D exchange. Levels and types first
/// (so one failed element cannot take a type others use with it), then every element in its own
/// sub-transaction, then a check of each placement against the plan (columns and footings are moved or
/// turned 90° when their family places them differently). One transaction group: one Edit → Undo in
/// Revit; a dry run is always rolled back.
/// </summary>
internal sealed class ModelCreator
{
    private readonly Document _doc;
    private readonly ExportConfig _c;
    private readonly XYZ _base; // Project Base Point: the drawing origin
    private readonly List<string> _warnings = new();
    private readonly Dictionary<string, Level> _levels = new(); // drawing level name → Revit level
    private readonly List<LevelPlan> _levelPlans = new();
    private readonly Dictionary<string, ElementId> _types = new(); // type name → type
    private readonly Dictionary<string, string> _typeErrors = new();
    private readonly List<TypePlan> _typePlans = new();

    public ModelCreator(Document doc, ExportConfig config)
    {
        _doc = doc;
        _c = config;
        _base = BasePoint.GetProjectBasePoint(doc)?.Position ?? XYZ.Zero;
    }

    private static double Ft(double mm) => UnitUtils.ConvertToInternalUnits(mm, UnitTypeId.Millimeters);
    private static double Mm(double ft) => UnitUtils.ConvertFromInternalUnits(ft, UnitTypeId.Millimeters);
    /// <summary>Drawing millimetres (from the origin) → Revit internal coordinates.</summary>
    private XYZ At(double[] p, double zInternal) => new(_base.X + Ft(p[0]), _base.Y + Ft(p[1]), zInternal);
    /// <summary>A drawing height (mm, from the base point) as a Revit internal elevation.</summary>
    private double Z(double mm) => _base.Z + Ft(mm);

    public CreateReport Run(ExchangeModel x, bool dryRun, Func<Document, Element, string> globalIdOf)
    {
        int count = x.Elements.Count;
        string undoName = $"Shanku: export {count} element{(count == 1 ? "" : "s")} from the drawing";
        var results = new List<CreateResult>();
        var existing = ExistingIds();
        var todo = new List<ExchangeElement>();
        var skippedExisting = new List<string>();
        foreach (var e in x.Elements)
        {
            if (existing.Contains(e.Id)) skippedExisting.Add(e.Id);
            else if (ExportPlanner.Problem(e) is { } why) results.Add(new CreateResult(e.Id, false, why));
            else todo.Add(e);
        }

        using var group = new TransactionGroup(_doc, undoName);
        group.Start();
        using (var t = new Transaction(_doc, undoName))
        {
            var opts = t.GetFailureHandlingOptions();
            opts.SetFailuresPreprocessor(new Collector(_warnings));
            t.SetFailureHandlingOptions(opts);
            t.Start();
            PrepareLevels(x.Levels);
            foreach (var e in todo) EnsureType(e);
            _doc.Regenerate();
            var levels = x.Levels.OrderBy(l => l.Elevation).ToList();
            foreach (var e in todo) results.Add(CreateOne(e, levels, globalIdOf));
            t.Commit();
        }
        if (dryRun) group.RollBack();
        else group.Assimilate();
        return new CreateReport(dryRun, undoName, _levelPlans, _typePlans, results, skippedExisting, _warnings.Distinct().ToList());
    }

    // ------------------------------------------------------------------ levels

    private void PrepareLevels(IEnumerable<ExchangeLevel> wanted)
    {
        var existing = new FilteredElementCollector(_doc).OfClass(typeof(Level)).Cast<Level>().ToList();
        var plans = ExportPlanner.MatchLevels(wanted, existing.Select(l => (l.Name, Mm(l.ProjectElevation - _base.Z))).ToList(), _c.LevelMatchMm);
        foreach (var (w, plan) in wanted.Zip(plans))
        {
            Level lv;
            if (plan.Action == "create")
            {
                lv = Level.Create(_doc, Z(w.Elevation));
                try { lv.Name = w.Name; } catch (Exception ex) { _warnings.Add($"Level \"{w.Name}\" could not take its name: {ex.Message}"); }
                _doc.Regenerate();
                // Level elevations can be measured from another base than ProjectElevation: correct the difference.
                double off = Z(w.Elevation) - lv.ProjectElevation;
                if (Math.Abs(Mm(off)) > 0.5) lv.Elevation += off;
            }
            else lv = existing.First(l => l.Name == plan.RevitName);
            _levels[w.Name] = lv;
            _levelPlans.Add(plan);
        }
    }

    private Level LevelOf(ExchangeLevel l) => _levels[l.Name];

    // ------------------------------------------------------------------ types

    private void EnsureType(ExchangeElement e)
    {
        var (family, name, group) = ExportPlanner.TypeFor(e, _c);
        if (_types.ContainsKey(name) || _typeErrors.ContainsKey(name)) return;
        try
        {
            ElementId id = group switch
            {
                "floor" => SystemType<FloorType>(name, family, e.Thickness, e.Kind),
                "wall" => SystemType<WallType>(name, family, e.Width, e.Kind),
                _ => FamilyType(e, family, name),
            };
            _types[name] = id;
        }
        catch (Exception ex)
        {
            _typeErrors[name] = ex.Message;
        }
    }

    /// <summary>A loadable family's type by name; else the family's first type duplicated and resized.</summary>
    private ElementId FamilyType(ExchangeElement e, string family, string name)
    {
        var symbols = new FilteredElementCollector(_doc).OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>().Where(s => s.FamilyName == family).ToList();
        if (symbols.Count == 0) throw new InvalidOperationException($"The family \"{family}\" is not loaded in this model. Load it (from the template), or set another family in shanku_export_config.json.");
        var found = symbols.FirstOrDefault(s => s.Name == name);
        string kind = e.Kind;
        if (found == null)
        {
            found = (FamilySymbol)symbols[0].Duplicate(name);
            var sizes = e.Shape == "round"
                ? new[] { (_c.RoundDiameterParam, e.Diameter) }
                : kind is "column" or "pedestal" ? new[] { (_c.ColumnWidthParam, e.Width), (_c.ColumnLengthParam, e.Length) }
                : kind == "beam" ? new[] { (_c.BeamWidthParam, e.Width), (_c.BeamDepthParam, e.Depth) }
                : new[] { (_c.FootingWidthParam, e.Width), (_c.FootingLengthParam, e.Length), (_c.FootingThicknessParam, e.Thickness) };
            foreach (var (param, mm) in sizes)
            {
                var p = found.LookupParameter(param) ?? throw new InvalidOperationException($"The family \"{family}\" has no type parameter \"{param}\" to size \"{name}\" (see shanku_export_config.json).");
                if (p.IsReadOnly) throw new InvalidOperationException($"\"{param}\" of \"{family}\" is read-only.");
                p.Set(Ft(mm));
            }
            _typePlans.Add(new TypePlan(kind, family, name, "create"));
        }
        else if (!_typePlans.Any(t => t.Name == name)) _typePlans.Add(new TypePlan(kind, family, name, "exists"));
        if (!found.IsActive) found.Activate();
        return found.Id;
    }

    /// <summary>A floor or wall type by name; else the nearest in thickness duplicated, its structural layer resized.</summary>
    private ElementId SystemType<T>(string name, string family, double thicknessMm, string kind) where T : HostObjAttributes
    {
        var all = new FilteredElementCollector(_doc).OfClass(typeof(T)).Cast<T>().Where(t => t.GetCompoundStructure() != null).ToList();
        var found = all.FirstOrDefault(t => t.Name == name);
        if (found != null)
        {
            if (!_typePlans.Any(p => p.Name == name)) _typePlans.Add(new TypePlan(kind, family, name, "exists"));
            return found.Id;
        }
        if (all.Count == 0) throw new InvalidOperationException($"This model has no {family.ToLowerInvariant()} types to start from.");
        var start = all.OrderBy(t => Math.Abs(Mm(t.GetCompoundStructure().GetWidth()) - thicknessMm)).First();
        var dup = (T)start.Duplicate(name);
        var cs = dup.GetCompoundStructure();
        var layers = cs.GetLayers();
        int core = Enumerable.Range(0, layers.Count).FirstOrDefault(i => layers[i].Function == MaterialFunctionAssignment.Structure);
        double others = Enumerable.Range(0, layers.Count).Where(i => i != core).Sum(i => layers[i].Width);
        double coreWidth = Ft(thicknessMm) - others;
        if (coreWidth <= 0) throw new InvalidOperationException($"\"{start.Name}\" has finish layers thicker than {thicknessMm:0} mm; make a {family.ToLowerInvariant()} type named \"{name}\" in Revit.");
        cs.SetLayerWidth(core, coreWidth);
        dup.SetCompoundStructure(cs);
        _typePlans.Add(new TypePlan(kind, family, name, "create"));
        return dup.Id;
    }

    // ------------------------------------------------------------------ elements

    private CreateResult CreateOne(ExchangeElement e, IReadOnlyList<ExchangeLevel> levels, Func<Document, Element, string> globalIdOf)
    {
        var (_, typeName, group) = ExportPlanner.TypeFor(e, _c);
        if (_typeErrors.TryGetValue(typeName, out var terr)) return new CreateResult(e.Id, false, terr, typeName);
        using var st = new SubTransaction(_doc);
        try
        {
            st.Start();
            var notes = new List<string>();
            Element el = e.Kind switch
            {
                "column" or "pedestal" => Column(e, levels, notes),
                "beam" => Beam(e, levels),
                "wall" => WallOf(e, levels),
                "slab" or "chajja" => FloorOf(e, levels),
                _ => Footing(e, levels, notes),
            };
            WriteParams(el, e);
            _doc.Regenerate();
            Check(el, e, notes);
            st.Commit();
            return new CreateResult(e.Id, true, null, typeName, el.Id.Value, globalIdOf(_doc, el), notes.Count > 0 ? string.Join(" ", notes) : null);
        }
        catch (Exception ex)
        {
            if (st.HasStarted() && !st.HasEnded()) st.RollBack();
            return new CreateResult(e.Id, false, ex.Message, typeName);
        }
    }

    private FamilySymbol Symbol(ExchangeElement e) => (FamilySymbol)_doc.GetElement(_types[ExportPlanner.TypeFor(e, _c).Type]);

    private Element Column(ExchangeElement e, IReadOnlyList<ExchangeLevel> levels, List<string> notes)
    {
        // Top on its own level (CH-LEVEL), base on the level below: Level n-1 -> Level n.
        var baseLv = LevelOf(ExportPlanner.BaseLevel(levels, e));
        var topLv = LevelOf(ExportPlanner.OwnLevel(levels, e));
        if (topLv.ProjectElevation < baseLv.ProjectElevation) topLv = baseLv;
        var inst = _doc.Create.NewFamilyInstance(At(e.Center!, baseLv.ProjectElevation), Symbol(e), baseLv, StructuralType.Column);
        Set(inst, BuiltInParameter.FAMILY_BASE_LEVEL_PARAM, baseLv.Id);
        Set(inst, BuiltInParameter.FAMILY_TOP_LEVEL_PARAM, topLv.Id);
        Set(inst, BuiltInParameter.FAMILY_BASE_LEVEL_OFFSET_PARAM, Z(e.Z0) - baseLv.ProjectElevation);
        Set(inst, BuiltInParameter.FAMILY_TOP_LEVEL_OFFSET_PARAM, Z(e.Z1) - topLv.ProjectElevation);
        if (e.Shape != "round") Turn(inst, e.Center!, e.Angle - 90); // the family's L runs along its Y axis
        return inst;
    }

    private Element Beam(ExchangeElement e, IReadOnlyList<ExchangeLevel> levels)
    {
        var lv = LevelOf(ExportPlanner.OwnLevel(levels, e)); // a beam hangs from its own level (CH-LEVEL)
        var line = Line.CreateBound(At(e.Start!, lv.ProjectElevation), At(e.End!, lv.ProjectElevation));
        var inst = _doc.Create.NewFamilyInstance(line, Symbol(e), lv, StructuralType.Beam);
        // A beam's rise or sink goes in z Offset Value, top-justified; Start/End Level Offset stay 0.
        // Every value is set: a family's own default offset (e.g. -1500) must not add to ours.
        double off = Z(e.Z1) - lv.ProjectElevation;
        Set(inst, BuiltInParameter.STRUCTURAL_BEAM_END0_ELEVATION, 0.0);
        Set(inst, BuiltInParameter.STRUCTURAL_BEAM_END1_ELEVATION, 0.0);
        SetInt(inst, BuiltInParameter.Z_JUSTIFICATION, (int)ZJustification.Top);
        Set(inst, BuiltInParameter.Z_OFFSET_VALUE, off);
        return inst;
    }

    private Element WallOf(ExchangeElement e, IReadOnlyList<ExchangeLevel> levels)
    {
        // Base on the level below, top constrained to its own level with a top offset (e.g. -beam depth).
        var lv = LevelOf(ExportPlanner.BaseLevel(levels, e));
        var top = LevelOf(ExportPlanner.OwnLevel(levels, e));
        var line = Line.CreateBound(At(e.Start!, lv.ProjectElevation), At(e.End!, lv.ProjectElevation));
        var wall = Wall.Create(_doc, line, _types[ExportPlanner.TypeFor(e, _c).Type], lv.Id, Ft(e.Z1 - e.Z0), Z(e.Z0) - lv.ProjectElevation, false, true);
        if (top.Id != lv.Id)
        {
            Set(wall, BuiltInParameter.WALL_HEIGHT_TYPE, top.Id);
            Set(wall, BuiltInParameter.WALL_TOP_OFFSET, Z(e.Z1) - top.ProjectElevation);
        }
        return wall;
    }

    private Element FloorOf(ExchangeElement e, IReadOnlyList<ExchangeLevel> levels)
    {
        var lv = LevelOf(ExportPlanner.OwnLevel(levels, e)); // a slab hangs from its own level
        var pts = e.Outline!.Select(p => At(p, lv.ProjectElevation)).ToList();
        pts = pts.Where((p, i) => i == 0 || p.DistanceTo(pts[i - 1]) > 1e-6).ToList(); // no zero-length edges
        if (pts.Count > 1 && pts[0].DistanceTo(pts[^1]) < 1e-6) pts.RemoveAt(pts.Count - 1);
        var loop = new CurveLoop();
        for (int i = 0; i < pts.Count; i++) loop.Append(Line.CreateBound(pts[i], pts[(i + 1) % pts.Count]));
        var floor = Floor.Create(_doc, new List<CurveLoop> { loop }, _types[ExportPlanner.TypeFor(e, _c).Type], lv.Id, true, null, 0);
        Set(floor, BuiltInParameter.FLOOR_HEIGHTABOVELEVEL_PARAM, Z(e.Z1) - lv.ProjectElevation);
        return floor;
    }

    private Element Footing(ExchangeElement e, IReadOnlyList<ExchangeLevel> levels, List<string> notes)
    {
        var lv = LevelOf(ExportPlanner.OwnLevel(levels, e)); // foundations hang below their level (Level 1, ±0)
        var inst = _doc.Create.NewFamilyInstance(At(e.Center!, lv.ProjectElevation), Symbol(e), lv, StructuralType.Footing);
        // Families name this offset differently; the check below corrects the height if none applies.
        double off = Z(e.Z1) - lv.ProjectElevation;
        var p = inst.LookupParameter("Height Offset From Level") ?? inst.get_Parameter(BuiltInParameter.INSTANCE_FREE_HOST_OFFSET_PARAM) ?? inst.get_Parameter(BuiltInParameter.INSTANCE_ELEVATION_PARAM);
        if (p is { IsReadOnly: false }) p.Set(off);
        Turn(inst, e.Center!, e.Angle - 90);
        return inst;
    }

    private void Turn(Element el, double[] center, double degrees)
    {
        double a = degrees % 180;
        if (Math.Abs(a) < 1e-6) return;
        var c = At(center, 0);
        ElementTransformUtils.RotateElement(_doc, el.Id, Line.CreateBound(c, c + XYZ.BasisZ), a * Math.PI / 180);
    }

    private static void Set(Element el, BuiltInParameter bip, double value)
    {
        var p = el.get_Parameter(bip);
        if (p is { IsReadOnly: false }) p.Set(value);
    }

    private static void SetInt(Element el, BuiltInParameter bip, int value)
    {
        var p = el.get_Parameter(bip);
        if (p is { IsReadOnly: false }) p.Set(value);
    }

    private static void Set(Element el, BuiltInParameter bip, ElementId value)
    {
        var p = el.get_Parameter(bip);
        if (p is { IsReadOnly: false }) p.Set(value);
    }

    /// <summary>
    /// The drawing's mark goes in CH-ScheduleMark (else Comments), never the built-in Mark: Revit wants
    /// Mark unique per element, and a drawing's marks repeat (C-1 on every floor). Plus CH-ID, CH-LEVEL.
    /// </summary>
    private void WriteParams(Element el, ExchangeElement e)
    {
        bool markWritten = false;
        foreach (var (name, value) in new[] { (_c.MarkParam, e.Mark), (_c.IdParam, e.Id), (_c.LevelParam, e.Level) })
        {
            if (string.IsNullOrEmpty(name)) continue;
            var p = el.LookupParameter(name);
            if (p is { IsReadOnly: false, StorageType: StorageType.String })
            {
                p.Set(value);
                if (name == _c.MarkParam) markWritten = true;
            }
        }
        if (!markWritten && !string.IsNullOrEmpty(e.Mark) && el.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS) is { IsReadOnly: false } c)
            c.Set(e.Mark);
    }

    // ------------------------------------------------------------------ check after placing

    /// <summary>
    /// Compares the placed element with the plan. Columns and footings: turned 90° if their family runs
    /// the other way, moved if off in plan or height. Others: reported when off.
    /// </summary>
    private void Check(Element el, ExchangeElement e, List<string> notes)
    {
        var bb = el.get_BoundingBox(null);
        if (bb == null) return;
        double tol = _c.CheckToleranceMm;
        bool point = e.Kind is "column" or "pedestal" or "footing" or "pcc";
        if (point && e.Center != null)
        {
            var want = At(e.Center, 0);
            var mid = (bb.Min + bb.Max) / 2;
            if (e.Shape != "round")
            {
                var (hx, hy) = ExportPlanner.Footprint(e.Width, e.Length, e.Angle);
                double gx = Mm(bb.Max.X - bb.Min.X) / 2, gy = Mm(bb.Max.Y - bb.Min.Y) / 2;
                bool swapped = Math.Abs(gx - hy) <= tol && Math.Abs(gy - hx) <= tol && (Math.Abs(gx - hx) > tol || Math.Abs(gy - hy) > tol);
                if (swapped)
                {
                    ElementTransformUtils.RotateElement(_doc, el.Id, Line.CreateBound(new XYZ(mid.X, mid.Y, 0), new XYZ(mid.X, mid.Y, 1)), Math.PI / 2);
                    _doc.Regenerate();
                    notes.Add("Turned 90° (its family runs length and width the other way).");
                    bb = el.get_BoundingBox(null);
                    mid = (bb.Min + bb.Max) / 2;
                }
            }
            var dxy = new XYZ(want.X - mid.X, want.Y - mid.Y, 0);
            double dz = Z(e.Z1) - bb.Max.Z;
            bool moveZ = e.Kind is "footing" or "pcc" && Math.Abs(Mm(dz)) > tol; // columns follow their levels
            if (Mm(dxy.GetLength()) > tol || moveZ)
            {
                ElementTransformUtils.MoveElement(_doc, el.Id, new XYZ(dxy.X, dxy.Y, moveZ ? dz : 0));
                _doc.Regenerate();
                notes.Add($"Moved {Mm(dxy.GetLength()):0} mm in plan{(moveZ ? $", {Mm(dz):0} mm in height" : "")} to its place in the drawing.");
                bb = el.get_BoundingBox(null);
            }
        }
        double top = Mm(bb.Max.Z - Z(e.Z1));
        // Beams and slabs: a height that is off is corrected through their own offset parameter
        // (z Offset Value; Height Offset From Level), so the element keeps its level and justification.
        var fix = e.Kind == "beam" ? BuiltInParameter.Z_OFFSET_VALUE : e.Kind is "slab" or "chajja" ? BuiltInParameter.FLOOR_HEIGHTABOVELEVEL_PARAM : (BuiltInParameter?)null;
        if (Math.Abs(top) > tol && fix is { } bip && el.get_Parameter(bip) is { IsReadOnly: false } p)
        {
            p.Set(p.AsDouble() - Ft(top));
            _doc.Regenerate();
            notes.Add($"{(top > 0 ? "Lowered" : "Raised")} {Math.Abs(top):0} mm to the drawing's height ({(e.Kind == "beam" ? "z Offset Value" : "Height Offset From Level")}).");
            bb = el.get_BoundingBox(null);
            top = Mm(bb.Max.Z - Z(e.Z1));
        }
        if (Math.Abs(top) > tol) notes.Add($"Check it: its top is {top:+0;-0} mm from the drawing.");
    }

    // ------------------------------------------------------------------ helpers

    private HashSet<string> ExistingIds()
    {
        var ids = new HashSet<string>();
        if (string.IsNullOrEmpty(_c.IdParam)) return ids;
        foreach (var el in new FilteredElementCollector(_doc).WhereElementIsNotElementType())
        {
            var v = el.LookupParameter(_c.IdParam)?.AsString();
            if (!string.IsNullOrEmpty(v) && v.StartsWith("DXF:", StringComparison.Ordinal)) ids.Add(v);
        }
        return ids;
    }

    private sealed class Collector : IFailuresPreprocessor
    {
        private readonly List<string> _w;
        public Collector(List<string> w) => _w = w;
        public FailureProcessingResult PreprocessFailures(FailuresAccessor fa)
        {
            foreach (var m in fa.GetFailureMessages())
            {
                if (m.GetSeverity() != FailureSeverity.Warning) continue;
                _w.Add(m.GetDescriptionText().TrimEnd('.', ' ') + ".");
                fa.DeleteWarning(m);
            }
            return FailureProcessingResult.Continue;
        }
    }
}
