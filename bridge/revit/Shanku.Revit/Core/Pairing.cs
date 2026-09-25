using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Shanku.Revit.Core;

/// <summary>
/// Pairing: a 6-digit code shown in Revit, valid for a few minutes, exchanged once for a token.
/// Five wrong codes void the current code. Tokens are stored as SHA-256 hashes so they survive a Revit
/// restart; Disconnect revokes them all.
/// </summary>
public sealed class Pairing
{
    private readonly object _gate = new();
    private readonly string? _store;
    private readonly Func<DateTime> _now;
    private readonly HashSet<string> _tokenHashes = new();
    private string? _code;
    private DateTime _codeExpires;
    private int _failures;

    public static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(5);
    public const int MaxFailures = 5;

    /// <param name="storePath">File for token hashes; null keeps them in memory only (tests).</param>
    public Pairing(string? storePath, Func<DateTime>? now = null)
    {
        _store = storePath;
        _now = now ?? (() => DateTime.UtcNow);
        Load();
    }

    /// <summary>A fresh code for Revit to show (replaces any previous one).</summary>
    public string NewCode()
    {
        lock (_gate)
        {
            _code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
            _codeExpires = _now() + CodeLifetime;
            _failures = 0;
            return _code;
        }
    }

    public bool PairingOpen
    {
        get { lock (_gate) return _code != null && _now() < _codeExpires; }
    }

    public bool HasTokens
    {
        get { lock (_gate) return _tokenHashes.Count > 0; }
    }

    /// <summary>Exchanges a correct, unexpired code for a new token; null otherwise.</summary>
    public string? TryPair(string? code)
    {
        lock (_gate)
        {
            if (_code == null || _now() >= _codeExpires || string.IsNullOrEmpty(code)) return null;
            bool ok = CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(code.Trim()), Encoding.ASCII.GetBytes(_code));
            if (!ok)
            {
                if (++_failures >= MaxFailures) _code = null; // void it: show a new code in Revit
                return null;
            }
            _code = null; // one use
            string token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
            _tokenHashes.Add(Hash(token));
            Save();
            return token;
        }
    }

    public bool IsValid(string? token)
    {
        if (string.IsNullOrEmpty(token)) return false;
        string h = Hash(token);
        lock (_gate) return _tokenHashes.Contains(h);
    }

    /// <summary>Disconnect: forget every token and any open code.</summary>
    public void RevokeAll()
    {
        lock (_gate)
        {
            _tokenHashes.Clear();
            _code = null;
            Save();
        }
    }

    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private void Load()
    {
        if (_store == null || !File.Exists(_store)) return;
        try
        {
            var list = JsonSerializer.Deserialize<List<string>>(File.ReadAllText(_store));
            if (list != null) foreach (var h in list.Where(x => x.Length == 64)) _tokenHashes.Add(h);
        }
        catch
        {
            // unreadable store: start unpaired
        }
    }

    private void Save()
    {
        if (_store == null) return;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_store)!);
            File.WriteAllText(_store, JsonSerializer.Serialize(_tokenHashes.ToList()));
        }
        catch
        {
            // not persisted: pairing lasts for this Revit session
        }
    }
}
