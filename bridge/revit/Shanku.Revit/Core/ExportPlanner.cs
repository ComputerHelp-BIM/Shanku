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
                plans.Add(new LevelPlan(w.Name, w.Elevation, "exists", byName.Name));
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

    /// <summary>The level nearest to a height (a beam or slab hangs on the level at its top).</summary>
    public static ExchangeLevel NearestLevel(IReadOnlyList<ExchangeLevel> levels, double zMm) =>
        levels.OrderBy(l => Math.Abs(l.Elevation - zMm)).ThenByDescending(l => l.Elevation).First();

    /// <summary>The level an element's bottom sits on or above (a column or wall starts there).</summary>
    public static ExchangeLevel BaseLevel(IReadOnlyList<ExchangeLevel> levels, ExchangeElement e)
    {
        var own = levels.FirstOrDefault(l => l.Name == e.Level);
        if (own != null && own.Elevation <= e.Z0 + 1) return own;
        var below = levels.Where(l => l.Elevation <= e.Z0 + 1).OrderByDescending(l => l.Elevation).FirstOrDefault();
        return below ?? levels.OrderBy(l => l.Elevation).First();
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
