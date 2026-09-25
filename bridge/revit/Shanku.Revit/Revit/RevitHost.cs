using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Events;
using Shanku.Revit.Core;

namespace Shanku.Revit.Revit;

/// <summary>
/// The bridge's view of Revit (IRevitHost): every Revit API call runs on Revit's main thread through
/// RevitQueue. Also forwards Revit's selection and document changes to Shanku.
/// </summary>
public sealed class RevitHost : IRevitHost
{
    private static readonly TimeSpan Quick = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan Export = TimeSpan.FromMinutes(10);

    private readonly RevitQueue _queue;
    private readonly object _gate = new();
    private DocumentInfo? _current;
    private string? _mapKey;
    private Dictionary<string, ElementId> _byGlobalId = new();
    private HashSet<long>? _justPushed; // selection Shanku set: not echoed back

    public RevitHost(RevitQueue queue, string revitVersion)
    {
        _queue = queue;
        RevitVersion = revitVersion;
    }

    /// <summary>Set by the add-in: sends an event to Shanku.</summary>
    public Action<string, object>? Broadcast { get; set; }

    public string AddinVersion => typeof(RevitHost).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";
    public string RevitVersion { get; }
    public DocumentInfo? CurrentDocument { get { lock (_gate) return _current; } }

    // ------------------------------------------------------------------ IRevitHost

    public Task<DocumentInfo?> GetDocumentAsync() => _queue.Run(ui =>
    {
        var d = Describe(ui.ActiveUIDocument?.Document);
        SetCurrent(d, broadcast: false);
        return d;
    }, Quick);

    public Task<IReadOnlyList<string>> GetSelectionAsync() => _queue.Run<IReadOnlyList<string>>(ui =>
    {
        var uidoc = ui.ActiveUIDocument;
        if (uidoc == null) return Array.Empty<string>();
        var doc = uidoc.Document;
        return uidoc.Selection.GetElementIds().Select(id => doc.GetElement(id)).Where(IsModelElement).Select(e => GlobalIdOf(doc, e!)).ToList();
    }, Quick);

    public Task<ExportResult> ExportIfcAsync() => _queue.Run(ui =>
    {
        var doc = RequireProject(ui);
        string dir = Path.Combine(Path.GetTempPath(), "Shanku", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var options = new IFCExportOptions
            {
                FileVersion = IFCVersion.IFC4RV,
                ExportBaseQuantities = true,
                WallAndColumnSplitting = false,
            };
            options.AddOption("ExportInternalRevitPropertySets", "true");
            options.AddOption("ExportIFCCommonPropertySets", "true");
            options.AddOption("ExportRoomsInView", "false");
            // IFC export needs an open transaction; rolling it back leaves the model untouched.
            using (var t = new Transaction(doc, "Shanku: export IFC"))
            {
                t.Start();
                bool ok = doc.Export(dir, "model.ifc", options);
                t.RollBack();
                if (!ok) throw new BridgeException(500, "Revit's IFC export did not finish. Check that the IFC exporter is installed (File → Export → IFC works).");
            }
            string file = Directory.GetFiles(dir, "*.ifc").FirstOrDefault() ?? throw new BridgeException(500, "Revit's IFC export wrote no file.");
            var bytes = File.ReadAllBytes(file);
            BuildMap(doc); // ready for selection sync
            return new ExportResult(bytes, KeyOf(doc), doc.Title);
        }
        finally
        {
            try { Directory.Delete(dir, true); } catch { /* temp: leave it */ }
        }
    }, Export);

    public Task<IdsResult> GetIdsAsync() => _queue.Run(ui =>
    {
        var doc = RequireProject(ui);
        var ids = ModelElements(doc).Select(e => new IdEntry(GlobalIdOf(doc, e), e.UniqueId, e.Id.Value)).ToList();
        return new IdsResult(KeyOf(doc), ids);
    }, Export);

    public Task<SelectResult> SetSelectionAsync(string key, IReadOnlyList<string> globalIds, IReadOnlyList<long> elementIds) => _queue.Run(ui =>
    {
        var uidoc = ui.ActiveUIDocument ?? throw new BridgeException(409, "No model is open in Revit.");
        var doc = uidoc.Document;
        if (!string.IsNullOrEmpty(key) && key != KeyOf(doc))
            throw new BridgeException(409, $"Revit is showing a different model ({doc.Title}).");
        if (_mapKey != KeyOf(doc) || globalIds.Any(g => !_byGlobalId.ContainsKey(g))) BuildMap(doc);
        var found = new List<ElementId>();
        int missing = 0;
        for (int i = 0; i < globalIds.Count; i++)
        {
            if (_byGlobalId.TryGetValue(globalIds[i], out var id)) found.Add(id);
            else if (i < elementIds.Count && doc.GetElement(new ElementId(elementIds[i])) is { } e && IsModelElement(e)) found.Add(e.Id);
            else missing++;
        }
        _justPushed = found.Select(x => x.Value).ToHashSet();
        uidoc.Selection.SetElementIds(found);
        return new SelectResult(found.Count, missing);
    }, Quick);

    // ------------------------------------------------------------------ Revit events

    public void OnSelectionChanged(object? sender, SelectionChangedEventArgs e)
    {
        var doc = e.GetDocument();
        if (doc == null || doc.IsFamilyDocument) return;
        var ids = e.GetSelectedElements();
        var set = ids.Select(x => x.Value).ToHashSet();
        if (_justPushed != null && _justPushed.SetEquals(set))
        {
            _justPushed = null; // Shanku set this one: do not echo it back
            return;
        }
        _justPushed = null;
        var elements = ids.Select(id => doc.GetElement(id)).Where(IsModelElement).ToList();
        Broadcast?.Invoke("selection", new
        {
            key = KeyOf(doc),
            globalIds = elements.Select(x => GlobalIdOf(doc, x!)).ToArray(),
            elementIds = elements.Select(x => x!.Id.Value).ToArray(),
        });
    }

    public void OnViewActivated(object? sender, ViewActivatedEventArgs e) => SetCurrent(Describe(e.Document), broadcast: true);

    public void OnDocumentClosed(object? sender, DocumentClosedEventArgs e)
    {
        // The closed document may have been the active one: ask Revit what is active now.
        _ = _queue.Run(ui =>
        {
            SetCurrent(Describe(ui.ActiveUIDocument?.Document), broadcast: true);
            return true;
        }, Quick);
    }

    // ------------------------------------------------------------------ helpers

    private void SetCurrent(DocumentInfo? d, bool broadcast)
    {
        bool changed;
        lock (_gate)
        {
            changed = _current?.Key != d?.Key || _current?.Title != d?.Title;
            _current = d;
        }
        if (changed && broadcast) Broadcast?.Invoke("document", new { document = d });
    }

    private static DocumentInfo? Describe(Document? d) => d == null ? null : new DocumentInfo(d.Title, KeyOf(d), d.PathName ?? "", d.IsFamilyDocument);

    /// <summary>Tells documents apart: the project information's UniqueId (families: their title).</summary>
    private static string KeyOf(Document d) => d.IsFamilyDocument ? "family:" + d.Title : d.ProjectInformation?.UniqueId ?? d.Title;

    private static Document RequireProject(UIApplication ui)
    {
        var doc = ui.ActiveUIDocument?.Document ?? throw new BridgeException(409, "No model is open in Revit.");
        if (doc.IsFamilyDocument) throw new BridgeException(409, "Revit is showing a family. Open a project model.");
        return doc;
    }

    private static bool IsModelElement(Element? e) =>
        e != null && e is not ElementType && !e.ViewSpecific && e.Category is { CategoryType: CategoryType.Model };

    private static IEnumerable<Element> ModelElements(Document doc) =>
        new FilteredElementCollector(doc).WhereElementIsNotElementType().Where(IsModelElement);

    /// <summary>
    /// The GlobalId Revit's IFC exporter gives this element: the IfcGUID parameter when set, else the
    /// export id compressed to the IFC form.
    /// </summary>
    private static string GlobalIdOf(Document doc, Element e)
    {
        string? stored = e.get_Parameter(BuiltInParameter.IFC_GUID)?.AsString();
        return !string.IsNullOrWhiteSpace(stored) ? stored! : IfcGuid.FromGuid(ExportUtils.GetExportId(doc, e.Id));
    }

    private void BuildMap(Document doc)
    {
        var map = new Dictionary<string, ElementId>();
        foreach (var e in ModelElements(doc)) map[GlobalIdOf(doc, e)] = e.Id;
        _byGlobalId = map;
        _mapKey = KeyOf(doc);
    }
}
