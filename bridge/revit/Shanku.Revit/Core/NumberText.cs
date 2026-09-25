using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace Shanku.Revit.Core;

/// <summary>Reads what a user types for a number parameter: a value and an optional unit word.</summary>
public static class NumberText
{
    private static readonly Regex Pattern = new(@"^(-?\d+(?:[.,]\d+)?)\s*([^\d\s]*)$", RegexOptions.Compiled);

    /// <summary>"600" → (600, ""); "600.000" → (600, ""); "600,5 mm" → (600.5, "mm"); "0.6 m" → (0.6, "m").</summary>
    public static (double Value, string Unit) Parse(string text)
    {
        var m = Pattern.Match((text ?? "").Trim());
        if (!m.Success) throw new FormatException($"\"{text}\" is not a number.");
        double n = double.Parse(m.Groups[1].Value.Replace(',', '.'), CultureInfo.InvariantCulture);
        return (n, m.Groups[2].Value);
    }
}
