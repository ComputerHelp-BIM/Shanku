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

public class NumberTextTests
{
    [Theory]
    [InlineData("600", 600, "")]
    [InlineData("600.000", 600, "")]
    [InlineData(" 600,5 mm ", 600.5, "mm")]
    [InlineData("0.6 m", 0.6, "m")]
    [InlineData("-150mm", -150, "mm")]
    [InlineData("12 m³", 12, "m³")]
    public void Reads_values_and_units(string text, double value, string unit)
    {
        var (v, u) = NumberText.Parse(text);
        Assert.Equal(value, v, 9);
        Assert.Equal(unit, u);
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("6 00")]
    [InlineData("")]
    public void Refuses_non_numbers(string text) => Assert.Throws<FormatException>(() => NumberText.Parse(text));
}

public class ExportPlannerTests
{
    private static readonly ExportConfig C = new();
    private static ExchangeElement El(string kind, Action<ExchangeElement>? f = null)
    {
        var e = new ExchangeElement { Id = "DXF:1A:L2", Kind = kind, Mark = "X", Level = "L2", Z0 = 0, Z1 = 3000 };
        f?.Invoke(e);
        return e;
    }

    [Fact]
    public void Levels_match_by_name_then_elevation_else_create()
    {
        var wanted = new[] { new ExchangeLevel { Name = "Ground", Elevation = 0 }, new ExchangeLevel { Name = "02 FIRST", Elevation = 3000 }, new ExchangeLevel { Name = "Terrace", Elevation = 6000 } };
        var existing = new List<(string, double)> { ("01 GROUND LVL.", 0.4), ("02 FIRST", 3150) };
        var p = ExportPlanner.MatchLevels(wanted, existing, 1);
        Assert.Equal(("same-elevation", "01 GROUND LVL."), (p[0].Action, p[0].RevitName)); // the template's ground level is reused
        Assert.Equal(("exists-elsewhere", "02 FIRST"), (p[1].Action, p[1].RevitName)); // same name, other height: reused and flagged
        Assert.Equal(("create", "Terrace"), (p[2].Action, p[2].RevitName));
    }

    [Fact]
    public void Type_names_follow_the_template_patterns()
    {
        Assert.Equal(("CH-Concrete-Rectangular-Column", "CH-300 X 600"), Pick(ExportPlanner.TypeFor(El("column", e => { e.Width = 300; e.Length = 600; }), C)));
        Assert.Equal(("CH-Concrete-Round-Column", "CH-450"), Pick(ExportPlanner.TypeFor(El("column", e => { e.Shape = "round"; e.Diameter = 449.6; }), C)));
        Assert.Equal(("CH-Concrete-Rectangular-Beam", "CH-230 X 600"), Pick(ExportPlanner.TypeFor(El("beam", e => { e.Width = 230; e.Depth = 600; }), C)));
        Assert.Equal(("CH-Concrete-Rectangular-Footing", "CH-1200 X 1800 X 600"), Pick(ExportPlanner.TypeFor(El("footing", e => { e.Width = 1200; e.Length = 1800; e.Thickness = 600; }), C)));
        Assert.Equal("CH-PCC-1400 X 2000 X 150", ExportPlanner.TypeFor(El("pcc", e => { e.Width = 1400; e.Length = 2000; e.Thickness = 150; }), C).Type);
        Assert.Equal("150 THK. RCC SLAB", ExportPlanner.TypeFor(El("slab", e => e.Thickness = 150), C).Type);
        Assert.Equal("CH-SHEAR-WALL-230", ExportPlanner.TypeFor(El("wall", e => { e.Width = 230; e.Material = "RCC"; }), C).Type);
        Assert.Equal("CH-PARDI-WALL-115", ExportPlanner.TypeFor(El("wall", e => { e.Width = 115; e.Material = "Brick"; }), C).Type);
    }
    private static (string, string) Pick((string Family, string Type, string Group) t) => (t.Family, t.Type);

    [Fact]
    public void Elements_host_on_their_own_level_the_top_of_their_storey()
    {
        // Pipeline 2.0.0: Level 1 is ±0 (foundations below it), Level n the top of storey n.
        var levels = new List<ExchangeLevel> { new() { Name = "Level 1", Elevation = 0, Foundation = true }, new() { Name = "Level 4", Elevation = 9000 }, new() { Name = "Level 5", Elevation = 12000 } };
        var column = new ExchangeElement { Level = "Level 5", Z0 = 9000, Z1 = 12000 };
        Assert.Equal("Level 5", ExportPlanner.OwnLevel(levels, column).Name); // top on its own level
        Assert.Equal("Level 4", ExportPlanner.BaseLevel(levels, column).Name); // base on the level below: Level 4 -> Level 5
        var sunkBeam = new ExchangeElement { Level = "Level 5", Z0 = 9900, Z1 = 10500 }; // sunk 1500: still hangs from Level 5
        Assert.Equal("Level 5", ExportPlanner.OwnLevel(levels, sunkBeam).Name);
        var pedestal = new ExchangeElement { Level = "Level 1", Z0 = -1500, Z1 = 0 }; // below ±0: own level, negative base offset
        Assert.Equal("Level 1", ExportPlanner.BaseLevel(levels, pedestal).Name);
        var unknown = new ExchangeElement { Level = "Level 9", Z0 = 9000, Z1 = 11990 };
        Assert.Equal("Level 5", ExportPlanner.OwnLevel(levels, unknown).Name); // no such level: the nearest to its top
    }

    [Fact]
    public void A_level_with_the_same_name_at_another_height_is_flagged()
    {
        var p = ExportPlanner.MatchLevels(new[] { new ExchangeLevel { Name = "Level 3", Elevation = 6000 } }, new List<(string, double)> { ("Level 3", 3000) }, 1);
        Assert.Equal(("exists-elsewhere", "Level 3", 3000.0), (p[0].Action, p[0].RevitName, p[0].RevitElevation));
    }

    [Fact]
    public void Problems_are_named_before_anything_is_built()
    {
        Assert.Null(ExportPlanner.Problem(El("column", e => { e.Center = new[] { 0.0, 0 }; e.Width = 230; e.Length = 500; })));
        Assert.Contains("centre", ExportPlanner.Problem(El("column")));
        Assert.Contains("top", ExportPlanner.Problem(El("beam", e => e.Z1 = -1)));
        Assert.Contains("start", ExportPlanner.Problem(El("beam", e => { e.Start = new[] { 0.0, 0 }; e.End = new[] { 0.0, 0 }; e.Width = 230; })));
        Assert.Contains("outline", ExportPlanner.Problem(El("slab", e => e.Thickness = 125)));
        Assert.Contains("kind", ExportPlanner.Problem(El("window")));
    }

    [Fact]
    public void Footprint_of_a_turned_rectangle()
    {
        var (hx, hy) = ExportPlanner.Footprint(230, 500, 90); // long side along Y
        Assert.Equal(115, hx, 6);
        Assert.Equal(250, hy, 6);
        var (ax, ay) = ExportPlanner.Footprint(230, 500, 0);
        Assert.Equal((250.0, 115.0), (Math.Round(ax, 6), Math.Round(ay, 6)));
    }

    [Fact]
    public void Config_reads_overrides_and_survives_a_broken_file()
    {
        string f = Path.GetTempFileName();
        File.WriteAllText(f, "{ \"_readme\": [\"x\"], \"rccWallTypeName\": \"CH-RCC-WALL-{T}\", \"checkToleranceMm\": 10, }");
        var c = ExportConfig.Load(f);
        Assert.Equal("CH-RCC-WALL-{T}", c.RccWallTypeName);
        Assert.Equal(10, c.CheckToleranceMm);
        Assert.Equal("CH-{W} X {H}", c.BeamTypeName); // untouched keys keep the template defaults
        File.WriteAllText(f, "{ not json");
        Assert.Equal("CH-SHEAR-WALL-{T}", ExportConfig.Load(f).RccWallTypeName);
        File.Delete(f);
    }
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
    public List<IReadOnlyList<string>?> Exports { get; } = new();
    public Task<ExportResult> ExportIfcAsync(IReadOnlyList<string>? globalIds = null)
    {
        Exports.Add(globalIds);
        return Task.FromResult(new ExportResult(Encoding.ASCII.GetBytes(globalIds == null ? "ISO-10303-21;" : $"PARTIAL {globalIds.Count}"), "key-a", "Tower A"));
    }
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
    public Task<CreateReport> CreateModelAsync(string key, ExchangeModel exchange, bool dryRun) =>
        Task.FromResult(new CreateReport(dryRun, "Shanku: export", new[] { new LevelPlan("L1", 0, "exists", "01 GROUND LVL.") }, Array.Empty<TypePlan>(),
            exchange.Elements.Select(e => new CreateResult(e.Id, true, TypeName: "CH-300 X 600")).ToList(), Array.Empty<string>(), Array.Empty<string>()));
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

    [Fact]
    public async Task Exports_only_listed_elements_for_a_live_update()
    {
        string token = await Pair();
        var hello = JsonDocument.Parse(await (await _http.SendAsync(Req(HttpMethod.Get, "/hello"))).Content.ReadAsStringAsync()).RootElement;
        var features = hello.GetProperty("features").EnumerateArray().Select(x => x.GetString()).ToArray();
        Assert.Contains("changes", features);
        Assert.Contains("partial-export", features);

        var full = await _http.SendAsync(Req(HttpMethod.Post, "/model/export", token: token));
        Assert.Equal("ISO-10303-21;", await full.Content.ReadAsStringAsync());
        Assert.Null(_host.Exports[^1]);

        var part = await _http.SendAsync(Req(HttpMethod.Post, "/model/export", token: token, body: new { globalIds = new[] { "g1", "g2", "g1" } }));
        Assert.Equal("PARTIAL 2", await part.Content.ReadAsStringAsync()); // duplicates dropped
        Assert.Equal(new[] { "g1", "g2" }, _host.Exports[^1]);

        var tooMany = await _http.SendAsync(Req(HttpMethod.Post, "/model/export", token: token, body: new { globalIds = Enumerable.Range(0, BridgeServer.MaxPartialElements + 1).Select(i => $"g{i}").ToArray() }));
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
    }

    [Fact]
    public async Task Create_reads_the_exchange_and_refuses_what_it_cannot_read()
    {
        string token = await Pair();
        var ok = await _http.SendAsync(Req(HttpMethod.Post, "/model/create", token: token, body: new { dryRun = true, exchange = new { version = 1, levels = new[] { new { name = "L1", elevation = 0 } }, elements = new[] { new { id = "DXF:1:L1", kind = "column", mark = "C1", level = "L1", z0 = 0, z1 = 3000, shape = "rect", center = new[] { 0.0, 0 }, width = 300, length = 600, angle = 90 } } } }));
        var r = JsonDocument.Parse(await ok.Content.ReadAsStringAsync()).RootElement;
        Assert.True(r.GetProperty("dryRun").GetBoolean());
        Assert.Equal("DXF:1:L1", r.GetProperty("results")[0].GetProperty("id").GetString());
        Assert.Equal("01 GROUND LVL.", r.GetProperty("levels")[0].GetProperty("revitName").GetString());
        var v2 = await _http.SendAsync(Req(HttpMethod.Post, "/model/create", token: token, body: new { exchange = new { version = 2, levels = Array.Empty<object>(), elements = Array.Empty<object>() } }));
        Assert.Equal(HttpStatusCode.BadRequest, v2.StatusCode);
        Assert.Contains("version 1", await v2.Content.ReadAsStringAsync());
        var none = await _http.SendAsync(Req(HttpMethod.Post, "/model/create", token: token, body: new { dryRun = true }));
        Assert.Equal(HttpStatusCode.BadRequest, none.StatusCode);
    }
}

public class OutlineTests
{
    // Slab outlines from a real drawing (adani.dxf) that Revit refused: 0.1 mm edges, doubled points, a self-touching notch.
    private static readonly Dictionary<string, double[][]> Refused = new()
    {
        ["DXF:135B:L1"] = new double[][] { new[] {-65200.4, 16000.0}, new[] {-65200.4, 14649.9}, new[] {-62800.4, 14649.9}, new[] {-62800.4, 16000.1}, new[] {-62600.2, 16000.1}, new[] {-62600.2, 12400.1}, new[] {-60150.2, 12400.1}, new[] {-60150.4, 16000.1}, new[] {-59950.3, 16000.1}, new[] {-59950.4, 14649.9}, new[] {-57550.4, 14649.9}, new[] {-57550.4, 16000.0}, new[] {-57575.2, 16000.0}, new[] {-57575.2, 17000.2}, new[] {-59900.2, 17000.2}, new[] {-59900.2, 16000.3}, new[] {-60150.2, 16000.3}, new[] {-60150.2, 17000.2}, new[] {-62600.2, 17000.2}, new[] {-62600.2, 16000.3}, new[] {-62850.2, 16000.3}, new[] {-62850.2, 17000.2}, new[] {-65175.2, 17000.2}, new[] {-65175.2, 16000.0} }, // a sliver: a vertex 0.2 mm from another edge
        ["DXF:135E:L1"] = new double[][] { new[] {-47100.2, 17000.2}, new[] {-49550.2, 17000.2}, new[] {-49550.2, 16000.1}, new[] {-49800.2, 16000.1}, new[] {-49800.2, 17000.2}, new[] {-52125.2, 17000.2}, new[] {-52125.2, 16000.0}, new[] {-52150.4, 16000.0}, new[] {-52150.4, 14649.8}, new[] {-49750.4, 14649.8}, new[] {-49750.4, 16000.1}, new[] {-49550.3, 16000.1}, new[] {-49550.2, 12400.1}, new[] {-47100.2, 12400.1}, new[] {-47100.4, 16000.1}, new[] {-46900.3, 16000.1}, new[] {-46900.4, 14649.9}, new[] {-44500.4, 14649.9}, new[] {-44500.4, 16000.0}, new[] {-44525.2, 16000.0}, new[] {-44525.2, 17000.2}, new[] {-46850.2, 17000.2}, new[] {-46850.2, 16000.1}, new[] {-47100.2, 16000.1} },
        ["DXF:1379:L1"] = new double[][] { new[] {-62850.2, 13400.1}, new[] {-62850.2, 12450.1}, new[] {-63350.3, 12450.1}, new[] {-63350.4, 12450.1}, new[] {-63350.4, 14449.8}, new[] {-62800.4, 14449.8}, new[] {-62800.4, 13400.1} },
        ["DXF:137A:L1"] = new double[][] { new[] {-59900.2, 12450.1}, new[] {-59900.2, 13400.0}, new[] {-59950.4, 13400.0}, new[] {-59950.4, 14449.9}, new[] {-59400.5, 14449.9}, new[] {-59400.5, 13700.1}, new[] {-59400.5, 13699.9}, new[] {-59400.5, 13149.9}, new[] {-59400.5, 13150.1}, new[] {-59400.5, 12450.1} },
        ["DXF:13E9:L1"] = new double[][] { new[] {-36500.2, 6100.1}, new[] {-36500.3, 2500.1}, new[] {-36700.4, 2500.1}, new[] {-36700.4, 3850.3}, new[] {-39100.4, 3850.3}, new[] {-39100.4, 2500.1}, new[] {-39075.2, 2500.1}, new[] {-39075.2, 1500.1}, new[] {-36750.2, 1500.1}, new[] {-36750.2, 2500.1}, new[] {-36500.2, 2500.1}, new[] {-36500.2, 1500.1}, new[] {-34050.2, 1500.1}, new[] {-34050.2, 2500.1}, new[] {-33800.2, 2500.1}, new[] {-33800.2, 1500.1}, new[] {-31475.2, 1500.1}, new[] {-31475.2, 2500.1}, new[] {-31450.4, 2500.1}, new[] {-31450.4, 3850.2}, new[] {-33850.4, 3850.2}, new[] {-33850.3, 2500.1}, new[] {-34050.4, 2500.1}, new[] {-34050.4, 6100.1} },
        ["DXF:38A2:L2"] = new double[][] { new[] {-62850.2, 13400.1}, new[] {-62850.2, 12450.1}, new[] {-63350.3, 12450.1}, new[] {-63350.4, 12450.1}, new[] {-63350.4, 14449.8}, new[] {-62800.4, 14449.8}, new[] {-62800.4, 13400.1} },
        ["DXF:38A2:L3"] = new double[][] { new[] {-62850.2, 13400.1}, new[] {-62850.2, 12450.1}, new[] {-63350.3, 12450.1}, new[] {-63350.4, 12450.1}, new[] {-63350.4, 14449.8}, new[] {-62800.4, 14449.8}, new[] {-62800.4, 13400.1} },
        ["DXF:38A2:L4"] = new double[][] { new[] {-62850.2, 13400.1}, new[] {-62850.2, 12450.1}, new[] {-63350.3, 12450.1}, new[] {-63350.4, 12450.1}, new[] {-63350.4, 14449.8}, new[] {-62800.4, 14449.8}, new[] {-62800.4, 13400.1} },
        ["DXF:390C:L2"] = new double[][] { new[] {-33800.2, 6050.0}, new[] {-33300.4, 6050.0}, new[] {-33300.3, 6050.0}, new[] {-33300.3, 5350.1}, new[] {-33300.3, 5350.1}, new[] {-33300.3, 4800.1}, new[] {-33300.3, 4800.1}, new[] {-33300.3, 4050.2}, new[] {-33300.4, 4050.2}, new[] {-33850.4, 4050.2}, new[] {-33850.4, 5100.1}, new[] {-33800.2, 5100.1} },
        ["DXF:390C:L3"] = new double[][] { new[] {-33800.2, 6050.0}, new[] {-33300.4, 6050.0}, new[] {-33300.3, 6050.0}, new[] {-33300.3, 5350.1}, new[] {-33300.3, 5350.1}, new[] {-33300.3, 4800.1}, new[] {-33300.3, 4800.1}, new[] {-33300.3, 4050.2}, new[] {-33300.4, 4050.2}, new[] {-33850.4, 4050.2}, new[] {-33850.4, 5100.1}, new[] {-33800.2, 5100.1} },
        ["DXF:390C:L4"] = new double[][] { new[] {-33800.2, 6050.0}, new[] {-33300.4, 6050.0}, new[] {-33300.3, 6050.0}, new[] {-33300.3, 5350.1}, new[] {-33300.3, 5350.1}, new[] {-33300.3, 4800.1}, new[] {-33300.3, 4800.1}, new[] {-33300.3, 4050.2}, new[] {-33300.4, 4050.2}, new[] {-33850.4, 4050.2}, new[] {-33850.4, 5100.1}, new[] {-33800.2, 5100.1} },
    };

    private static double Area(List<double[]> p)
    {
        double s = 0;
        for (int i = 0; i < p.Count; i++) s += p[i][0] * p[(i + 1) % p.Count][1] - p[(i + 1) % p.Count][0] * p[i][1];
        return Math.Abs(s / 2);
    }

    private static bool Cross(double[] a, double[] b, double[] c, double[] d)
    {
        double O(double[] p, double[] q, double[] r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        return O(a, b, c) * O(a, b, d) < 0 && O(c, d, a) * O(c, d, b) < 0;
    }

    [Fact]
    public void Refused_outlines_become_loops_Revit_accepts()
    {
        foreach (var (id, outline) in Refused)
        {
            var loops = ExportPlanner.CleanOutline(outline);
            Assert.NotEmpty(loops);
            foreach (var lp in loops)
            {
                int n = lp.Count;
                Assert.True(n >= 3, id);
                for (int i = 0; i < n; i++)
                {
                    var a = lp[i]; var b = lp[(i + 1) % n];
                    Assert.True(Math.Sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])) >= 0.8, $"{id}: an edge under Revit's tolerance");
                    for (int j = i + 2; j < n; j++)
                        if (!(i == 0 && j == n - 1)) Assert.False(Cross(a, b, lp[j], lp[(j + 1) % n]), $"{id}: crosses itself");
                    for (int j = 0; j < n; j++)
                        if (j != i) Assert.True(Math.Sqrt((a[0] - lp[j][0]) * (a[0] - lp[j][0]) + (a[1] - lp[j][1]) * (a[1] - lp[j][1])) >= ExportPlanner.OutlineMergeMm, $"{id}: touches itself");
                    for (int j = 0; j < n; j++)
                    {
                        if (j == i || (j + 1) % n == i) continue;
                        var p = lp[j]; var q = lp[(j + 1) % n];
                        double dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy;
                        double t = Math.Clamp(((a[0] - p[0]) * dx + (a[1] - p[1]) * dy) / l2, 0, 1);
                        double ex = p[0] + t * dx - a[0], ey = p[1] + t * dy - a[1];
                        Assert.True(Math.Sqrt(ex * ex + ey * ey) >= 0.8, $"{id}: a vertex within Revit's tolerance of another edge");
                    }
                }
            }
            double before = Area(outline.ToList()), after = loops.Sum(Area);
            Assert.True(Math.Abs(after - before) / before < 0.001, $"{id}: area {before} -> {after}");
        }
    }

    [Fact]
    public void A_self_touching_notch_splits_into_simple_loops()
    {
        var loops = ExportPlanner.CleanOutline(Refused["DXF:135E:L1"]);
        Assert.True(loops.Count >= 2);
    }

    [Fact]
    public void A_clean_rectangle_is_left_alone()
    {
        var rect = new[] { new[] { 0.0, 0.0 }, new[] { 4000.0, 0.0 }, new[] { 4000.0, 3000.0 }, new[] { 0.0, 3000.0 } };
        var loops = ExportPlanner.CleanOutline(rect);
        Assert.Single(loops);
        Assert.Equal(4, loops[0].Count);
    }
}

public class PairedEventTests
{
    [Fact]
    public void Paired_fires_once_on_a_correct_code_and_never_on_a_wrong_one()
    {
        var p = new Pairing(null);
        int fired = 0;
        p.Paired += () => fired++;
        string code = p.NewCode();
        Assert.Null(p.TryPair(code == "000000" ? "111111" : "000000"));
        Assert.Equal(0, fired);
        Assert.NotNull(p.CodeExpiresUtc);
        Assert.NotNull(p.TryPair(code));
        Assert.Equal(1, fired);
        Assert.Null(p.CodeExpiresUtc); // one use
        Assert.Null(p.TryPair(code));
        Assert.Equal(1, fired);
    }
}
