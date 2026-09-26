using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Autodesk.Revit.UI;
using Shanku.Revit.Core;

namespace Shanku.Revit.Revit;

/// <summary>
/// Runs work on Revit's main thread: the HTTP server queues a job and raises one ExternalEvent; Revit
/// runs every queued job when it is idle. A modal dialog in Revit delays jobs; the timeout turns that
/// into a clear message instead of a hang.
/// </summary>
public sealed class RevitQueue : IExternalEventHandler
{
    private readonly ConcurrentQueue<Action<UIApplication>> _jobs = new();
    private readonly ExternalEvent _event;
    private readonly IntPtr _mainWindow;

    /// <summary>Create in a valid Revit API context (OnStartup), with Revit's main window handle.</summary>
    public RevitQueue(IntPtr mainWindow)
    {
        _event = ExternalEvent.Create(this);
        _mainWindow = mainWindow;
    }

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    private const uint WM_NULL = 0x0000;

    /// <summary>
    /// Revit runs external events when its window processes messages: an idle Revit in the background
    /// can leave a request waiting until the mouse moves over it. An empty message wakes it at once.
    /// </summary>
    private void Wake()
    {
        if (_mainWindow != IntPtr.Zero) PostMessage(_mainWindow, WM_NULL, IntPtr.Zero, IntPtr.Zero);
    }

    public Task<T> Run<T>(Func<UIApplication, T> job, TimeSpan timeout)
    {
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _jobs.Enqueue(ui =>
        {
            try { tcs.TrySetResult(job(ui)); }
            catch (Exception ex) { tcs.TrySetException(ex); }
        });
        var r = _event.Raise(); // Pending means already raised: our job runs with the others
        Wake();
        if (r == ExternalEventRequest.Denied)
            tcs.TrySetException(new BridgeException(503, "Revit refused the request. Try again in a moment."));
        return WithTimeout(tcs.Task, timeout);
    }

    private static async Task<T> WithTimeout<T>(Task<T> task, TimeSpan timeout)
    {
        var done = await Task.WhenAny(task, Task.Delay(timeout)).ConfigureAwait(false);
        if (done != task) throw new BridgeException(504, "Revit did not answer in time. Close any open dialog in Revit, then try again.");
        return await task.ConfigureAwait(false);
    }

    public void Execute(UIApplication app)
    {
        while (_jobs.TryDequeue(out var job)) job(app);
    }

    public string GetName() => "Shanku bridge";
}
