using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;

namespace Shanku.Revit.Commands;

/// <summary>
/// The pairing code, in a modeless window: Revit keeps working while it shows, so Shanku can pair AND load
/// at once (a modal dialog held back every request that needs Revit until it was closed). Owned by Revit's
/// main window, it stays above Revit; it closes itself a moment after Shanku pairs. One at a time: Connect
/// again brings it forward with a new code.
/// </summary>
internal sealed class ConnectWindow : Window
{
    private static ConnectWindow? _open;
    private readonly TextBlock _code = new();
    private readonly TextBlock _status = new();
    private readonly DispatcherTimer _tick;

    public static void ShowFor(IntPtr revitWindow)
    {
        if (_open != null)
        {
            _open.NewCode();
            _open.Activate();
            return;
        }
        _open = new ConnectWindow();
        new WindowInteropHelper(_open).Owner = revitWindow;
        _open.Show();
    }

    private ConnectWindow()
    {
        Title = "Connect to Shanku";
        Width = 420;
        SizeToContent = SizeToContent.Height;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ShowInTaskbar = false;
        FontFamily = new FontFamily("Segoe UI");
        FontSize = 13;

        var panel = new StackPanel { Margin = new Thickness(20, 18, 20, 18) };
        panel.Children.Add(new TextBlock { Text = "Pairing code", Foreground = Brushes.DimGray });
        _code.FontFamily = new FontFamily("Consolas");
        _code.FontSize = 38;
        _code.FontWeight = FontWeights.SemiBold;
        _code.Margin = new Thickness(0, 2, 0, 8);
        panel.Children.Add(_code);
        panel.Children.Add(new TextBlock
        {
            Text = "In Shanku, click Revit in the status bar (or search \"Connect to Revit\") and enter this code. " +
                   "Revit keeps working while this window is open.",
            TextWrapping = TextWrapping.Wrap,
        });
        _status.Margin = new Thickness(0, 10, 0, 0);
        _status.Foreground = Brushes.DimGray;
        _status.TextWrapping = TextWrapping.Wrap;
        panel.Children.Add(_status);
        panel.Children.Add(new TextBlock
        {
            Text = $"Bridge on http://localhost:{App.Server?.Port} · Revit {App.Host?.RevitVersion} · add-in {App.Host?.AddinVersion}",
            Margin = new Thickness(0, 10, 0, 0),
            FontSize = 11,
            Foreground = Brushes.Gray,
        });

        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 16, 0, 0) };
        var open = new Button { Content = "Open Shanku in the browser", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 8, 0) };
        open.Click += (_, _) => App.OpenShanku();
        var fresh = new Button { Content = "New code", Padding = new Thickness(10, 4, 10, 4), Margin = new Thickness(0, 0, 8, 0) };
        fresh.Click += (_, _) => NewCode();
        var close = new Button { Content = "Close", Padding = new Thickness(14, 4, 14, 4), IsCancel = true };
        close.Click += (_, _) => Close();
        buttons.Children.Add(open);
        buttons.Children.Add(fresh);
        buttons.Children.Add(close);
        panel.Children.Add(buttons);
        Content = panel;

        _tick = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _tick.Tick += (_, _) => UpdateStatus();
        if (App.Pairing != null) App.Pairing.Paired += OnPaired;
        Closed += (_, _) =>
        {
            _tick.Stop();
            if (App.Pairing != null) App.Pairing.Paired -= OnPaired;
            _open = null;
        };
        NewCode();
        _tick.Start();
    }

    private void NewCode()
    {
        string code = App.Pairing!.NewCode();
        _code.Text = $"{code[..3]} {code[3..]}";
        _code.Foreground = Brushes.Black;
        UpdateStatus();
    }

    private void UpdateStatus()
    {
        var until = App.Pairing?.CodeExpiresUtc;
        if (until is not { } u)
        {
            _status.Text = "This code has been used or expired: click New code for another.";
            _code.Foreground = Brushes.Gray;
            return;
        }
        var left = u - DateTime.UtcNow;
        if (left <= TimeSpan.Zero)
        {
            _status.Text = "This code has expired: click New code for another.";
            _code.Foreground = Brushes.Gray;
            return;
        }
        _status.Text = $"Works once, for {left.Minutes}:{left.Seconds:00} more." +
                       (App.Pairing!.HasTokens ? " A browser is already paired on this computer; a code is only needed for a new one." : "");
    }

    /// <summary>Shanku paired (server thread): say so, then close.</summary>
    private void OnPaired() => Dispatcher.BeginInvoke(() =>
    {
        _tick.Stop();
        _code.Text = "Connected";
        _code.Foreground = Brushes.SeaGreen;
        _status.Text = "Shanku is connected. This window closes by itself.";
        var shut = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1.8) };
        shut.Tick += (_, _) => { shut.Stop(); Close(); };
        shut.Start();
    });
}
