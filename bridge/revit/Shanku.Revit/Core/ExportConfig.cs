using System;
using System.Globalization;
using System.IO;
using System.Text.Json;

namespace Shanku.Revit.Core;

/// <summary>
/// Which families and types Export to Revit uses, from shanku_export_config.json next to the add-in
/// (every key optional; defaults follow the R25 template). Type names are patterns: {W} width,
/// {L} length, {H} depth, {T} thickness, {D} diameter, in whole millimetres.
/// </summary>
public sealed class ExportConfig
{
    public string ColumnFamily { get; init; } = "CH-Concrete-Rectangular-Column";
    public string ColumnWidthParam { get; init; } = "W";
    public string ColumnLengthParam { get; init; } = "L";
    public string ColumnTypeName { get; init; } = "CH-{W} X {L}";
    public string RoundColumnFamily { get; init; } = "CH-Concrete-Round-Column";
    public string RoundDiameterParam { get; init; } = "W";
    public string RoundColumnTypeName { get; init; } = "CH-{D}";
    public string PedestalTypeName { get; init; } = "CH-PED-{W} X {L}";
    public string BeamFamily { get; init; } = "CH-Concrete-Rectangular-Beam";
    public string BeamWidthParam { get; init; } = "W";
    public string BeamDepthParam { get; init; } = "H";
    public string BeamTypeName { get; init; } = "CH-{W} X {H}";
    public string FootingFamily { get; init; } = "CH-Concrete-Rectangular-Footing";
    public string FootingWidthParam { get; init; } = "Width";
    public string FootingLengthParam { get; init; } = "Length";
    public string FootingThicknessParam { get; init; } = "Foundation Thickness";
    public string FootingTypeName { get; init; } = "CH-{W} X {L} X {T}";
    public string PccTypeName { get; init; } = "CH-PCC-{W} X {L} X {T}";
    public string SlabTypeName { get; init; } = "{T} THK. RCC SLAB";
    public string ChajjaTypeName { get; init; } = "{T} THK. RCC SLAB";
    public string RccWallTypeName { get; init; } = "CH-SHEAR-WALL-{T}";
    public string BrickWallTypeName { get; init; } = "CH-PARDI-WALL-{T}";
    /// <summary>Shared parameters written on every element (empty name: skipped).</summary>
    public string IdParam { get; init; } = "CH-ID";
    public string MarkParam { get; init; } = "CH-ScheduleMark";
    public string LevelParam { get; init; } = "CH-LEVEL";
    /// <summary>A level is reused when its elevation is within this of the drawing's (mm).</summary>
    public double LevelMatchMm { get; init; } = 1;
    /// <summary>Placement checked after creation: a difference above this (mm) is corrected or reported.</summary>
    public double CheckToleranceMm { get; init; } = 5;

    /// <summary>"CH-{W} X {L}" with W = 300, L = 600 → "CH-300 X 600".</summary>
    public static string Name(string pattern, double w = 0, double l = 0, double h = 0, double t = 0, double d = 0)
    {
        string mm(double v) => Math.Round(v).ToString("0", CultureInfo.InvariantCulture);
        return pattern.Replace("{W}", mm(w)).Replace("{L}", mm(l)).Replace("{H}", mm(h)).Replace("{T}", mm(t)).Replace("{D}", mm(d));
    }

    public static ExportConfig Load(string path)
    {
        try
        {
            if (!File.Exists(path)) return new ExportConfig();
            var c = JsonSerializer.Deserialize<ExportConfig>(File.ReadAllText(path), new JsonSerializerOptions { PropertyNameCaseInsensitive = true, ReadCommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
            return c ?? new ExportConfig();
        }
        catch
        {
            return new ExportConfig(); // a broken file must not stop Revit; the defaults apply
        }
    }
}
