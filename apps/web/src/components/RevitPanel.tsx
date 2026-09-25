import { useEffect, useState } from 'react';
import { Button } from '@shanku/ui';
import { DEFAULT_PORT, type BridgeState } from '../lib/revitBridge';

export interface RevitPanelProps {
  state: BridgeState;
  /** Shanku shows the model loaded from this Revit document (key). */
  linkedKey: string | null;
  loading: boolean;
  syncSelection: boolean;
  onConnect: (port: number) => void;
  onPair: (code: string) => void;
  onLoad: () => void;
  onSyncSelection: (on: boolean) => void;
  onDisconnect: () => void;
  /** Live updates (add-in 0.5.0, model loaded from Revit): changed count, Update and Auto-update. */
  live?: { count: number; busy: boolean; auto: boolean; onUpdate: () => void; onAuto: (on: boolean) => void } | null;
}

/** The Revit window: find the add-in, pair with the code from Revit, load the model, sync selection. */
export function RevitPanel(p: RevitPanelProps) {
  const { state } = p;
  const [code, setCode] = useState('');
  const [port, setPort] = useState(String(state.port));
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!p.loading) return setElapsed(0);
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [p.loading]);

  const doc = state.document;
  const linked = !!doc && p.linkedKey === doc.key;
  const steps = (
    <ol className="app-revit__steps">
      <li>
        Install <strong>Shanku Bridge for Revit 2025</strong> (from the Shanku repository: <code>bridge/revit</code>).
      </li>
      <li>
        Open your model in Revit, then <strong>Shanku → Connect</strong>. Revit shows a 6-digit code.
      </li>
      <li>Enter the code here. Chrome asks once to allow access to apps on this device: allow it.</li>
    </ol>
  );

  return (
    <div className="app-revit">
      <div className={`app-revit__state app-revit__state--${state.phase}`} role="status">
        <span className="app-revit__dot" aria-hidden="true" />
        {state.phase === 'idle' && 'Not connected'}
        {state.phase === 'searching' && 'Looking for Revit…'}
        {state.phase === 'absent' && 'Revit not found'}
        {state.phase === 'unpaired' && `Revit ${state.revit ?? ''} found · enter the code`}
        {state.phase === 'connected' && `Connected · Revit ${state.revit ?? ''} · add-in ${state.addin ?? ''}`}
        {state.phase === 'error' && 'Cannot connect'}
      </div>

      {state.error ? <p className="app-revit__error">{state.error}</p> : null}

      {(state.phase === 'idle' || state.phase === 'absent' || state.phase === 'error') && (
        <>
          {steps}
          <div className="app-revit__row">
            <Button variant="primary" onClick={() => p.onConnect(Number(port) || DEFAULT_PORT)}>
              {state.phase === 'idle' ? 'Connect to Revit' : 'Try again'}
            </Button>
            <label className="app-revit__port">
              Port
              <input aria-label="Bridge port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))} />
            </label>
          </div>
        </>
      )}

      {state.phase === 'unpaired' && (
        <form
          className="app-revit__row"
          onSubmit={(e) => {
            e.preventDefault();
            p.onPair(code);
          }}
        >
          <input
            className="app-revit__code"
            aria-label="Pairing code from Revit"
            placeholder="123 456"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, '').slice(0, 7))}
          />
          <Button variant="primary" type="submit" disabled={code.replace(/\D/g, '').length !== 6}>
            Pair
          </Button>
        </form>
      )}

      {state.phase === 'connected' && (
        <>
          <dl className="app-revit__doc">
            <dt>Model in Revit</dt>
            <dd>{doc ? doc.title : 'No model is open in Revit'}</dd>
            {doc?.path ? (
              <>
                <dt>File</dt>
                <dd className="app-revit__path">{doc.path}</dd>
              </>
            ) : null}
            <dt>In Shanku</dt>
            <dd>{linked ? 'This model (selection follows Revit)' : p.linkedKey ? 'A different Revit model' : 'Not loaded yet'}</dd>
          </dl>
          <div className="app-revit__row">
            <Button variant="primary" onClick={p.onLoad} disabled={!doc || doc.isFamily || p.loading}>
              {p.loading ? `Loading from Revit… ${elapsed}s` : linked ? 'Reload from Revit' : 'Load model from Revit'}
            </Button>
            <label className="app-revit__check">
              <input type="checkbox" checked={p.syncSelection} onChange={(e) => p.onSyncSelection(e.target.checked)} /> Sync selection
            </label>
          </div>
          {p.live && linked ? (
            <div className="app-revit__row app-revit__live">
              <span>{p.live.count ? `${p.live.count} element${p.live.count === 1 ? '' : 's'} changed in Revit` : 'In step with Revit'}</span>
              <Button size="sm" disabled={!p.live.count || p.live.busy} onClick={p.live.onUpdate}>
                {p.live.busy ? 'Updating…' : 'Update'}
              </Button>
              <label className="app-revit__check">
                <input type="checkbox" checked={p.live.auto} onChange={(e) => p.live!.onAuto(e.target.checked)} /> Auto-update
              </label>
            </div>
          ) : null}
          {doc?.isFamily ? <p className="app-revit__note">Revit is showing a family. Open a project model.</p> : null}
          <p className="app-revit__note">
            Revit exports the model as IFC4 inside a transaction it rolls back, so the Revit model is never changed. Large models take a while; close dialogs in Revit.
          </p>
          <div className="app-revit__row">
            <Button size="sm" onClick={p.onDisconnect}>
              Disconnect this browser
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
