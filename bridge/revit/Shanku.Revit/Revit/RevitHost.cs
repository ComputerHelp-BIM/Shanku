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

    public Task<IReadOnlyList<ElementParams>> ReadParamsAsync(string key, IReadOnlyList<string> globalIds) => _queue.Run<IReadOnlyList<ElementParams>>(ui =>
    {
        var doc = RequireProject(ui);
        RequireKey(doc, key);
        if (_mapKey != KeyOf(doc) || globalIds.Any(g => !_byGlobalId.ContainsKey(g))) BuildMap(doc);
        var list = new List<ElementParams>();
        foreach (var gid in globalIds)
        {
            if (!_byGlobalId.TryGetValue(gid, out var id) || doc.GetElement(id) is not { } e) continue;
            var type = doc.GetElement(e.GetTypeId()) as ElementType;
            list.Add(new ElementParams(gid, e.Id.Value, e.Category?.Name ?? "", type?.Name ?? "", PaletteParams(e, forceReadOnly: false), type?.FamilyName ?? "", type != null ? PaletteParams(type, forceReadOnly: true) : Array.Empty<ParamInfo>()));
        }
        return list;
    }, Export);

    public Task<WriteResult> WriteParamsAsync(string key, IReadOnlyList<ParamChange> changes, bool dryRun) => _queue.Run(ui =>
    {
        var doc = RequireProject(ui);
        RequireKey(doc, key);
        if (_mapKey != KeyOf(doc) || changes.Any(c => !_byGlobalId.ContainsKey(c.GlobalId))) BuildMap(doc);
        int elements = changes.Select(c => c.GlobalId).Distinct().Count();
        string undoName = $"Shanku: update {changes.Count} parameter{(changes.Count == 1 ? "" : "s")} on {elements} element{(elements == 1 ? "" : "s")}";
        var results = new List<ChangeResult>();
        var warnings = new List<string>();
        // Dry run: a transaction group that is always rolled back. The inner transaction still commits,
        // so Revit raises its warnings (they only appear on commit); the group rollback then undoes it
        // whether or not any warning came up.
        using var group = dryRun ? new TransactionGroup(doc, "Shanku: check " + undoName) : null;
        group?.Start();
        using var t = new Transaction(doc, undoName);
        var opts = t.GetFailureHandlingOptions();
        opts.SetFailuresPreprocessor(new WarningCollector(warnings));
        t.SetFailureHandlingOptions(opts);
        t.Start();
        for (int i = 0; i < changes.Count; i++)
        {
            var c = changes[i];
            string? error = null;
            string? after = null;
            // one sub-transaction per change: a failure never blocks the others
            using var st = new SubTransaction(doc);
            try
            {
                st.Start();
                if (!_byGlobalId.TryGetValue(c.GlobalId, out var id) || doc.GetElement(id) is not { } e) throw new InvalidOperationException("The element is no longer in the Revit model.");
                var p = FindParam(e, c.ParamId, c.Name) ?? throw new InvalidOperationException($"{e.Category?.Name} has no parameter \"{c.Name}\".");
                if (p.IsReadOnly || KindOf(p) == "element") throw new InvalidOperationException($"\"{c.Name}\" is read-only in Revit.");
                if (doc.IsWorkshared && WorksharingUtils.GetCheckoutStatus(doc, e.Id, out string owner) == CheckoutStatus.OwnedByOtherUser)
                    throw new InvalidOperationException($"Borrowed by {owner} in the central model.");
                string now = DisplayOf(p) ?? "";
                if (c.OldDisplay != null && now != c.OldDisplay) throw new InvalidOperationException($"Changed in Revit since Shanku read it (now \"{now}\"). Refresh, then edit again.");
                SetValue(p, c.Value);
                after = DisplayOf(p);
                st.Commit();
            }
            catch (Exception ex)
            {
                if (st.HasStarted() && !st.HasEnded()) st.RollBack();
                error = ex.Message;
            }
            results.Add(new ChangeResult(i, error == null, error, after));
        }
        if (results.All(r => !r.Ok)) t.RollBack(); // nothing to keep
        else if (t.Commit() != TransactionStatus.Committed && !dryRun) throw new BridgeException(500, "Revit did not accept the changes (the transaction was rolled back).");
        group?.RollBack(); // dry run: always undone
        return new WriteResult(dryRun, undoName, results, warnings.Distinct().ToList());
    }, Export);

    /// <summary>
    /// The parameters the Properties palette shows, in its order: GetOrderedParameters() leaves out the
    /// hidden copies Revit keeps for schedules (a second "Base Level", "Base Offset", "Category"...).
    /// A name that still repeats within a group is kept once.
    /// </summary>
    private static List<ParamInfo> PaletteParams(Element e, bool forceReadOnly)
    {
        var ps = new List<ParamInfo>();
        var seen = new HashSet<string>();
        foreach (Parameter p in e.GetOrderedParameters())
        {
            if (p.Definition == null || string.IsNullOrEmpty(p.Definition.Name)) continue;
            string group;
            try { group = LabelUtils.GetLabelForGroup(p.Definition.GetGroupTypeId()); } catch { group = "Other"; }
            if (string.IsNullOrEmpty(group)) group = "Other";
            if (!seen.Add(group + "\u0001" + p.Definition.Name)) continue;
            string kind = KindOf(p);
            bool ro = forceReadOnly || p.IsReadOnly || kind == "element";
            string? why = forceReadOnly ? "Type parameter: edit it in Revit (Edit Type) for now" : kind == "element" ? "Choose it in Revit" : p.IsReadOnly ? "Read-only in Revit" : null;
            ps.Add(new ParamInfo(p.Id.Value, p.Definition.Name, group, kind, DisplayOf(p), ro, why));
        }
        return ps;
    }

    /// <summary>Revit warnings (duplicate marks and the like) are reported, not shown as dialogs.</summary>
    private sealed class WarningCollector : IFailuresPreprocessor
    {
        private readonly List<string> _warnings;
        public WarningCollector(List<string> warnings) => _warnings = warnings;
        public FailureProcessingResult PreprocessFailures(FailuresAccessor fa)
        {
            foreach (var m in fa.GetFailureMessages())
            {
                if (m.GetSeverity() != FailureSeverity.Warning) continue;
                _warnings.Add(m.GetDescriptionText().TrimEnd('.', ' ') + ".");
                fa.DeleteWarning(m); // reported to Shanku instead of a dialog
            }
            return FailureProcessingResult.Continue;
        }
    }

    private static string KindOf(Parameter p) => p.StorageType switch
    {
        StorageType.String => "text",
        StorageType.Double => "number",
        StorageType.ElementId => "element",
        StorageType.Integer => p.Definition.GetDataType() == SpecTypeId.Boolean.YesNo ? "yesno" : "integer",
        _ => "element",
    };

    /// <summary>The value as Revit shows it (with the project's units for numbers).</summary>
    private static string? DisplayOf(Parameter p) => p.StorageType switch
    {
        StorageType.String => p.AsString() ?? "",
        StorageType.Integer when KindOf(p) == "yesno" => p.AsInteger() == 1 ? "Yes" : "No",
        StorageType.Integer => p.AsInteger().ToString(System.Globalization.CultureInfo.InvariantCulture),
        StorageType.Double => p.AsValueString() ?? p.AsDouble().ToString(System.Globalization.CultureInfo.InvariantCulture),
        StorageType.ElementId => p.AsValueString(),
        _ => null,
    };

    private static void SetValue(Parameter p, string value)
    {
        switch (KindOf(p))
        {
            case "text":
                p.Set(value);
                break;
            case "yesno":
                string v = value.Trim().ToLowerInvariant();
                p.Set(v is "yes" or "1" or "true" or "on" ? 1 : v is "no" or "0" or "false" or "off" or "" ? 0 : throw new InvalidOperationException($"\"{value}\" is not Yes or No."));
                break;
            case "integer":
                if (!int.TryParse(value.Trim(), out int n)) throw new InvalidOperationException($"\"{value}\" is not a whole number.");
                p.Set(n);
                break;
            case "number":
                // Revit reads the text in the project's units ("600" = 600 mm in a millimetre project).
                if (!p.SetValueString(value.Trim())) throw new InvalidOperationException($"Revit could not read \"{value}\" as a {LabelUtils.GetLabelForSpec(p.Definition.GetDataType()).ToLowerInvariant()}.");
                break;
            default:
                throw new InvalidOperationException("This parameter is chosen in Revit.");
        }
    }

    private static Parameter? FindParam(Element e, long id, string name)
    {
        foreach (Parameter p in e.Parameters) if (p.Id.Value == id && p.Definition?.Name == name) return p;
        return e.LookupParameter(name);
    }

    private static void RequireKey(Document doc, string key)
    {
        if (!string.IsNullOrEmpty(key) && key != KeyOf(doc)) throw new BridgeException(409, $"Revit is showing a different model ({doc.Title}).");
    }

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
