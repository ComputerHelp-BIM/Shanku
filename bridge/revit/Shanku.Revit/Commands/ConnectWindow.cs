using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using System.Windows.Threading;
using Autodesk.Revit.UI;

namespace Shanku.Revit.Commands;

/// <summary>
/// The pairing code, in a modeless window styled like Shanku's own windows (its design tokens: orange
/// top edge, warm header strip, digit tiles in IBM Plex Mono, Shanku's buttons) and following Revit's
/// light or dark theme. Revit keeps working while it shows, so Shanku can pair AND load at once. Owned by
/// Revit's main window, it stays above Revit; it closes itself a moment after Shanku pairs. One at a
/// time: Connect again brings it forward with a new code.
/// </summary>
internal sealed class ConnectWindow : Window
{
    /// <summary>Shanku's design tokens (packages/tokens), light and dark.</summary>
    private sealed record Palette(string Bg, string Panel, string Ribbon, string Field, string Border, string BorderStrong, string Text, string TextSecondary, string Accent, string Ok);

    private static readonly Palette Light = new("#F6F4EF", "#E9E4DA", "#EFECE5", "#FFFFFF", "#E2DED4", "#CFCAC0", "#17191E", "#5B5F68", "#D9761E", "#2E8B57");
    private static readonly Palette Dark = new("#202329", "#262A31", "#2A2E35", "#1F2227", "#353A42", "#474D57", "#E7E3DB", "#AAAFB7", "#D9761E", "#2E8B57");

    private const string Sans = "IBM Plex Sans, Segoe UI";
    private const string Mono = "IBM Plex Mono, Consolas";

    private static ConnectWindow? _open;
    private readonly Palette _p;
    private readonly StackPanel _digits = new() { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Left };
    private readonly TextBlock _status = new();
    private readonly TextBlock _paired = new();
    private readonly Rectangle _drain = new();
    private readonly Grid _drainTrack = new();
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

    private static SolidColorBrush B(string hex) => (SolidColorBrush)new BrushConverter().ConvertFromString(hex)!;

    private ConnectWindow()
    {
        bool dark;
        try { dark = UIThemeManager.CurrentTheme == UITheme.Dark; } catch { dark = false; }
        _p = dark ? Dark : Light;

        Title = "Connect to Shanku";
        Width = 440;
        SizeToContent = SizeToContent.Height;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        ShowInTaskbar = false;
        FontFamily = new FontFamily(Sans);
        FontSize = 13;
        Foreground = B(_p.Text);

        // the window: rounded, shadowed, Shanku's orange top edge
        var frame = new Border
        {
            Margin = new Thickness(14),
            CornerRadius = new CornerRadius(8),
            Background = B(_p.Panel),
            BorderBrush = B(_p.BorderStrong),
            BorderThickness = new Thickness(1),
            Effect = new DropShadowEffect { BlurRadius = 18, ShadowDepth = 3, Opacity = dark ? 0.55 : 0.22, Color = Colors.Black },
        };
        var root = new DockPanel();
        frame.Child = root;
        Content = frame;

        var accentEdge = new Border { Height = 3, Background = B(_p.Accent), CornerRadius = new CornerRadius(8, 8, 0, 0) };
        DockPanel.SetDock(accentEdge, Dock.Top);
        root.Children.Add(accentEdge);

        // header strip: title, where it runs, close; drag the window by it
        var header = new Grid { Background = B(_p.Ribbon) };
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var titles = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(16, 9, 8, 9), VerticalAlignment = VerticalAlignment.Center };
        titles.Children.Add(new TextBlock { Text = "Connect to Shanku", FontWeight = FontWeights.SemiBold, FontSize = 13 });
        titles.Children.Add(new TextBlock { Text = $"Revit {App.Host?.RevitVersion} · add-in {App.Host?.AddinVersion}", Foreground = B(_p.TextSecondary), FontSize = 12, Margin = new Thickness(10, 1, 0, 0) });
        header.Children.Add(titles);
        var x = FlatButton("✕", false);
        x.Padding = new Thickness(10, 4, 10, 4);
        x.Margin = new Thickness(0, 0, 6, 0);
        x.ToolTip = "Close";
        x.Click += (_, _) => Close();
        Grid.SetColumn(x, 1);
        header.Children.Add(x);
        header.MouseLeftButtonDown += (_, e) => { if (e.ButtonState == MouseButtonState.Pressed) DragMove(); };
        var headerLine = new Border { BorderBrush = B(_p.Border), BorderThickness = new Thickness(0, 0, 0, 1), Child = header };
        DockPanel.SetDock(headerLine, Dock.Top);
        root.Children.Add(headerLine);

        // footer: where the bridge listens, and the buttons
        var footer = new Grid { Margin = new Thickness(16, 4, 16, 16) };
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        footer.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        footer.Children.Add(new TextBlock { Text = $"localhost:{App.Server?.Port}", Foreground = B(_p.TextSecondary), FontFamily = new FontFamily(Mono), FontSize = 11, VerticalAlignment = VerticalAlignment.Center });
        var buttons = new StackPanel { Orientation = Orientation.Horizontal };
        var fresh = FlatButton("New code", false);
        fresh.Click += (_, _) => NewCode();
        var open = FlatButton("Open Shanku", true);
        open.Margin = new Thickness(8, 0, 0, 0);
        open.Click += (_, _) => App.OpenShanku();
        buttons.Children.Add(fresh);
        buttons.Children.Add(open);
        Grid.SetColumn(buttons, 1);
        footer.Children.Add(buttons);
        DockPanel.SetDock(footer, Dock.Bottom);
        root.Children.Add(footer);

        // body: the code in digit tiles, the countdown, the instructions
        var body = new StackPanel { Margin = new Thickness(16, 14, 16, 10) };
        body.Children.Add(new TextBlock { Text = "PAIRING CODE", Foreground = B(_p.TextSecondary), FontSize = 11, FontWeight = FontWeights.SemiBold });
        _digits.Margin = new Thickness(0, 8, 0, 0);
        body.Children.Add(_digits);
        _paired.Visibility = Visibility.Collapsed;
        _paired.FontSize = 22;
        _paired.FontWeight = FontWeights.SemiBold;
        _paired.Foreground = B(_p.Ok);
        _paired.Margin = new Thickness(0, 10, 0, 6);
        body.Children.Add(_paired);

        _drainTrack.Height = 4;
        _drainTrack.Margin = new Thickness(0, 12, 0, 0);
        _drainTrack.Children.Add(new Border { Background = B(_p.Field), CornerRadius = new CornerRadius(2) });
        _drain.Fill = B(_p.Accent);
        _drain.RadiusX = _drain.RadiusY = 2;
        _drain.HorizontalAlignment = HorizontalAlignment.Left;
        _drainTrack.Children.Add(_drain);
        body.Children.Add(_drainTrack);

        _status.Foreground = B(_p.TextSecondary);
        _status.FontSize = 12;
        _status.Margin = new Thickness(0, 6, 0, 0);
        _status.TextWrapping = TextWrapping.Wrap;
        body.Children.Add(_status);
        body.Children.Add(new TextBlock
        {
            Text = "In Shanku, click Revit in the status bar (or search \"Connect to Revit\") and enter this code. Revit keeps working while this window is open.",
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 12, 0, 0),
            LineHeight = 19,
        });
        root.Children.Add(body);

        _tick = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _tick.Tick += (_, _) => UpdateStatus();
        if (App.Pairing != null) App.Pairing.Paired += OnPaired;
        KeyDown += (_, e) => { if (e.Key == Key.Escape) Close(); };
        Closed += (_, _) =>
        {
            _tick.Stop();
            if (App.Pairing != null) App.Pairing.Paired -= OnPaired;
            _open = null;
        };
        NewCode();
        _tick.Start();
    }

    /// <summary>Shanku's buttons: primary (accent fill) or secondary (field with a border); flat, rounded.</summary>
    private Button FlatButton(string text, bool primary)
    {
        var bg = primary ? B(_p.Accent) : B(_p.Field);
        var fg = primary ? Brushes.White : B(_p.Text);
        var border = primary ? B(_p.Accent) : B(_p.BorderStrong);
        var tpl = new ControlTemplate(typeof(Button));
        var bd = new FrameworkElementFactory(typeof(Border), "bd");
        bd.SetValue(Border.BackgroundProperty, bg);
        bd.SetValue(Border.BorderBrushProperty, border);
        bd.SetValue(Border.BorderThicknessProperty, new Thickness(text == "✕" ? 0 : 1));
        bd.SetValue(Border.CornerRadiusProperty, new CornerRadius(6));
        bd.SetValue(Border.PaddingProperty, new TemplateBindingExtension(Control.PaddingProperty));
        var cp = new FrameworkElementFactory(typeof(ContentPresenter));
        cp.SetValue(HorizontalAlignmentProperty, HorizontalAlignment.Center);
        cp.SetValue(VerticalAlignmentProperty, VerticalAlignment.Center);
        bd.AppendChild(cp);
        tpl.VisualTree = bd;
        var hover = new Trigger { Property = IsMouseOverProperty, Value = true };
        hover.Setters.Add(new Setter(Border.OpacityProperty, 0.85, "bd"));
        tpl.Triggers.Add(hover);
        var b = new Button
        {
            Content = text,
            Template = tpl,
            Foreground = fg,
            Padding = new Thickness(14, 6, 14, 6),
            FontWeight = primary ? FontWeights.SemiBold : FontWeights.Normal,
            Cursor = Cursors.Hand,
        };
        if (text == "✕") b.Background = Brushes.Transparent;
        return b;
    }

    private void ShowDigits(string code, bool active)
    {
        _digits.Children.Clear();
        for (int i = 0; i < code.Length; i++)
        {
            _digits.Children.Add(new Border
            {
                Width = 44,
                Height = 54,
                Margin = new Thickness(0, 0, i == 2 ? 18 : 8, 0),
                CornerRadius = new CornerRadius(6),
                Background = B(_p.Field),
                BorderBrush = active ? B(_p.BorderStrong) : B(_p.Border),
                BorderThickness = new Thickness(1),
                Child = new TextBlock
                {
                    Text = code[i].ToString(),
                    FontFamily = new FontFamily(Mono),
                    FontSize = 30,
                    FontWeight = FontWeights.SemiBold,
                    Foreground = active ? B(_p.Text) : B(_p.TextSecondary),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            });
        }
    }

    private void NewCode()
    {
        string code = App.Pairing!.NewCode();
        _digits.Visibility = Visibility.Visible;
        _drainTrack.Visibility = Visibility.Visible;
        _paired.Visibility = Visibility.Collapsed;
        ShowDigits(code, true);
        UpdateStatus();
    }

    private void UpdateStatus()
    {
        var until = App.Pairing?.CodeExpiresUtc;
        var left = until is { } u ? u - DateTime.UtcNow : TimeSpan.Zero;
        if (left <= TimeSpan.Zero)
        {
            _status.Text = "This code has been used or has expired: click New code for another.";
            _drain.Width = 0;
            foreach (Border t in _digits.Children) if (t.Child is TextBlock tb) tb.Foreground = B(_p.TextSecondary);
            return;
        }
        double width = Math.Max(0, _drainTrack.ActualWidth > 0 ? _drainTrack.ActualWidth : 380);
        _drain.Width = width * Math.Clamp(left.TotalSeconds / Shanku.Revit.Core.Pairing.CodeLifetime.TotalSeconds, 0, 1);
        _status.Text = $"Works once · {left.Minutes}:{left.Seconds:00} left" +
                       (App.Pairing!.HasTokens ? " · a browser on this computer is already paired" : "");
    }

    /// <summary>Shanku paired (server thread): say so, then close.</summary>
    private void OnPaired() => Dispatcher.BeginInvoke(() =>
    {
        _tick.Stop();
        _digits.Visibility = Visibility.Collapsed;
        _drainTrack.Visibility = Visibility.Collapsed;
        _paired.Text = "✓  Connected to Shanku";
        _paired.Visibility = Visibility.Visible;
        _status.Text = "This window closes by itself.";
        var shut = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1.8) };
        shut.Tick += (_, _) => { shut.Stop(); Close(); };
        shut.Start();
    });
}
