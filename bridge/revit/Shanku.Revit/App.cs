using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Media.Imaging;
using Autodesk.Revit.UI;
using Shanku.Revit.Core;
using Shanku.Revit.Revit;

namespace Shanku.Revit;

/// <summary>
/// Shanku Bridge for Revit: a Shanku ribbon tab (Connect, Disconnect, Open Shanku) and a localhost
/// server that lets Shanku in the browser load this model and sync the selection
/// (docs/bridge/protocol.md).
/// </summary>
public sealed class App : IExternalApplication
{
    public const string ShankuUrl = "https://shanku.vercel.app/#app";

    internal static BridgeServer? Server { get; private set; }
    internal static RevitHost? Host { get; private set; }
    internal static Pairing? Pairing { get; private set; }
    internal static BridgeConfig Config { get; private set; } = new();
    /// <summary>Why the bridge is not running (port taken), shown by Connect.</summary>
    internal static string? StartError { get; private set; }

    private static readonly string DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Shanku");

    public Result OnStartup(UIControlledApplication app)
    {
        try
        {
            string here = Path.GetDirectoryName(typeof(App).Assembly.Location)!;
            Config = BridgeConfig.Load(Path.Combine(here, "shanku_bridge_config.json"));
            Pairing = new Pairing(Path.Combine(DataDir, "bridge-tokens.json"));
            Host = new RevitHost(new RevitQueue(), app.ControlledApplication.VersionNumber);
            Server = new BridgeServer(Host, Pairing, Config, Log);
            Host.Broadcast = Server.Broadcast;
            try
            {
                Server.Start();
            }
            catch (Exception ex)
            {
                StartError = $"The bridge could not use port {Config.Port} ({ex.Message}). Another program may be using it; set another port in shanku_bridge_config.json and restart Revit.";
                Log(StartError);
            }
            app.SelectionChanged += Host.OnSelectionChanged;
            app.ViewActivated += Host.OnViewActivated;
            app.ControlledApplication.DocumentClosed += Host.OnDocumentClosed;
            app.ControlledApplication.DocumentChanged += Host.OnDocumentChanged; // live updates for Shanku
            CreateRibbon(app);
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            Log($"Startup failed: {ex}");
            return Result.Failed;
        }
    }

    public Result OnShutdown(UIControlledApplication app)
    {
        if (Host != null)
        {
            app.SelectionChanged -= Host.OnSelectionChanged;
            app.ViewActivated -= Host.OnViewActivated;
            app.ControlledApplication.DocumentClosed -= Host.OnDocumentClosed;
            app.ControlledApplication.DocumentChanged -= Host.OnDocumentChanged;
        }
        Server?.Dispose();
        return Result.Succeeded;
    }

    private static void CreateRibbon(UIControlledApplication app)
    {
        const string tab = "Shanku";
        try { app.CreateRibbonTab(tab); } catch { /* already there */ }
        var panel = app.CreateRibbonPanel(tab, "Bridge");
        string asm = typeof(App).Assembly.Location;
        PushButtonData Button(string name, string text, string cls, string icon, string tip) => new(name, text, asm, cls)
        {
            LargeImage = Icon($"{icon}32.png"),
            Image = Icon($"{icon}16.png"),
            ToolTip = tip,
        };
        panel.AddItem(Button("ShankuConnect", "Connect", "Shanku.Revit.Commands.ConnectCommand", "connect", "Show a pairing code for Shanku, and the bridge status."));
        panel.AddItem(Button("ShankuDisconnect", "Disconnect", "Shanku.Revit.Commands.DisconnectCommand", "disconnect", "Forget every paired browser and close their connections."));
        panel.AddItem(Button("ShankuOpen", "Open\nShanku", "Shanku.Revit.Commands.OpenShankuCommand", "open", "Open Shanku in your web browser."));
    }

    private static BitmapSource? Icon(string file)
    {
        using var s = Assembly.GetExecutingAssembly().GetManifestResourceStream($"Shanku.Revit.Resources.{file}");
        if (s == null) return null;
        var decoder = new PngBitmapDecoder(s, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
        return decoder.Frames[0];
    }

    internal static void OpenShanku() => Process.Start(new ProcessStartInfo(ShankuUrl) { UseShellExecute = true });

    /// <summary>Appends to %APPDATA%\Shanku\bridge.log (kept under 1 MB).</summary>
    internal static void Log(string line)
    {
        try
        {
            Directory.CreateDirectory(DataDir);
            string path = Path.Combine(DataDir, "bridge.log");
            if (File.Exists(path) && new FileInfo(path).Length > 1_000_000) File.Delete(path);
            File.AppendAllText(path, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss}  {line}{Environment.NewLine}");
        }
        catch { /* logging must never break Revit */ }
    }
}
