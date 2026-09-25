using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Shanku.Revit.Commands;

/// <summary>Shows a pairing code for Shanku and the bridge's status.</summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class ConnectCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData data, ref string message, ElementSet elements)
    {
        if (App.StartError != null || App.Pairing == null || App.Server == null)
        {
            TaskDialog.Show("Shanku", App.StartError ?? "The Shanku bridge did not start. See %APPDATA%\\Shanku\\bridge.log.");
            return Result.Failed;
        }
        string code = App.Pairing.NewCode();
        var dlg = new TaskDialog("Connect to Shanku")
        {
            MainInstruction = $"Pairing code:  {code[..3]} {code[3..]}",
            MainContent =
                "In Shanku, click Revit in the status bar (or search \"Connect to Revit\") and enter this code. " +
                "It works once, for 5 minutes.\n\n" +
                (App.Pairing.HasTokens ? "A browser is already paired on this computer; a code is only needed for a new one.\n\n" : "") +
                "Shanku waits for this dialog to close before it loads the model.",
            FooterText = $"Bridge on http://localhost:{App.Server.Port} · Revit {App.Host?.RevitVersion} · add-in {App.Host?.AddinVersion}",
            CommonButtons = TaskDialogCommonButtons.Close,
        };
        dlg.AddCommandLink(TaskDialogCommandLinkId.CommandLink1, "Open Shanku in the browser");
        if (dlg.Show() == TaskDialogResult.CommandLink1) App.OpenShanku();
        return Result.Succeeded;
    }
}

/// <summary>Forgets every paired browser and closes their connections.</summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class DisconnectCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData data, ref string message, ElementSet elements)
    {
        App.Pairing?.RevokeAll();
        App.Server?.CloseStreams();
        TaskDialog.Show("Shanku", "Disconnected. Every paired browser has to pair again with a new code.");
        return Result.Succeeded;
    }
}

/// <summary>Opens Shanku in the default browser.</summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class OpenShankuCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData data, ref string message, ElementSet elements)
    {
        App.OpenShanku();
        return Result.Succeeded;
    }
}
