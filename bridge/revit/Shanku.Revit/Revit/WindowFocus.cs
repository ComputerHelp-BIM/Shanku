using System;
using System.Runtime.InteropServices;

namespace Shanku.Revit.Revit;

/// <summary>
/// Brings Revit's main window to the front, maximised, after work Shanku asked for (Export to Revit). Windows lets a
/// program take the foreground only in some conditions; the usual way in is a synthetic Alt key press
/// before SetForegroundWindow. When Windows still refuses, Revit's taskbar button flashes instead.
/// </summary>
internal static class WindowFocus
{
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] private static extern bool FlashWindowEx(ref FLASHWINFO pwfi);

    [StructLayout(LayoutKind.Sequential)]
    private struct FLASHWINFO
    {
        public uint cbSize;
        public IntPtr hwnd;
        public uint dwFlags;
        public uint uCount;
        public uint dwTimeout;
    }

    private const int SW_MAXIMIZE = 3;
    private const byte VK_MENU = 0x12;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint FLASHW_ALL = 3, FLASHW_TIMERNOFG = 12;

    /// <summary>True when Revit came to the front; false when Windows refused (the taskbar button flashes).</summary>
    public static bool BringToFront(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return false;
        // maximised, as Revit is normally used (from minimised or a smaller window)
        if (IsIconic(hwnd) || !IsZoomed(hwnd)) ShowWindow(hwnd, SW_MAXIMIZE);
        keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
        keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        bool ok = SetForegroundWindow(hwnd) && GetForegroundWindow() == hwnd;
        if (!ok)
        {
            var f = new FLASHWINFO { hwnd = hwnd, dwFlags = FLASHW_ALL | FLASHW_TIMERNOFG, uCount = 5, dwTimeout = 0 };
            f.cbSize = (uint)Marshal.SizeOf(f);
            FlashWindowEx(ref f);
        }
        return ok;
    }
}
