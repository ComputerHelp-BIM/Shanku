using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Shanku.Revit.Core;
using Xunit;

namespace Shanku.Revit.Tests;

public class IfcGuidTests
{
    // Expected values from IfcOpenShell (ifcopenshell.guid.compress), the reference implementation.
    [Theory]
    [InlineData("00000000-0000-0000-0000-000000000000", "0000000000000000000000")]
    [InlineData("0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9", "0A6omzJbzWSOAJfBN6r_Zv")]
    [InlineData("ffffffff-ffff-ffff-ffff-ffffffffffff", "3$$$$$$$$$$$$$$$$$$$$$")]
    [InlineData("3f2504e0-4f89-11d3-9a0c-0305e82c3301", "0$9GJWJuaHqveC0mNeB3C1")]
    public void Matches_ifcopenshell(string guid, string expected) => Assert.Equal(expected, IfcGuid.FromGuid(Guid.Parse(guid)));
}

public class PairingTests
{
    private DateTime _now = new(2026, 9, 24, 12, 0, 0, DateTimeKind.Utc);
    private Pairing Make(string? store = null) => new(store, () => _now);

    [Fact]
    public void Code_works_once()
    {
        var p = Make();
        string code = p.NewCode();
        Assert.Matches("^[0-9]{6}$", code);
        string? token = p.TryPair(code);
        Assert.NotNull(token);
        Assert.True(p.IsValid(token));
        Assert.Null(p.TryPair(code)); // used
    }

    [Fact]
    public void Code_expires_after_five_minutes()
    {
        var p = Make();
        string code = p.NewCode();
        _now += TimeSpan.FromMinutes(5) + TimeSpan.FromSeconds(1);
        Assert.False(p.PairingOpen);
        Assert.Null(p.TryPair(code));
    }

    [Fact]
    public void Five_wrong_codes_void_it()
    {
        var p = Make();
        string code = p.NewCode();
        string wrong = code == "000000" ? "111111" : "000000";
        for (int i = 0; i < Pairing.MaxFailures; i++) Assert.Null(p.TryPair(wrong));
        Assert.Null(p.TryPair(code)); // voided: Revit must show a new one
        Assert.False(p.PairingOpen);
    }

    [Fact]
    public void Tokens_survive_a_restart_as_hashes_and_revoke()
    {
        string store = Path.Combine(Path.GetTempPath(), $"shanku-test-{Guid.NewGuid():N}.json");
        try
        {
            var p = Make(store);
            string token = p.TryPair(p.NewCode())!;
            Assert.DoesNotContain(token, File.ReadAllText(store)); // only the hash is stored
            var again = Make(store);
            Assert.True(again.IsValid(token));
            again.RevokeAll();
            Assert.False(Make(store).IsValid(token));
        }
        finally { File.Delete(store); }
    }
}

public class ConfigTests
{
    [Theory]
    [InlineData("https://shanku.vercel.app", true)]
    [InlineData("https://shanku.vercel.app/", true)]
    [InlineData("https://shanku-git-main-computerhelp.vercel.app", true)]
    [InlineData("https://computerhelp-bim.github.io", true)]
    [InlineData("http://localhost:5173", true)]
    [InlineData("https://evil.example", false)]
    [InlineData("https://shanku.vercel.app.evil.example", false)]
    [InlineData("https://notshanku.vercel.app", false)]
    [InlineData(null, false)]
    public void Origins(string? origin, bool allowed) => Assert.Equal(allowed, new BridgeConfig().IsAllowedOrigin(origin));

    [Fact]
    public void Reads_port_and_extra_origins_and_ignores_bad_values()
    {
        string f = Path.GetTempFileName();
        File.WriteAllText(f, "{\"_readme\":[\"x\"],\"port\":7090,\"extraOrigins\":[\"https://intranet.example/\"]}");
        var c = BridgeConfig.Load(f);
        Assert.Equal(7090, c.Port);
        Assert.True(c.IsAllowedOrigin("https://intranet.example"));
        File.WriteAllText(f, "{\"port\":80}");
        Assert.Equal(BridgeConfig.DefaultPort, BridgeConfig.Load(f).Port); // privileged port refused
        File.WriteAllText(f, "not json");
        Assert.Equal(BridgeConfig.DefaultPort, BridgeConfig.Load(f).Port);
        File.Delete(f);
    }
}

/// <summary>A pretend Revit for the server tests.</summary>
internal sealed class FakeHost : IRevitHost
{
    public string AddinVersion => "0.1.0";
    public string RevitVersion => "2025";
    public DocumentInfo? CurrentDocument { get; set; } = new("Tower A", "key-a", @"C:\jobs\tower-a.rvt", false);
    public List<(string key, string[] gids)> Selections { get; } = new();
    public Task<DocumentInfo?> GetDocumentAsync() => Task.FromResult(CurrentDocument);
    public Task<IReadOnlyList<string>> GetSelectionAsync() => Task.FromResult<IReadOnlyList<string>>(new[] { "g1" });
    public Task<ExportResult> ExportIfcAsync() => Task.FromResult(new ExportResult(Encoding.ASCII.GetBytes("ISO-10303-21;"), "key-a", "Tower A"));
    public Task<IdsResult> GetIdsAsync() => Task.FromResult(new IdsResult("key-a", new[] { new IdEntry("g1", "u1", 101) }));
    // parameters: Mark (text, "C1"), Base Offset (number), Volume (read-only)
    public Dictionary<string, string> Marks { get; } = new() { ["g1"] = "C1" };
    public List<(IReadOnlyList<ParamChange> changes, bool dry)> Writes { get; } = new();
    public Task<IReadOnlyList<ElementParams>> ReadParamsAsync(string key, IReadOnlyList<string> globalIds) =>
        Task.FromResult<IReadOnlyList<ElementParams>>(globalIds.Where(Marks.ContainsKey).Select(g => new ElementParams(g, 101, "Structural Columns", "C 300x600", new[]
        {
            new ParamInfo(-1001203, "Mark", "Identity Data", "text", Marks[g], false, null),
            new ParamInfo(-1001107, "Base Offset", "Constraints", "number", "0 mm", false, null),
            new ParamInfo(-1012806, "Volume", "Dimensions", "number", "0.540 m³", true, "Read-only in Revit"),
        })).ToList());
    public Task<WriteResult> WriteParamsAsync(string key, IReadOnlyList<ParamChange> changes, bool dryRun)
    {
        Writes.Add((changes, dryRun));
        var results = changes.Select((c, i) =>
            c.Name == "Volume" ? new ChangeResult(i, false, "\"Volume\" is read-only in Revit.", null)
            : c.Name == "Mark" && c.OldDisplay != null && Marks.TryGetValue(c.GlobalId, out var now) && now != c.OldDisplay ? new ChangeResult(i, false, $"Changed in Revit since Shanku read it (now \"{now}\").", null)
            : new ChangeResult(i, true, null, c.Value)).ToList();
        if (!dryRun) foreach (var (c, r) in changes.Zip(results)) if (r.Ok && c.Name == "Mark") Marks[c.GlobalId] = c.Value;
        return Task.FromResult(new WriteResult(dryRun, $"Shanku: update {changes.Count} parameters", results, new[] { "Elements have duplicate \"Mark\" values." }));
    }
    public Task<SelectResult> SetSelectionAsync(string key, IReadOnlyList<string> globalIds, IReadOnlyList<long> elementIds)
    {
        if (key != "key-a") throw new BridgeException(409, "Revit is showing a different model (Tower A).");
        Selections.Add((key, globalIds.ToArray()));
        return Task.FromResult(new SelectResult(globalIds.Count(g => g.StartsWith("g")), globalIds.Count(g => !g.StartsWith("g"))));
    }
}

public class ServerTests : IDisposable
{
    private static int _nextPort = 17071;
    private readonly FakeHost _host = new();
    private readonly Pairing _pairing = new(null);
    private readonly BridgeServer _server;
    private readonly HttpClient _http = new();
    private readonly string _base;
    private const string Origin = "https://shanku.vercel.app";

    public ServerTests()
    {
        int port = Interlocked.Increment(ref _nextPort);
        _server = new BridgeServer(_host, _pairing, new BridgeConfig { Port = port });
        _server.Start();
        _base = $"http://localhost:{port}/shanku/v1";
    }

    public void Dispose()
    {
        _server.Dispose();
        _http.Dispose();
    }

    private HttpRequestMessage Req(HttpMethod m, string path, string? origin = Origin, string? token = null, object? body = null)
    {
        var r = new HttpRequestMessage(m, _base + path);
        if (origin != null) r.Headers.Add("Origin", origin);
        if (token != null) r.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body != null) r.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        return r;
    }

    private async Task<string> Pair()
    {
        var res = await _http.SendAsync(Req(HttpMethod.Post, "/pair", body: new { code = _pairing.NewCode(), client = "test" }));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement.GetProperty("token").GetString()!;
    }

    [Fact]
    public async Task Hello_answers_with_cors_for_shanku()
    {
        var res = await _http.SendAsync(Req(HttpMethod.Get, "/hello"));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(Origin, res.Headers.GetValues("Access-Control-Allow-Origin").Single());
        var j = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("shanku-revit", j.GetProperty("service").GetString());
        Assert.Equal(1, j.GetProperty("protocol").GetInt32());
        Assert.True(j.GetProperty("hasDocument").GetBoolean());
    }

    [Fact]
    public async Task Other_sites_are_refused()
    {
        var res = await _http.SendAsync(Req(HttpMethod.Get, "/hello", origin: "https://evil.example"));
        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.False(res.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Preflight_allows_local_network_access()
    {
        var r = Req(HttpMethod.Options, "/status");
        r.Headers.Add("Access-Control-Request-Method", "GET");
        r.Headers.Add("Access-Control-Request-Private-Network", "true");
        var res = await _http.SendAsync(r);
        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
        Assert.Equal("true", res.Headers.GetValues("Access-Control-Allow-Private-Network").Single());
        Assert.Contains("Authorization", res.Headers.GetValues("Access-Control-Allow-Headers").Single());
    }

    [Fact]
    public async Task Needs_a_token_then_serves_status_export_ids_and_selection()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _http.SendAsync(Req(HttpMethod.Get, "/status"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _http.SendAsync(Req(HttpMethod.Post, "/pair", body: new { code = "nope" }))).StatusCode);
        string token = await Pair();

        var status = JsonDocument.Parse(await (await _http.SendAsync(Req(HttpMethod.Get, "/status", token: token))).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("key-a", status.GetProperty("document").GetProperty("key").GetString());

        var export = await _http.SendAsync(Req(HttpMethod.Post, "/model/export", token: token));
        Assert.Equal("ISO-10303-21;", await export.Content.ReadAsStringAsync());
        Assert.Equal("key-a", export.Headers.GetValues("X-Shanku-Document-Key").Single());
        Assert.Contains("X-Shanku-Document-Key", export.Headers.GetValues("Access-Control-Expose-Headers").Single());

        var ids = JsonDocument.Parse(await (await _http.SendAsync(Req(HttpMethod.Get, "/model/ids", token: token))).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("g1", ids.GetProperty("ids")[0][0].GetString());
        Assert.Equal(101, ids.GetProperty("ids")[0][2].GetInt64());

        var sel = JsonDocument.Parse(await (await _http.SendAsync(Req(HttpMethod.Post, "/selection", token: token, body: new { key = "key-a", globalIds = new[] { "g1", "x9" } }))).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(1, sel.GetProperty("selected").GetInt32());
        Assert.Equal(1, sel.GetProperty("missing").GetInt32());

        var wrongDoc = await _http.SendAsync(Req(HttpMethod.Post, "/selection", token: token, body: new { key = "key-b", globalIds = new[] { "g1" } }));
        Assert.Equal(HttpStatusCode.Conflict, wrongDoc.StatusCode);
        Assert.Contains("different model", await wrongDoc.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Event_stream_sends_document_then_broadcasts()
    {
        string token = await Pair();
        var req = Req(HttpMethod.Get, $"/events?token={token}");
        var res = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead);
        Assert.Equal("text/event-stream", res.Content.Headers.ContentType!.MediaType);
        using var reader = new StreamReader(await res.Content.ReadAsStreamAsync());
        async Task<string> NextEvent()
        {
            var sb = new StringBuilder();
            string? line;
            while ((line = await reader.ReadLineAsync()) != null && line.Length > 0) sb.AppendLine(line);
            return sb.ToString();
        }
        Assert.Contains("event: document", await NextEvent());
        for (int i = 0; i < 50 && _server.StreamCount == 0; i++) await Task.Delay(20);
        _server.Broadcast("selection", new { key = "key-a", globalIds = new[] { "g1" } });
        string evt = await NextEvent();
        Assert.Contains("event: selection", evt);
        Assert.Contains("\"globalIds\":[\"g1\"]", evt);
    }

    [Fact]
    public async Task Disconnect_revokes_tokens()
    {
        string token = await Pair();
        _pairing.RevokeAll();
        _server.CloseStreams();
        Assert.Equal(HttpStatusCode.Unauthorized, (await _http.SendAsync(Req(HttpMethod.Get, "/status", token: token))).StatusCode);
    }

    [Fact]
    public async Task Hello_lists_the_params_feature()
    {
        var j = JsonDocument.Parse(await (await _http.SendAsync(Req(HttpMethod.Get, "/hello"))).Content.ReadAsStringAsync()).RootElement;
        Assert.Contains("params", j.GetProperty("features").EnumerateArray().Select(x => x.GetString()));
    }

    [Fact]
    public async Task Reads_and_writes_parameters_with_dry_run_conflicts_and_limits()
    {
        string token = await Pair();
        var read = JsonDocument.Parse(await (await _http.SendAsync(Req(HttpMethod.Post, "/params/read", token: token, body: new { key = "key-a", globalIds = new[] { "g1", "nope" } }))).Content.ReadAsStringAsync()).RootElement;
        var el = read.GetProperty("elements")[0];
        Assert.Equal("g1", el.GetProperty("globalId").GetString());
        Assert.Equal("Mark", el.GetProperty("params")[0].GetProperty("name").GetString());
        Assert.True(el.GetProperty("params")[2].GetProperty("readOnly").GetBoolean());

        var tooMany = await _http.SendAsync(Req(HttpMethod.Post, "/params/read", token: token, body: new { key = "key-a", globalIds = Enumerable.Range(0, BridgeServer.MaxReadElements + 1).Select(i => $"g{i}").ToArray() }));
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);

        // dry run: nothing kept
        var dry = JsonDocument.Parse(await (await _http.SendAsync(Req(HttpMethod.Post, "/params/write", token: token, body: new { key = "key-a", dryRun = true, changes = new object[] { new { globalId = "g1", paramId = -1001203, name = "Mark", oldDisplay = "C1", value = "C1A" } } }))).Content.ReadAsStringAsync()).RootElement;
        Assert.True(dry.GetProperty("dryRun").GetBoolean());
        Assert.True(dry.GetProperty("results")[0].GetProperty("ok").GetBoolean());
        Assert.Equal("C1", _host.Marks["g1"]);

        // apply: one ok, one read-only refused; warnings reported
        var body = new { key = "key-a", changes = new object[] { new { globalId = "g1", paramId = -1001203, name = "Mark", oldDisplay = "C1", value = "C1A" }, new { globalId = "g1", paramId = -1012806, name = "Volume", oldDisplay = "0.540 m³", value = "1" } } };
        var w = JsonDocument.Parse(await (await _http.SendAsync(Req(HttpMethod.Post, "/params/write", token: token, body: body))).Content.ReadAsStringAsync()).RootElement;
        Assert.True(w.GetProperty("results")[0].GetProperty("ok").GetBoolean());
        Assert.False(w.GetProperty("results")[1].GetProperty("ok").GetBoolean());
        Assert.Contains("read-only", w.GetProperty("results")[1].GetProperty("error").GetString());
        Assert.Contains("duplicate", w.GetProperty("warnings")[0].GetString());
        Assert.Equal("C1A", _host.Marks["g1"]);

        // the same edit again, based on the old value: a conflict
        var again = JsonDocument.Parse(await (await _http.SendAsync(Req(HttpMethod.Post, "/params/write", token: token, body: new { key = "key-a", changes = new object[] { new { globalId = "g1", paramId = -1001203, name = "Mark", oldDisplay = "C1", value = "C9" } } }))).Content.ReadAsStringAsync()).RootElement;
        Assert.Contains("Changed in Revit", again.GetProperty("results")[0].GetProperty("error").GetString());

        var bad = await _http.SendAsync(Req(HttpMethod.Post, "/params/write", token: token, body: new { key = "key-a" }));
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }
}
