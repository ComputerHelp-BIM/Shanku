using System;
using System.Text;

namespace Shanku.Revit.Core;

/// <summary>
/// The 22-character IFC GlobalId form of a GUID, exactly as Revit's IFC exporter writes it
/// (GUIDUtil.ConvertToIFCGuid): the GUID's 16 bytes in standard order, packed as 2 + 5×4 base-64
/// digits with the IFC alphabet.
/// </summary>
public static class IfcGuid
{
    private const string Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

    public static string FromGuid(Guid guid)
    {
        // "N" gives the 32 hex digits in standard (big-endian) order, which is the order the
        // exporter's byte shuffling of Guid.ToByteArray() ends up using.
        string hex = guid.ToString("N");
        var b = new int[16];
        for (int i = 0; i < 16; i++) b[i] = Convert.ToInt32(hex.Substring(i * 2, 2), 16);
        var sb = new StringBuilder(22);
        Append(sb, b[0], 2);
        for (int i = 1; i < 16; i += 3) Append(sb, (b[i] << 16) + (b[i + 1] << 8) + b[i + 2], 4);
        return sb.ToString();
    }

    private static void Append(StringBuilder sb, int value, int digits)
    {
        var chars = new char[digits];
        for (int i = digits - 1; i >= 0; i--)
        {
            chars[i] = Alphabet[value % 64];
            value /= 64;
        }
        sb.Append(chars);
    }
}
