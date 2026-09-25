import { useMemo, useState } from 'react';
import { Button } from '@shanku/ui';
import { changeKey, type PendingChange } from '../lib/paramEdits';

/** Above this many elements, Apply asks the user to confirm they reviewed the list. */
export const REVIEW_THRESHOLD = 50;

export interface RevitChangesProps {
  pending: PendingChange[];
  /** Result of the last check or apply per change key: ok, or the reason Revit refused. */
  status: Map<string, { ok: boolean; message?: string | null }>;
  busy: 'check' | 'apply' | null;
  canApply: boolean;
  why?: string;
  lastApplied?: { undoName: string; applied: number; warnings: string[] } | null;
  onCheck: (keys: string[]) => void;
  onApply: (keys: string[]) => void;
  onRemove: (keys: string[]) => void;
  /** Re-reads these rows' elements from Revit and takes Revit's current values as the base. */
  onRefresh: (keys: string[]) => void;
  /** Revit's warnings from the last check or apply. */
  warnings?: { dryRun: boolean; list: string[] } | null;
  /** Reload the model from Revit (Shanku still shows it as loaded). */
  onReload: () => void;
  onSelectElements: (globalIds: string[]) => void;
}

/**
 * The Changes window: every parameter edit waiting for Revit, reviewed before anything is sent.
 * Tick rows (or a whole element), check them in Revit (a dry run), then apply them as one undo.
 */
export function RevitChanges(p: RevitChangesProps) {
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState(false);
  const byElement = useMemo(() => {
    const m = new Map<string, PendingChange[]>();
    for (const c of p.pending) m.set(c.globalId, [...(m.get(c.globalId) ?? []), c]);
    return [...m.entries()];
  }, [p.pending]);
  const ticked = p.pending.filter((c) => !unticked.has(changeKey(c))).map(changeKey);
  const tickedElements = new Set(p.pending.filter((c) => !unticked.has(changeKey(c))).map((c) => c.globalId)).size;
  const needsReview = tickedElements > REVIEW_THRESHOLD;
  const toggle = (keys: string[], on: boolean) =>
    setUnticked((u) => {
      const n = new Set(u);
      for (const k of keys) (on ? n.delete(k) : n.add(k));
      return n;
    });

  const banner = (
    <>
      {p.warnings?.list.length ? (
        <div className="app-changes__warn" role="status">
          <strong>{p.warnings.dryRun ? 'Revit would warn' : 'Revit warned'}</strong>
          <ul>
            {p.warnings.list.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.lastApplied ? (
        <div className="app-changes__done">
          <span>
            Applied {p.lastApplied.applied} in Revit as <strong>{p.lastApplied.undoName}</strong> (Edit → Undo in Revit takes it back). Shanku still shows the model as it was loaded.
          </span>
          <Button size="sm" onClick={p.onReload}>
            Reload from Revit
          </Button>
        </div>
      ) : null}
    </>
  );

  if (!p.pending.length) {
    return (
      <div className="app-changes app-changes--empty">
        {banner}
        <p className="app-changes__hint">No changes waiting. Select elements from a model loaded from Revit and edit their Revit parameters in Properties.</p>
      </div>
    );
  }

  return (
    <div className="app-changes">
      {banner}
      <div className="app-changes__scroll">
        <table className="app-changes__table">
          <thead>
            <tr>
              <th className="c">
                <input type="checkbox" aria-label="All changes" checked={ticked.length === p.pending.length} ref={(el) => el && (el.indeterminate = ticked.length > 0 && ticked.length < p.pending.length)} onChange={(e) => toggle(p.pending.map(changeKey), e.target.checked)} />
              </th>
              <th>Element</th>
              <th>Parameter</th>
              <th>In Revit</th>
              <th>New</th>
              <th>Check</th>
            </tr>
          </thead>
          <tbody>
            {byElement.map(([gid, cs]) =>
              cs.map((c, i) => {
                const k = changeKey(c);
                const st = p.status.get(k);
                return (
                  <tr key={k} className={st && !st.ok ? 'is-refused' : undefined}>
                    <td className="c">
                      <input type="checkbox" aria-label={`Apply ${c.name} on ${c.element}`} checked={!unticked.has(k)} onChange={(e) => toggle([k], e.target.checked)} />
                    </td>
                    <td>
                      {i === 0 ? (
                        <button type="button" className="app-changes__el" title="Select it in Shanku (and Revit, when Sync is on); tick or untick all its changes with Alt + click" onClick={(e) => (e.altKey ? toggle(cs.map(changeKey), cs.some((x) => unticked.has(changeKey(x)))) : p.onSelectElements([gid]))}>
                          {c.element}
                        </button>
                      ) : null}
                    </td>
                    <td>{c.name}</td>
                    <td className="app-changes__old">{c.oldDisplay || '—'}</td>
                    <td className="app-changes__new">{c.value || '—'}</td>
                    <td className="app-changes__st">{st ? (st.ok ? <span className="ok">✓ ok</span> : <span className="bad">✗ {st.message}</span>) : ''}</td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      {needsReview ? (
        <label className="app-changes__review">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> I have reviewed these changes to {tickedElements} elements
        </label>
      ) : null}
      <div className="app-changes__bar">
        <span className="app-changes__count">
          {ticked.length} of {p.pending.length} ticked · {tickedElements} element{tickedElements === 1 ? '' : 's'}
        </span>
        <span className="app-spacer" />
        <Button size="sm" disabled={!ticked.length || !!p.busy} onClick={() => p.onRemove(ticked)}>
          Remove
        </Button>
        <Button size="sm" disabled={!ticked.length || !p.canApply || !!p.busy} onClick={() => p.onRefresh(ticked)} title="Take Revit's current values as the base (after a conflict). Your new values stay; changes that now match Revit are removed.">
          Refresh from Revit
        </Button>
        <Button size="sm" disabled={!ticked.length || !p.canApply || !!p.busy} onClick={() => p.onCheck(ticked)} title="Revit checks each change and keeps nothing">
          {p.busy === 'check' ? 'Checking…' : 'Check in Revit'}
        </Button>
        <Button variant="primary" size="sm" disabled={!ticked.length || !p.canApply || !!p.busy || (needsReview && !reviewed)} onClick={() => p.onApply(ticked)} title={p.canApply ? 'One Revit transaction: one Edit → Undo in Revit takes it all back' : p.why}>
          {p.busy === 'apply' ? 'Applying…' : `Apply ${ticked.length} to Revit`}
        </Button>
      </div>
      {!p.canApply && p.why ? <p className="app-changes__hint">{p.why}</p> : null}
    </div>
  );
}
