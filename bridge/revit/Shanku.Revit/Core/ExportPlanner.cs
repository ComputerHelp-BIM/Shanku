using System;
using System.Collections.Generic;
using System.Linq;

namespace Shanku.Revit.Core;

/// <summary>
/// The decisions of Export to Revit that do not need Revit: which level an element hangs on, how
/// levels match, what its type is called, and which elements Revit already has. Tested without Revit.
/// </summary>
public static class ExportPlanner
{
    /// <summary>
    /// Matches the drawing's levels to Revit's: the same name first, else a level at the same elevation
    /// (so the template's "01 GROUND LVL." is reused for a ground level named differently), else create.
    /// </summary>
    public static List<LevelPlan> MatchLevels(IEnumerable<ExchangeLevel> wanted, IReadOnlyList<(string Name, double ElevationMm)> existing, double toleranceMm)
    {
        var plans = new List<LevelPlan>();
        var used = new HashSet<string>();
        foreach (var w in wanted)
        {
            var byName = existing.FirstOrDefault(e => e.Name == w.Name);
            if (byName.Name != null)
            {
                // Same name at another height (e.g. from an export before pipeline 2.0.0): reused, flagged.
                bool elsewhere = Math.Abs(byName.ElevationMm - w.Elevation) > toleranceMm;
                plans.Add(new LevelPlan(w.Name, w.Elevation, elsewhere ? "exists-elsewhere" : "exists", byName.Name, byName.ElevationMm));
                used.Add(byName.Name);
                continue;
            }
            var byElev = existing.Where(e => !used.Contains(e.Name) && Math.Abs(e.ElevationMm - w.Elevation) <= toleranceMm).OrderBy(e => Math.Abs(e.ElevationMm - w.Elevation)).FirstOrDefault();
            if (byElev.Name != null)
            {
                plans.Add(new LevelPlan(w.Name, w.Elevation, "same-elevation", byElev.Name));
                used.Add(byElev.Name);
                continue;
            }
            plans.Add(new LevelPlan(w.Name, w.Elevation, "create", w.Name));
        }
        return plans;
    }

    /// <summary>The level nearest to a height (fallback when an element's own level is unknown).</summary>
    public static ExchangeLevel NearestLevel(IReadOnlyList<ExchangeLevel> levels, double zMm) =>
        levels.OrderBy(l => Math.Abs(l.Elevation - zMm)).ThenByDescending(l => l.Elevation).First();

    /// <summary>
    /// The element's own level (its CH-LEVEL): the top of its storey. Columns and walls rise to it,
    /// beams and slabs hang from it, foundations hang below Level 1.
    /// </summary>
    public static ExchangeLevel OwnLevel(IReadOnlyList<ExchangeLevel> levels, ExchangeElement e) =>
        levels.FirstOrDefault(l => l.Name == e.Level) ?? NearestLevel(levels, e.Z1);

    /// <summary>
    /// Where a column or wall starts: the level below its own when the element starts there or above;
    /// else its own level (a foundation pedestal starts below Level 1: own level, negative offset).
    /// </summary>
    public static ExchangeLevel BaseLevel(IReadOnlyList<ExchangeLevel> levels, ExchangeElement e)
    {
        var own = OwnLevel(levels, e);
        var below = levels.Where(l => l.Elevation < own.Elevation - 1).OrderByDescending(l => l.Elevation).FirstOrDefault();
        return below != null && below.Elevation <= e.Z0 + 1 ? below : own;
    }

    /// <summary>Vertices closer than this are one (mm). Revit refuses edges under ~0.8 mm (ShortCurveTolerance).</summary>
    public const double OutlineMergeMm = 1.5;
    /// <summary>A vertex this close to the line through its neighbours is dropped (mm).</summary>
    public const double OutlineCollinearMm = 0.5;

    /// <summary>
    /// A drawn outline as loops Revit accepts for a floor: vertices closer than 1.5 mm merged (drawings
    /// carry 0.1 mm jogs and doubled points), collinear points and spikes (out and straight back)
    /// dropped, and an outline that touches itself (a notch whose sides meet) split into simple loops at
    /// that point. Checked on a 4,444-element drawing: 192 of 892 slab outlines were invalid for Revit,
    /// none after, area within 0.05 %. Empty when nothing with area is left.
    /// </summary>
    public static List<List<double[]>> CleanOutline(IReadOnlyList<double[]> outline)
    {
        var pts = new List<double[]>();
        foreach (var p in outline)
            if (pts.Count == 0 || Dist(pts[^1], p) >= OutlineMergeMm) pts.Add(p);
        while (pts.Count > 2 && Dist(pts[0], pts[^1]) < OutlineMergeMm) pts.RemoveAt(pts.Count - 1);
        return Loops(pts, 0);
    }

    private static List<List<double[]>> Loops(List<double[]> pts, int depth)
    {
        var result = new List<List<double[]>>();
        if (depth > 64) return result;
        // collinear points and spikes, until none is left
        bool changed = true;
        while (changed && pts.Count >= 3)
        {
            changed = false;
            for (int i = 0; i < pts.Count; i++)
            {
                var a = pts[(i - 1 + pts.Count) % pts.Count];
                var b = pts[i];
                var c = pts[(i + 1) % pts.Count];
                double ac = Dist(a, c);
                double cross = Math.Abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
                if (ac < OutlineMergeMm || cross / Math.Max(ac, 1e-9) < OutlineCollinearMm || Dist(a, b) < OutlineMergeMm)
                {
                    pts.RemoveAt(i);
                    changed = true;
                    break;
                }
            }
        }
        if (pts.Count < 3) return result;
        // an outline that touches itself: split it into two at the shared point
        int n = pts.Count;
        for (int i = 0; i < n; i++)
            for (int j = i + 2; j < n; j++)
            {
                if (i == 0 && j == n - 1) continue;
                if (Dist(pts[i], pts[j]) < OutlineMergeMm)
                {
                    result.AddRange(Loops(pts.GetRange(i, j - i), depth + 1));
                    result.AddRange(Loops(pts.Skip(j).Concat(pts.Take(i)).ToList(), depth + 1));
                    return result;
                }
            }
        if (Math.Abs(SignedArea(pts)) > 1.0) result.Add(pts);
        return result;
    }

    private static double Dist(double[] a, double[] b) => Math.Sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));

    private static double SignedArea(List<double[]> p)
    {
        double s = 0;
        for (int i = 0; i < p.Count; i++)
        {
            var a = p[i];
            var b = p[(i + 1) % p.Count];
            s += a[0] * b[1] - b[0] * a[1];
        }
        return s / 2;
    }

    /// <summary>The Revit family and type name for an element, per the config.</summary>
    public static (string Family, string Type, string Group) TypeFor(ExchangeElement e, ExportConfig c)
    {
        switch (e.Kind)
        {
            case "column":
            case "pedestal":
                if (e.Shape == "round") return (c.RoundColumnFamily, ExportConfig.Name(c.RoundColumnTypeName, d: e.Diameter), "column");
                return (c.ColumnFamily, ExportConfig.Name(e.Kind == "pedestal" ? c.PedestalTypeName : c.ColumnTypeName, w: e.Width, l: e.Length), "column");
            case "beam":
                return (c.BeamFamily, ExportConfig.Name(c.BeamTypeName, w: e.Width, h: e.Depth), "beam");
            case "footing":
                return (c.FootingFamily, ExportConfig.Name(c.FootingTypeName, w: e.Width, l: e.Length, t: e.Thickness), "footing");
            case "pcc":
                return (c.FootingFamily, ExportConfig.Name(c.PccTypeName, w: e.Width, l: e.Length, t: e.Thickness), "footing");
            case "slab":
                return ("Floor", ExportConfig.Name(c.SlabTypeName, t: e.Thickness), "floor");
            case "chajja":
                return ("Floor", ExportConfig.Name(c.ChajjaTypeName, t: e.Thickness), "floor");
            case "wall":
                bool brick = string.Equals(e.Material, "Brick", StringComparison.OrdinalIgnoreCase);
                return ("Basic Wall", ExportConfig.Name(brick ? c.BrickWallTypeName : c.RccWallTypeName, t: e.Width), "wall");
            default:
                throw new ArgumentException($"Revit export does not know the kind \"{e.Kind}\".");
        }
    }

    /// <summary>Checks an element has what its kind needs, with a readable reason when not.</summary>
    public static string? Problem(ExchangeElement e)
    {
        bool rect = e.Kind is "column" or "pedestal" or "footing" or "pcc";
        if (string.IsNullOrWhiteSpace(e.Id)) return "It has no id.";
        if (e.Z1 <= e.Z0) return "Its top is not above its bottom.";
        if (rect && e.Shape == "round") return e.Diameter > 0 && e.Center?.Length == 2 ? null : "A round column needs a centre and a diameter.";
        if (rect) return e.Center?.Length == 2 && e.Width > 0 && e.Length > 0 ? null : "It needs a centre, a width and a length.";
        if (e.Kind is "beam" or "wall") return e.Start?.Length == 2 && e.End?.Length == 2 && e.Width > 0 && (e.Start[0] != e.End[0] || e.Start[1] != e.End[1]) ? null : "It needs a start, an end and a width.";
        if (e.Kind is "slab" or "chajja") return e.Outline is { Count: >= 3 } && e.Thickness > 0 ? null : "It needs an outline of three or more points and a thickness.";
        return $"Revit export does not know the kind \"{e.Kind}\".";
    }

    /// <summary>
    /// The footprint Revit should show for a centred rectangle rotated by `angle` (degrees): the
    /// axis-aligned half extents. Used to check a placed column or footing, and to spot one turned 90°.
    /// </summary>
    public static (double HalfX, double HalfY) Footprint(double width, double length, double angleDeg)
    {
        double a = angleDeg * Math.PI / 180, c = Math.Abs(Math.Cos(a)), s = Math.Abs(Math.Sin(a));
        // length runs along the angle, width across it
        return ((length * c + width * s) / 2, (length * s + width * c) / 2);
    }
}
