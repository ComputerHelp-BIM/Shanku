using System;
using System.Collections.Generic;
using System.Linq;

namespace Shanku.Revit.Core;

/// <summary>
/// An edit cad2bim asks Revit to make (POST /elements/edit, add-in 0.12.0). Kinds:
/// <c>param</c> an instance parameter (GlobalIds: one element; ParamId, Name, OldDisplay, Value);
/// <c>typeParam</c> a type parameter — every instance of the type changes (TypeId, or FamilyName + TypeName
/// for a type duplicated earlier in the same edit; ParamId, Name, OldDisplay, Value);
/// <c>setType</c> elements switched to another type of their category (GlobalIds; TypeId or FamilyName + TypeName);
/// <c>duplicateType</c> a copy of a type (TypeId, NewName), given to the GlobalIds;
/// <c>move</c> by Dx, Dy, Dz in mm along the model's axes (Revit's internal axes: the IFC cad2bim reads is
/// exported on them); <c>rotate</c> by Angle degrees about a vertical axis (counter-clockwise seen from above)
/// through each element's centre (About "each") or the centre of all of them ("group").
/// </summary>
public sealed record EditOp(
    string Kind,
    IReadOnlyList<string> GlobalIds,
    long ParamId = 0,
    string? Name = null,
    string? OldDisplay = null,
    string? Value = null,
    long TypeId = 0,
    string? FamilyName = null,
    string? TypeName = null,
    string? NewName = null,
    double Dx = 0,
    double Dy = 0,
    double Dz = 0,
    double Angle = 0,
    string About = "each");

/// <summary>A type an element can be switched to (same category).</summary>
public sealed record TypeChoice(long Id, string Family, string Name);

public static class EditPlanner
{
    public static readonly string[] Kinds = { "param", "typeParam", "setType", "duplicateType", "move", "rotate" };
    /// <summary>Largest move cad2bim sends in one edit (mm): a typo guard, not a Revit limit.</summary>
    public const double MaxMoveMm = 1_000_000;
    /// <summary>Characters Revit refuses in a type name.</summary>
    public const string ForbiddenNameChars = "{}[]|;<>?`~\\:";

    /// <summary>Why an edit cannot be sent as it is, or null when it can.</summary>
    public static string? Problem(EditOp op)
    {
        if (!Kinds.Contains(op.Kind)) return $"\"{op.Kind}\" is not an edit the add-in knows.";
        bool hasType = op.TypeId > 0 || (!string.IsNullOrWhiteSpace(op.FamilyName) && !string.IsNullOrWhiteSpace(op.TypeName));
        switch (op.Kind)
        {
            case "param":
                if (op.GlobalIds.Count != 1) return "A parameter change is for one element.";
                if (string.IsNullOrWhiteSpace(op.Name)) return "A parameter change needs the parameter's name.";
                return null;
            case "typeParam":
                if (!hasType) return "A type parameter change needs the type.";
                if (string.IsNullOrWhiteSpace(op.Name)) return "A type parameter change needs the parameter's name.";
                return null;
            case "setType":
                if (op.GlobalIds.Count == 0) return "Choose the elements to change the type of.";
                return hasType ? null : "Choose the type to change them to.";
            case "duplicateType":
                if (op.TypeId <= 0) return "Choose the type to duplicate.";
                return NameProblem(op.NewName);
            case "move":
                if (op.GlobalIds.Count == 0) return "Choose the elements to move.";
                double[] d = { op.Dx, op.Dy, op.Dz };
                if (d.Any(v => !double.IsFinite(v))) return "The distance is not a number.";
                if (d.All(v => Math.Abs(v) < 0.01)) return "The distance is zero.";
                if (d.Any(v => Math.Abs(v) > MaxMoveMm)) return $"More than {MaxMoveMm / 1000:0} m in one move: check the distance.";
                return null;
            case "rotate":
                if (op.GlobalIds.Count == 0) return "Choose the elements to rotate.";
                if (!double.IsFinite(op.Angle) || Math.Abs(op.Angle) < 1e-6) return "The angle is zero.";
                if (Math.Abs(op.Angle) > 360) return "The angle is more than a full turn.";
                return op.About is "each" or "group" ? null : "Rotate about \"each\" element's centre or the \"group\"'s.";
        }
        return null;
    }

    /// <summary>Why a new type name cannot be used, or null.</summary>
    public static string? NameProblem(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "The new type needs a name.";
        if (name.Trim() != name) return "The name starts or ends with a space.";
        char? bad = name.FirstOrDefault(c => ForbiddenNameChars.Contains(c));
        if (bad is char c && c != default) return $"Revit does not allow \"{c}\" in a type name.";
        return null;
    }

    /// <summary>"cad2bim: move 3 elements, change 2 parameters" — the undo entry Revit shows.</summary>
    public static string UndoName(IReadOnlyList<EditOp> ops)
    {
        string N(int n, string one, string many) => $"{n} {(n == 1 ? one : many)}";
        var parts = new List<string>();
        int moved = ops.Where(o => o.Kind == "move").SelectMany(o => o.GlobalIds).Distinct().Count();
        int turned = ops.Where(o => o.Kind == "rotate").SelectMany(o => o.GlobalIds).Distinct().Count();
        int retyped = ops.Where(o => o.Kind == "setType").SelectMany(o => o.GlobalIds).Distinct().Count();
        int dup = ops.Count(o => o.Kind == "duplicateType");
        int prm = ops.Count(o => o.Kind == "param");
        int tprm = ops.Count(o => o.Kind == "typeParam");
        if (moved > 0) parts.Add("move " + N(moved, "element", "elements"));
        if (turned > 0) parts.Add("rotate " + N(turned, "element", "elements"));
        if (dup > 0) parts.Add("duplicate " + N(dup, "type", "types"));
        if (retyped > 0) parts.Add("change the type of " + N(retyped, "element", "elements"));
        if (tprm > 0) parts.Add("change " + N(tprm, "type parameter", "type parameters"));
        if (prm > 0) parts.Add("change " + N(prm, "parameter", "parameters"));
        return "cad2bim: " + (parts.Count > 0 ? string.Join(", ", parts) : "edit");
    }
}
