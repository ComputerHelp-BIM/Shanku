using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Shanku.Revit.Core;

public sealed record DocumentInfo(string Title, string Key, string Path, bool IsFamily);
public sealed record ExportResult(byte[] Bytes, string Key, string Title);
public sealed record IdEntry(string GlobalId, string UniqueId, long ElementId);
public sealed record IdsResult(string Key, IReadOnlyList<IdEntry> Ids);
public sealed record SelectResult(int Selected, int Missing);

/// <summary>One instance parameter as Shanku shows it. Kind: text, number, integer, yesno, element.</summary>
/// <remarks>Unit: the project's display unit symbol for numbers ("mm", "m³"…), when it has one (0.4.0).</remarks>
public sealed record ParamInfo(long Id, string Name, string Group, string Kind, string? Display, bool ReadOnly, string? Why, string? Unit = null);
/// <summary>Params: instance parameters in the Properties palette's order. TypeParams: the type's (read-only for now).</summary>
public sealed record ElementParams(string GlobalId, long ElementId, string Category, string TypeName, IReadOnlyList<ParamInfo> Params, string FamilyName = "", IReadOnlyList<ParamInfo>? TypeParams = null);
/// <summary>A change to apply. OldDisplay is what Shanku read; a different current value is a conflict.</summary>
public sealed record ParamChange(string GlobalId, long ParamId, string Name, string? OldDisplay, string Value);
public sealed record ChangeResult(int Index, bool Ok, string? Error, string? NewDisplay);
public sealed record WriteResult(bool DryRun, string UndoName, IReadOnlyList<ChangeResult> Results, IReadOnlyList<string> Warnings);

/// <summary>What the server needs from Revit. The add-in implements it on Revit's main thread.</summary>
public interface IRevitHost
{
    string AddinVersion { get; }
    string RevitVersion { get; }
    /// <summary>Cached from Revit events, so it answers even while Revit shows a modal dialog.</summary>
    DocumentInfo? CurrentDocument { get; }
    Task<DocumentInfo?> GetDocumentAsync();
    Task<IReadOnlyList<string>> GetSelectionAsync();
    Task<ExportResult> ExportIfcAsync();
    Task<IdsResult> GetIdsAsync();
    Task<SelectResult> SetSelectionAsync(string key, IReadOnlyList<string> globalIds, IReadOnlyList<long> elementIds);
    /// <summary>Instance parameters of these elements (milestone 2).</summary>
    Task<IReadOnlyList<ElementParams>> ReadParamsAsync(string key, IReadOnlyList<string> globalIds);
    /// <summary>Applies changes in one Revit transaction (one undo); dryRun rolls everything back.</summary>
    Task<WriteResult> WriteParamsAsync(string key, IReadOnlyList<ParamChange> changes, bool dryRun);
}

/// <summary>A request the host could not serve, with the status and message to send back.</summary>
public sealed class BridgeException : Exception
{
    public int Status { get; }
    public BridgeException(int status, string message) : base(message) => Status = status;
}

/// <summary>
/// The bridge's HTTP server (docs/bridge/protocol.md): localhost only, CORS for Shanku's origins with
/// Chrome's local network access header, bearer tokens from pairing, and a server-sent event stream for
/// selection and document changes.
/// </summary>
public sealed class BridgeServer : IDisposable
{
    public const int Protocol = 1;
    /// <summary>What this add-in can do beyond protocol 1's basics (Shanku checks before offering it).</summary>
    public static readonly string[] Features = { "params" };
    public const int MaxReadElements = 500;
    public const int MaxChanges = 5000;
    private const string Prefix = "/shanku/v1";

    private readonly IRevitHost _host;
    private readonly Pairing _pairing;
    private readonly BridgeConfig _config;
    private readonly Action<string> _log;
    private readonly HttpListener _listener = new();
    private readonly List<StreamClient> _clients = new();
    private readonly object _clientsGate = new();
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);
    private CancellationTokenSource? _cts;
    private Timer? _ping;

    private sealed class StreamClient
    {
        public required HttpListenerResponse Response { get; init; }
        public readonly SemaphoreSlim Write = new(1, 1);
    }

    public BridgeServer(IRevitHost host, Pairing pairing, BridgeConfig config, Action<string>? log = null)
    {
        _host = host;
        _pairing = pairing;
        _config = config;
        _log = log ?? (_ => { });
        _listener.Prefixes.Add($"http://localhost:{config.Port}/");
    }

    public int Port => _config.Port;
    public bool IsRunning => _listener.IsListening;
    public int StreamCount { get { lock (_clientsGate) return _clients.Count; } }

    /// <summary>Starts listening; throws HttpListenerException when the port is taken.</summary>
    public void Start()
    {
        _listener.Start();
        _cts = new CancellationTokenSource();
        _ = Task.Run(() => AcceptLoop(_cts.Token));
        _ping = new Timer(_ => Ping(), null, TimeSpan.FromSeconds(15), TimeSpan.FromSeconds(15));
        _log($"Listening on http://localhost:{_config.Port}{Prefix}");
    }

    public void Dispose()
    {
        _ping?.Dispose();
        _cts?.Cancel();
        lock (_clientsGate)
        {
            foreach (var c in _clients) TryClose(c.Response);
            _clients.Clear();
        }
        try { _listener.Stop(); _listener.Close(); } catch { /* already closed */ }
    }

    /// <summary>Disconnect: ends every event stream (their tokens are revoked by Pairing).</summary>
    public void CloseStreams()
    {
        lock (_clientsGate)
        {
            foreach (var c in _clients) TryClose(c.Response);
            _clients.Clear();
        }
    }

    /// <summary>Sends an event to every open stream (selection or document changes).</summary>
    public void Broadcast(string evt, object data)
    {
        byte[] payload = Encoding.UTF8.GetBytes($"event: {evt}\ndata: {JsonSerializer.Serialize(data, _json)}\n\n");
        List<StreamClient> clients;
        lock (_clientsGate) clients = _clients.ToList();
        foreach (var c in clients) _ = WriteTo(c, payload);
    }

    private void Ping()
    {
        byte[] payload = Encoding.UTF8.GetBytes(": ping\n\n");
        List<StreamClient> clients;
        lock (_clientsGate) clients = _clients.ToList();
        foreach (var c in clients) _ = WriteTo(c, payload);
    }

    private async Task WriteTo(StreamClient c, byte[] payload)
    {
        await c.Write.WaitAsync().ConfigureAwait(false);
        try
        {
            await c.Response.OutputStream.WriteAsync(payload).ConfigureAwait(false);
            await c.Response.OutputStream.FlushAsync().ConfigureAwait(false);
        }
        catch
        {
            // the browser went away
            lock (_clientsGate) _clients.Remove(c);
            TryClose(c.Response);
        }
        finally
        {
            c.Write.Release();
        }
    }

    private async Task AcceptLoop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _listener.IsListening)
        {
            HttpListenerContext ctx;
            try { ctx = await _listener.GetContextAsync().ConfigureAwait(false); }
            catch { if (ct.IsCancellationRequested || !_listener.IsListening) return; continue; }
            _ = Task.Run(() => Handle(ctx));
        }
    }

    private async Task Handle(HttpListenerContext ctx)
    {
        var req = ctx.Request;
        var res = ctx.Response;
        bool keepOpen = false;
        try
        {
            // CORS: Shanku's origins only; other sites get nothing they can read.
            string? origin = req.Headers["Origin"];
            if (origin != null)
            {
                if (!_config.IsAllowedOrigin(origin))
                {
                    await Send(res, 403, new { error = "This site is not allowed to use the Shanku bridge." });
                    return;
                }
                res.Headers["Access-Control-Allow-Origin"] = origin;
                res.Headers["Vary"] = "Origin";
                res.Headers["Access-Control-Expose-Headers"] = "X-Shanku-Document-Key, X-Shanku-Document-Title";
            }
            if (req.HttpMethod == "OPTIONS")
            {
                res.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                res.Headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
                res.Headers["Access-Control-Max-Age"] = "600";
                // Chrome's local network access (private network access) preflight
                if (req.Headers["Access-Control-Request-Private-Network"] != null) res.Headers["Access-Control-Allow-Private-Network"] = "true";
                res.StatusCode = 204;
                res.Close();
                return;
            }

            string path = req.Url?.AbsolutePath ?? "";
            if (!path.StartsWith(Prefix, StringComparison.Ordinal))
            {
                await Send(res, 404, new { error = "Not found" });
                return;
            }
            string route = path.Substring(Prefix.Length);
            string method = req.HttpMethod;

            if (method == "GET" && route == "/hello")
            {
                // no Revit API call here: it must answer while Revit shows the pairing dialog
                await Send(res, 200, new { service = "shanku-revit", protocol = Protocol, addin = _host.AddinVersion, revit = _host.RevitVersion, pairingOpen = _pairing.PairingOpen, hasDocument = _host.CurrentDocument != null, features = Features });
                return;
            }
            if (method == "POST" && route == "/pair")
            {
                var body = await ReadJson(req);
                string? code = body.TryGetProperty("code", out var c) ? c.GetString() : null;
                string? token = _pairing.TryPair(code);
                if (token == null)
                {
                    await Send(res, 403, new { error = _pairing.PairingOpen ? "That code is not right." : "No code is showing in Revit. Click Shanku → Connect in Revit for a new one." });
                    return;
                }
                _log("Paired with Shanku");
                await Send(res, 200, new { token });
                return;
            }

            // everything else needs a token
            string? auth = req.Headers["Authorization"];
            string? tokenIn = auth != null && auth.StartsWith("Bearer ", StringComparison.Ordinal) ? auth.Substring(7) : req.QueryString["token"];
            if (!_pairing.IsValid(tokenIn))
            {
                await Send(res, 401, new { error = "Not paired. Click Shanku → Connect in Revit and enter the code in Shanku." });
                return;
            }

            switch (method, route)
            {
                case ("GET", "/status"):
                {
                    var doc = await _host.GetDocumentAsync();
                    var sel = doc != null ? await _host.GetSelectionAsync() : Array.Empty<string>();
                    await Send(res, 200, new { document = doc, selection = sel });
                    return;
                }
                case ("POST", "/model/export"):
                {
                    var r = await _host.ExportIfcAsync();
                    res.Headers["X-Shanku-Document-Key"] = r.Key;
                    res.Headers["X-Shanku-Document-Title"] = Uri.EscapeDataString(r.Title);
                    res.ContentType = "application/octet-stream";
                    res.ContentLength64 = r.Bytes.LongLength;
                    res.StatusCode = 200;
                    await res.OutputStream.WriteAsync(r.Bytes);
                    res.Close();
                    return;
                }
                case ("GET", "/model/ids"):
                {
                    var r = await _host.GetIdsAsync();
                    await Send(res, 200, new { key = r.Key, ids = r.Ids.Select(i => new object[] { i.GlobalId, i.UniqueId, i.ElementId }) });
                    return;
                }
                case ("POST", "/selection"):
                {
                    var body = await ReadJson(req);
                    string key = body.TryGetProperty("key", out var k) ? k.GetString() ?? "" : "";
                    var gids = body.TryGetProperty("globalIds", out var g) && g.ValueKind == JsonValueKind.Array ? g.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).ToArray() : Array.Empty<string>();
                    var eids = body.TryGetProperty("elementIds", out var e) && e.ValueKind == JsonValueKind.Array ? e.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.Number).Select(x => x.GetInt64()).ToArray() : Array.Empty<long>();
                    var r = await _host.SetSelectionAsync(key, gids, eids);
                    await Send(res, 200, new { selected = r.Selected, missing = r.Missing });
                    return;
                }
                case ("POST", "/params/read"):
                {
                    var body = await ReadJson(req);
                    string key = body.TryGetProperty("key", out var k) ? k.GetString() ?? "" : "";
                    var gids = body.TryGetProperty("globalIds", out var g) && g.ValueKind == JsonValueKind.Array ? g.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).Distinct().ToArray() : Array.Empty<string>();
                    if (gids.Length > MaxReadElements) throw new BridgeException(400, $"Select {MaxReadElements} or fewer elements to read their parameters.");
                    var r = await _host.ReadParamsAsync(key, gids);
                    await Send(res, 200, new { elements = r });
                    return;
                }
                case ("POST", "/params/write"):
                {
                    var body = await ReadJson(req);
                    string key = body.TryGetProperty("key", out var k) ? k.GetString() ?? "" : "";
                    bool dry = body.TryGetProperty("dryRun", out var d) && d.ValueKind == JsonValueKind.True;
                    if (!body.TryGetProperty("changes", out var ch) || ch.ValueKind != JsonValueKind.Array) throw new BridgeException(400, "No changes were sent.");
                    var changes = new List<ParamChange>();
                    foreach (var c in ch.EnumerateArray())
                    {
                        string gid = c.TryGetProperty("globalId", out var a) ? a.GetString() ?? "" : "";
                        long pid = c.TryGetProperty("paramId", out var pi) && pi.TryGetInt64(out var pv) ? pv : 0;
                        string name = c.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                        string? old = c.TryGetProperty("oldDisplay", out var o) && o.ValueKind == JsonValueKind.String ? o.GetString() : null;
                        string value = c.TryGetProperty("value", out var v) ? (v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : v.ToString()) : "";
                        if (gid.Length == 0 || name.Length == 0) throw new BridgeException(400, "Each change needs a globalId and a parameter name.");
                        changes.Add(new ParamChange(gid, pid, name, old, value));
                    }
                    if (changes.Count > MaxChanges) throw new BridgeException(400, $"At most {MaxChanges} changes at a time.");
                    var r = await _host.WriteParamsAsync(key, changes, dry);
                    await Send(res, 200, r);
                    return;
                }
                case ("GET", "/events"):
                {
                    res.ContentType = "text/event-stream";
                    res.Headers["Cache-Control"] = "no-cache";
                    res.SendChunked = true;
                    res.StatusCode = 200;
                    var client = new StreamClient { Response = res };
                    lock (_clientsGate) _clients.Add(client);
                    keepOpen = true;
                    // tell the new stream where things stand (cached: no wait on Revit)
                    await WriteTo(client, Encoding.UTF8.GetBytes($"event: document\ndata: {JsonSerializer.Serialize(new { document = _host.CurrentDocument }, _json)}\n\n"));
                    return;
                }
            }
            await Send(res, 404, new { error = "Not found" });
        }
        catch (BridgeException bx)
        {
            if (!keepOpen) await Send(res, bx.Status, new { error = bx.Message });
        }
        catch (Exception ex)
        {
            _log($"Error: {ex}");
            if (!keepOpen) await Send(res, 500, new { error = ex.Message });
        }
    }

    private static async Task<JsonElement> ReadJson(HttpListenerRequest req)
    {
        using var reader = new StreamReader(req.InputStream, Encoding.UTF8);
        string text = await reader.ReadToEndAsync();
        if (string.IsNullOrWhiteSpace(text)) return JsonDocument.Parse("{}").RootElement;
        try { return JsonDocument.Parse(text).RootElement; }
        catch (JsonException) { throw new BridgeException(400, "The request body is not valid JSON."); }
    }

    private async Task Send(HttpListenerResponse res, int status, object body)
    {
        try
        {
            byte[] bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(body, _json));
            res.StatusCode = status;
            res.ContentType = "application/json; charset=utf-8";
            res.ContentLength64 = bytes.Length;
            await res.OutputStream.WriteAsync(bytes);
        }
        catch { /* client gone */ }
        finally { TryClose(res); }
    }

    private static void TryClose(HttpListenerResponse res)
    {
        try { res.Close(); } catch { /* already closed */ }
    }
}
