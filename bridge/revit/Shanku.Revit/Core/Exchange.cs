using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Shanku.Revit.Core;

/// <summary>
/// The model Shanku asks Revit to build (the DXF → 3D pipeline's exchange, version 1): levels and
/// elements in millimetres, relative to the drawing origin, which goes to Revit's Project Base Point.
/// </summary>
public sealed class ExchangeModel
{
    [JsonPropertyName("version")] public int Version { get; set; }
    [JsonPropertyName("levels")] public List<ExchangeLevel> Levels { get; set; } = new();
    [JsonPropertyName("elements")] public List<ExchangeElement> Elements { get; set; } = new();
}

public sealed class ExchangeLevel
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("elevation")] public double Elevation { get; set; }
    [JsonPropertyName("foundation")] public bool Foundation { get; set; }
}

/// <summary>
/// One element. Kind: column, pedestal, beam, wall, slab, chajja, footing, pcc. Columns and foundations
/// are centred rectangles (center, width = short side, length = long side, angle of the long side in
/// degrees) or round (diameter); beams and walls run start → end with a width; slabs have an outline.
/// z0/z1 are bottom and top.
/// </summary>
public sealed class ExchangeElement
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("kind")] public string Kind { get; set; } = "";
    [JsonPropertyName("mark")] public string Mark { get; set; } = "";
    [JsonPropertyName("material")] public string? Material { get; set; }
    [JsonPropertyName("level")] public string Level { get; set; } = "";
    [JsonPropertyName("z0")] public double Z0 { get; set; }
    [JsonPropertyName("z1")] public double Z1 { get; set; }
    [JsonPropertyName("shape")] public string? Shape { get; set; }
    [JsonPropertyName("center")] public double[]? Center { get; set; }
    [JsonPropertyName("width")] public double Width { get; set; }
    [JsonPropertyName("length")] public double Length { get; set; }
    [JsonPropertyName("diameter")] public double Diameter { get; set; }
    [JsonPropertyName("angle")] public double Angle { get; set; }
    [JsonPropertyName("thickness")] public double Thickness { get; set; }
    [JsonPropertyName("depth")] public double Depth { get; set; }
    [JsonPropertyName("start")] public double[]? Start { get; set; }
    [JsonPropertyName("end")] public double[]? End { get; set; }
    [JsonPropertyName("outline")] public List<double[]>? Outline { get; set; }
}

/// <summary>What Revit did (or would do) with one element.</summary>
public sealed record CreateResult(string Id, bool Ok, string? Error = null, string? TypeName = null, long ElementId = 0, string? GlobalId = null, string? Note = null);
public sealed record LevelPlan(string Name, double Elevation, string Action, string RevitName);
public sealed record TypePlan(string Kind, string Family, string Name, string Action);
public sealed record CreateReport(bool DryRun, string UndoName, IReadOnlyList<LevelPlan> Levels, IReadOnlyList<TypePlan> Types, IReadOnlyList<CreateResult> Results, IReadOnlyList<string> Existing, IReadOnlyList<string> Warnings);
