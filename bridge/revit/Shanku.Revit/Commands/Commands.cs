using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace Shanku.Revit.Commands;

/// <summary>Shows a pairing code for cad2bim and the bridge's status.</summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class ConnectCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData data, ref string message, ElementSet elements)
    {
        if (App.StartError != null || App.Pairing == null || App.Server == null)
        {
            TaskDialog.Show("cad2bim", App.StartError ?? "The cad2bim bridge did not start. See %APPDATA%\\Shanku\\bridge.log.");
            return Result.Failed;
        }
        // modeless: Revit keeps working while the code shows, so cad2bim can pair and load at once
        ConnectWindow.ShowFor(data.Application.MainWindowHandle);
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
        TaskDialog.Show("cad2bim", "Disconnected. Every paired browser has to pair again with a new code.");
        return Result.Succeeded;
    }
}

/// <summary>Opens cad2bim in the default browser.</summary>
[Transaction(TransactionMode.ReadOnly)]
public sealed class OpenShankuCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData data, ref string message, ElementSet elements)
    {
        App.Opencad2bim();
        return Result.Succeeded;
    }
}
