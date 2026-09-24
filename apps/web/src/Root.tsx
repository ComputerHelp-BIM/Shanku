import { Suspense, lazy, useEffect, useState } from 'react';
import { ErrorBoundary } from '@shanku/ui';
import { Home } from './home/Home';
import type { AppStart } from './App';
import { enterFullscreen } from './lib/fullscreen';

const App = lazy(() => import('./App').then((m) => ({ default: m.App })));

/**
 * Homepage and app live in one page: browsers only allow fullscreen after a click on the same page,
 * and navigating away would drop it. "Try Shanku free" asks for fullscreen, then swaps the homepage
 * for the app (loaded on demand, so the homepage stays light). #app opens the app directly.
 */

export function Root() {
  const [start, setStart] = useState<AppStart | null>(() => (location.hash.startsWith('#app') ? {} : null));

  useEffect(() => {
    const onHash = () => setStart((s) => (location.hash.startsWith('#app') ? s ?? {} : null));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    document.title = start ? 'Shanku' : 'Shanku — structural BIM in your browser';
  }, [start]);

  const open = (s: AppStart = {}) => {
    void enterFullscreen();
    history.pushState(null, '', '#app');
    setStart(s);
  };

  if (!start) return <Home onOpen={open} />;
  return (
    <Suspense fallback={<div className="home-loading">Opening Shanku…</div>}>
      {/* Last line of defence: an error that escapes every window and panel shows a report, not a blank page. */}
      <ErrorBoundary
        where="Shanku"
        variant="page"
        details={() => `Page: ${location.href}`}
        onReset={() => {
          // Only layouts and window positions: files, views and templates stay.
          for (const k of Object.keys(localStorage)) if (k.startsWith('shanku.layout') || k.startsWith('shanku.window.')) localStorage.removeItem(k);
          location.reload();
        }}
      >
        <App start={start} />
      </ErrorBoundary>
    </Suspense>
  );
}
