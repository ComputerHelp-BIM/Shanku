/**
 * Full screen for the whole page. Browsers only allow it from a click; Chrome / Edge also keep Esc for
 * the app (holding Esc still leaves full screen).
 */
export async function enterFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // Chrome / Edge: keep Esc for the app (Esc clears selection etc.); holding Esc still leaves fullscreen.
    await (navigator as unknown as { keyboard?: { lock?: (keys: string[]) => Promise<void> } }).keyboard?.lock?.(['Escape']);
  } catch {
    /* fullscreen refused (e.g. inside an iframe): the app still opens normally */
  }
}
