using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Shanku.Revit.Core;

/// <summary>
/// Settings from shanku_bridge_config.json next to the add-in (all optional): the port and extra
/// origins allowed to call the bridge. Unknown keys and a missing file fall back to defaults.
/// </summary>
public sealed class BridgeConfig
{
    public const int DefaultPort = 7071;

    /// <summary>Shanku's own sites and local development servers.</summary>
    public static readonly string[] DefaultOrigins =
    {
        "https://shanku.vercel.app",
        "https://computerhelp-bim.github.io",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:4174",
    };

    // Vercel preview deployments of the Shanku project.
    private static readonly Regex PreviewOrigin = new(@"^https://shanku(-[a-z0-9-]+)?\.vercel\.app$", RegexOptions.Compiled);

    public int Port { get; init; } = DefaultPort;
    public IReadOnlyList<string> ExtraOrigins { get; init; } = Array.Empty<string>();

    public bool IsAllowedOrigin(string? origin)
    {
        if (string.IsNullOrEmpty(origin)) return false;
        origin = origin.TrimEnd('/');
        return DefaultOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)
            || ExtraOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)
            || PreviewOrigin.IsMatch(origin);
    }

    public static BridgeConfig Load(string path)
    {
        try
        {
            if (!File.Exists(path)) return new BridgeConfig();
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            var root = doc.RootElement;
            int port = root.TryGetProperty("port", out var p) && p.TryGetInt32(out var v) && v is > 1024 and < 65536 ? v : DefaultPort;
            var extra = root.TryGetProperty("extraOrigins", out var o) && o.ValueKind == JsonValueKind.Array
                ? o.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!.TrimEnd('/')).ToArray()
                : Array.Empty<string>();
            return new BridgeConfig { Port = port, ExtraOrigins = extra };
        }
        catch
        {
            return new BridgeConfig();
        }
    }
}
