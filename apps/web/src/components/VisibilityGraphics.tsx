import { useEffect, useState } from 'react';
import { Button } from '@shanku/ui';
import type { CategoryOverrides, GraphicsOverride } from '../lib/visibility';
import type { AppliedFilter, ViewFilter } from '../lib/filters';

export interface VgCategory {
  id: string;
  label: string;
  count: number;
}

/** Revit's Visibility/Graphics Overrides → Model Categories: visibility, surface colour, transparency, halftone. */
export function VisibilityGraphicsDialog({
  categories,
  value,
  applied,
  filters,
  focus,
  tab: initialTab = 'categories',
  onApply,
  onEditFilters,
  onClose,
}: {
  categories: VgCategory[];
  value: CategoryOverrides;
  /** Filters applied to this view (Filters tab), highest priority first. */
  applied: AppliedFilter[];
  filters: ViewFilter[];
  /** Category to highlight (from "Override Graphics in View › By Category"). */
  focus?: string;
  tab?: 'categories' | 'filters';
  onApply: (next: { categories: CategoryOverrides; applied: AppliedFilter[] }) => void;
  onEditFilters: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CategoryOverrides>(value);
  const [appliedDraft, setAppliedDraft] = useState<AppliedFilter[]>(applied);
  const [tab, setTab] = useState(initialTab);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => setAppliedDraft(applied), [applied]);
  const setA = (i: number, patch: Partial<AppliedFilter>) => setAppliedDraft((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setAo = (i: number, patch: GraphicsOverride) => setAppliedDraft((a) => a.map((x, j) => (j === i ? { ...x, override: { ...x.override, ...patch } } : x)));
  const move = (i: number, d: -1 | 1) => setAppliedDraft((a) => {
    const n = [...a];
    const j = i + d;
    if (j < 0 || j >= n.length) return a;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const unapplied = filters.filter((f) => !appliedDraft.some((a) => a.filterId === f.id));
  const get = (id: string): GraphicsOverride => draft[id] ?? {};
  const set = (id: string, patch: GraphicsOverride) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const allVisible = (v: boolean | 'invert') =>
    setDraft((d) => Object.fromEntries(categories.map((c) => [c.id, { ...d[c.id], visible: v === 'invert' ? !(d[c.id]?.visible ?? true) : v }])));
  const dirty = JSON.stringify(draft) !== JSON.stringify(value) || JSON.stringify(appliedDraft) !== JSON.stringify(applied);
  const apply = () => onApply({ categories: draft, applied: appliedDraft });

  return (
    <div className="vg">
      <div className="vg-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'categories'} className={tab === 'categories' ? 'is-on' : undefined} onClick={() => setTab('categories')}>Model Categories</button>
        <button type="button" role="tab" aria-selected={tab === 'filters'} className={tab === 'filters' ? 'is-on' : undefined} onClick={() => setTab('filters')}>
          Filters{appliedDraft.length ? ` (${appliedDraft.length})` : ''}
        </button>
      </div>
      {tab === 'filters' ? (
        <div className="vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <th className="c">Enable</th>
                <th>Filter</th>
                <th className="c">Visibility</th>
                <th>Projection/Surface colour</th>
                <th className="n">Transparency</th>
                <th className="c">Halftone</th>
                <th className="c">Priority</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {appliedDraft.map((a, i) => {
                const f = filters.find((x) => x.id === a.filterId);
                const o = a.override;
                const name = f?.name ?? 'Missing filter';
                return (
                  <tr key={a.filterId}>
                    <td className="c"><input type="checkbox" aria-label={`Enable ${name}`} checked={a.enabled} onChange={(e) => setA(i, { enabled: e.target.checked })} /></td>
                    <td>{name}</td>
                    <td className="c"><input type="checkbox" aria-label={`Show ${name}`} checked={o.visible ?? true} onChange={(e) => setAo(i, { visible: e.target.checked })} /></td>
                    <td>
                      <span className="vg-color">
                        <input type="color" aria-label={`${name} colour`} value={o.color ?? '#9aa0a8'} onChange={(e) => setAo(i, { color: e.target.value })} />
                        {o.color ? <button type="button" className="app-link" onClick={() => setAo(i, { color: null })}>None</button> : <span className="vg-faint">No override</span>}
                      </span>
                    </td>
                    <td className="n">
                      <span className="vg-tr">
                        <input type="range" min={0} max={100} step={5} aria-label={`${name} transparency`} value={o.transparency ?? 0} onChange={(e) => setAo(i, { transparency: Number(e.target.value) })} />
                        <span>{o.transparency ?? 0}%</span>
                      </span>
                    </td>
                    <td className="c"><input type="checkbox" aria-label={`${name} halftone`} checked={o.halftone ?? false} onChange={(e) => setAo(i, { halftone: e.target.checked })} /></td>
                    <td className="c">
                      <button type="button" className="sk-icon-button" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button type="button" className="sk-icon-button" aria-label={`Move ${name} down`} disabled={i === appliedDraft.length - 1} onClick={() => move(i, 1)}>↓</button>
                    </td>
                    <td><button type="button" className="sk-icon-button" aria-label={`Remove ${name}`} onClick={() => setAppliedDraft((d) => d.filter((_, j) => j !== i))}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!appliedDraft.length ? <p className="vg-faint" style={{ padding: '10px 4px' }}>No filters applied. Add one below; the filter higher in the list wins where several match.</p> : null}
        </div>
      ) : null}
      <div className="vg-scroll" hidden={tab !== 'categories'}>
        <table className="vg-table">
          <thead>
            <tr>
              <th className="c">Visibility</th>
              <th>Category</th>
              <th>Projection/Surface colour</th>
              <th className="n">Transparency</th>
              <th className="c">Halftone</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => {
              const o = get(c.id);
              return (
                <tr key={c.id} className={focus === c.id ? 'is-focus' : undefined}>
                  <td className="c">
                    <input type="checkbox" aria-label={`Show ${c.label}`} checked={o.visible ?? true} onChange={(e) => set(c.id, { visible: e.target.checked })} />
                  </td>
                  <td>
                    {c.label} <span className="vg-count">{c.count.toLocaleString('en-IN')}</span>
                  </td>
                  <td>
                    <span className="vg-color">
                      <input type="color" aria-label={`${c.label} colour`} value={o.color ?? '#9aa0a8'} onChange={(e) => set(c.id, { color: e.target.value })} />
                      {o.color ? (
                        <button type="button" className="app-link" onClick={() => set(c.id, { color: null })}>
                          By category
                        </button>
                      ) : (
                        <span className="vg-faint">No override</span>
                      )}
                    </span>
                  </td>
                  <td className="n">
                    <span className="vg-tr">
                      <input type="range" min={0} max={100} step={5} aria-label={`${c.label} transparency`} value={o.transparency ?? 0} onChange={(e) => set(c.id, { transparency: Number(e.target.value) })} />
                      <span>{o.transparency ?? 0}%</span>
                    </span>
                  </td>
                  <td className="c">
                    <input type="checkbox" aria-label={`${c.label} halftone`} checked={o.halftone ?? false} onChange={(e) => set(c.id, { halftone: e.target.checked })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="vg-actions">
        {tab === 'categories' ? (
          <>
            <Button size="sm" onClick={() => allVisible(true)}>All</Button>
            <Button size="sm" onClick={() => allVisible(false)}>None</Button>
            <Button size="sm" onClick={() => allVisible('invert')}>Invert</Button>
            <Button size="sm" onClick={() => setDraft({})}>Clear overrides</Button>
          </>
        ) : (
          <>
            <select
              className="flt-add"
              aria-label="Add a filter"
              value=""
              disabled={!unapplied.length}
              onChange={(e) => e.target.value && setAppliedDraft((a) => [...a, { filterId: e.target.value, enabled: true, override: {} }])}
            >
              <option value="">{unapplied.length ? 'Add filter…' : filters.length ? 'All filters added' : 'No filters defined'}</option>
              {unapplied.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <Button size="sm" onClick={onEditFilters}>Edit/New…</Button>
          </>
        )}
        <span className="app-spacer" />
        <Button size="sm" variant="primary" onClick={() => { if (dirty) apply(); onClose(); }}>OK</Button>
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!dirty} onClick={apply}>Apply</Button>
      </div>
    </div>
  );
}

/** Revit's View-Specific Element Graphics ("Override Graphics in View › By Element"). */
export function ElementGraphicsDialog({
  count,
  value,
  onApply,
  onClose,
}: {
  count: number;
  value: GraphicsOverride;
  onApply: (next: GraphicsOverride | null) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<GraphicsOverride>(value);
  useEffect(() => setD(value), [value]);
  return (
    <div className="vg vg--small">
      <p className="vg-faint">Applies to {count.toLocaleString('en-IN')} selected element{count === 1 ? '' : 's'} in this view. Overrides the category settings.</p>
      <label className="vg-field">
        <span>Surface colour</span>
        <span className="vg-color">
          <input type="color" aria-label="Element colour" value={d.color ?? '#9aa0a8'} onChange={(e) => setD({ ...d, color: e.target.value })} />
          {d.color ? <button type="button" className="app-link" onClick={() => setD({ ...d, color: undefined })}>By category</button> : <span className="vg-faint">By category</span>}
        </span>
      </label>
      <label className="vg-field">
        <span>Transparency</span>
        <span className="vg-tr">
          <input type="range" min={0} max={100} step={5} aria-label="Element transparency" value={d.transparency ?? 0} onChange={(e) => setD({ ...d, transparency: Number(e.target.value) })} />
          <span>{d.transparency ?? 0}%</span>
        </span>
      </label>
      <label className="vg-field">
        <span>Halftone</span>
        <input type="checkbox" aria-label="Element halftone" checked={d.halftone ?? false} onChange={(e) => setD({ ...d, halftone: e.target.checked })} />
      </label>
      <div className="vg-actions">
        <Button size="sm" onClick={() => { onApply(null); onClose(); }}>Reset</Button>
        <span className="app-spacer" />
        <Button size="sm" variant="primary" onClick={() => { onApply(d); onClose(); }}>OK</Button>
        <Button size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
