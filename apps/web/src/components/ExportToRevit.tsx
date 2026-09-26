import { useMemo, useState } from 'react';
import { Button } from '@shanku/ui';
import type { RevitExchange } from '@shanku/engine';
import type { CreateReport } from '../lib/revitBridge';
import { KIND_LABEL, exportSets } from '../lib/exportPlan';
import { BuildProgress } from './BuildProgress';
import type { Task } from '../lib/progress';

/** Above this many elements, Create asks the user to confirm they reviewed the plan. */
export const EXPORT_REVIEW_THRESHOLD = 500;

export type ExportPhase = 'preparing' | 'review' | 'creating' | 'done' | 'error';

export interface ExportState {
  phase: ExportPhase;
  message?: string;
  exchange?: RevitExchange;
  /** The dry run (review) or the real run (done). */
  report?: CreateReport;
  /** Revit model it goes to. */
  target?: string;
}

export interface ExportToRevitProps {
  state: ExportState;
  off: ReadonlySet<string>;
  onToggle: (keys: string[], on: boolean) => void;
  onCheck: () => void;
  onCreate: () => void;
  onLoad: () => void;
  loading: boolean;
  /** Revit's work in progress (the 'revit' task), shown inside this window while it checks or builds. */
  progress?: Task | null;
}

const ACTION: Record<string, string> = { exists: 'in Revit', 'same-elevation': 'same height in Revit', create: 'new' };

/**
 * Export to Revit: the drawing's model is checked by Revit first (a dry run: nothing is kept), shown
 * here for approval by level and kind, then created as one Revit undo; Shanku then loads it back.
 */
export function ExportToRevit({ state, off, onToggle, onCheck, onCreate, onLoad, loading, progress }: ExportToRevitProps) {
  const [reviewed, setReviewed] = useState(false);
  const x = state.exchange;
  const r = state.report;
  const sets = useMemo(() => (x ? exportSets(x) : []), [x]);
  const byId = useMemo(() => new Map((r?.results ?? []).map((res) => [res.id, res])), [r]);
  const existing = useMemo(() => new Set(r?.existing ?? []), [r]);
  const chosen = sets.filter((s) => !off.has(s.key)).reduce((n, s) => n + s.ids.filter((id) => !existing.has(id)).length, 0);
  const problems = (r?.results ?? []).filter((res) => !res.ok);
  const notes = (r?.results ?? []).filter((res) => res.ok && res.note);

  if (state.phase === 'preparing' || state.phase === 'creating')
    return (
      <div className="app-export app-export--busy" role="status">
        <p>{state.phase === 'preparing' ? 'Revit is checking the plan: levels, types, and one element of each type (nothing is kept)…' : 'Revit is creating the elements…'}</p>
        <p className="app-export__hint">{state.phase === 'preparing' ? 'Usually a few seconds.' : 'Revit creates every element, then regenerates the model once.'} Close any dialog open in Revit.</p>
        {progress ? <BuildProgress task={progress} variant="inline" /> : null}
      </div>
    );
  if (state.phase === 'error')
    return (
      <div className="app-export">
        <p className="app-export__error">{state.message}</p>
        <div className="app-export__bar">
          <span className="app-spacer" />
          <Button size="sm" onClick={onCheck}>
            Try again
          </Button>
        </div>
      </div>
    );
  if (!x || !r) return null;

  if (state.phase === 'done') {
    const made = r.results.filter((res) => res.ok).length;
    return (
      <div className="app-export">
        <div className="app-export__done">
          <strong>
            Created {made} element{made === 1 ? '' : 's'} in {state.target}
          </strong>
          <span>
            As one undo in Revit: <em>{r.undoName}</em>. Revit shows them selected and comes to the front, maximised (add-in 0.10.0 and later).
          </span>
        </div>
        {problems.length ? <Problems list={problems} title={`${problems.length} not created`} /> : null}
        {notes.length ? <Notes list={notes} /> : null}
        {r.warnings.length ? <Warnings list={r.warnings} /> : null}
        <div className="app-export__bar">
          <span className="app-export__hint">Shanku loads the model from Revit, so both stay in step.</span>
          <span className="app-spacer" />
          <Button size="sm" variant="primary" disabled={loading} onClick={onLoad}>
            {loading ? 'Loading…' : 'Load it in Shanku'}
          </Button>
        </div>
      </div>
    );
  }

  // review
  const newTypes = r.types.filter((t) => t.action === 'create');
  const needsReview = chosen > EXPORT_REVIEW_THRESHOLD;
  return (
    <div className="app-export">
      <div className="app-export__scroll">
        <section>
          <h3>Levels</h3>
          <ul className="app-export__levels">
            {r.levels.map((l) => (
              <li key={l.name}>
                <span>{l.name}</span>
                <span className="app-export__num">{l.elevation.toLocaleString('en-IN')} mm</span>
                <span className={`app-export__tag app-export__tag--${l.action}`} title={l.action === 'exists-elsewhere' ? 'Revit has a level with this name at another height (perhaps from an earlier export). Elements are placed at their drawn heights with offsets from it; move the level in Revit or export into a fresh model.' : undefined}>
                  {l.action === 'same-elevation' ? `uses “${l.revitName}”` : l.action === 'exists-elsewhere' ? `in Revit at ${(l.revitElevation ?? 0).toLocaleString('en-IN')} mm: check` : ACTION[l.action]}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Elements</h3>
          <table className="app-export__sets">
            <thead>
              <tr>
                <th className="c">
                  <input type="checkbox" aria-label="All sets" checked={off.size === 0} ref={(el) => el && (el.indeterminate = off.size > 0 && off.size < sets.length)} onChange={(e) => onToggle(sets.map((s) => s.key), e.target.checked)} />
                </th>
                <th>Level</th>
                <th>Kind</th>
                <th className="n">New</th>
                <th className="n">In Revit</th>
                <th className="n">Problems</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => {
                const inRevit = s.ids.filter((id) => existing.has(id)).length;
                const bad = s.ids.filter((id) => byId.get(id)?.ok === false).length;
                return (
                  <tr key={s.key} className={off.has(s.key) ? 'is-off' : undefined}>
                    <td className="c">
                      <input type="checkbox" aria-label={`${KIND_LABEL[s.kind] ?? s.kind} on ${s.level}`} checked={!off.has(s.key)} onChange={(e) => onToggle([s.key], e.target.checked)} />
                    </td>
                    <td>{s.level}</td>
                    <td>{KIND_LABEL[s.kind] ?? s.kind}</td>
                    <td className="n">{s.ids.length - inRevit}</td>
                    <td className="n">{inRevit || ''}</td>
                    <td className="n">{bad ? <span className="bad">{bad}</span> : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section>
          <h3>Types</h3>
          <p className="app-export__hint">
            {r.types.length - newTypes.length} from the model, {newTypes.length} new{newTypes.length ? ' (duplicated from a template type and resized)' : ''}.
          </p>
          {newTypes.length ? (
            <ul className="app-export__types">
              {newTypes.map((t) => (
                <li key={t.name}>
                  <span>{t.name}</span>
                  <span className="app-export__hint">{t.family}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        {existing.size ? <p className="app-export__hint">{existing.size} element{existing.size === 1 ? ' is' : 's are'} already in Revit (same CH-ID) and will not be created again.</p> : null}
        {x.skipped.length ? (
          <details className="app-export__skipped">
            <summary>{x.skipped.length} not exported</summary>
            <ul>
              {x.skipped.map((s) => (
                <li key={s.id}>
                  {s.mark} ({s.kind}, {s.level}): {s.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {problems.length ? <Problems list={problems} title={`${problems.length} Revit would refuse`} /> : null}
        {r.warnings.length ? <Warnings list={r.warnings} /> : null}
      </div>
      {needsReview ? (
        <label className="app-export__review">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> I have reviewed this plan for {chosen} elements
        </label>
      ) : null}
      <div className="app-export__bar">
        <span className="app-export__hint">Revit checked this plan and kept nothing. Creating it is one undo in Revit.</span>
        <span className="app-spacer" />
        <Button size="sm" onClick={onCheck}>
          Check again
        </Button>
        <Button size="sm" variant="primary" disabled={!chosen || (needsReview && !reviewed)} onClick={onCreate}>
          Create {chosen} in Revit
        </Button>
      </div>
    </div>
  );
}

function Problems({ list, title }: { list: CreateReport['results']; title: string }) {
  return (
    <details className="app-export__problems" open>
      <summary>{title}</summary>
      <ul>
        {list.slice(0, 200).map((p) => (
          <li key={p.id}>
            <code>{p.id}</code>
            {p.typeName ? ` (${p.typeName})` : ''}: {p.error}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Notes({ list }: { list: CreateReport['results'] }) {
  return (
    // Opens by itself when something still needs checking by eye (e.g. a height Revit could not match).
    <details className="app-export__notes" open={list.some((p) => p.note?.includes('Check it'))}>
      <summary>{list.length} adjusted by Revit's check</summary>
      <ul>
        {list.slice(0, 200).map((p) => (
          <li key={p.id}>
            <code>{p.id}</code>: {p.note}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Warnings({ list }: { list: string[] }) {
  return (
    <div className="app-changes__warn" role="status">
      <strong>Revit warns</strong>
      <ul>
        {list.slice(0, 20).map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
