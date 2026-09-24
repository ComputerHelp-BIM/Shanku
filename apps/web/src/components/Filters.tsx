import { useEffect, useMemo, useState } from 'react';
import { Button } from '@shanku/ui';
import {
  FILTER_PARAMS,
  NUMBER_OPS,
  TEXT_OPS,
  filterMatches,
  isNumeric,
  newFilterId,
  type FilterParam,
  type FilterableElement,
  type ViewFilter,
} from '../lib/filters';
import type { VgCategory } from './VisibilityGraphics';

/** Revit's Filters dialog: define rule-based filters (categories + rules), then apply them in VG → Filters. */
export function FiltersManager({
  filters,
  categories,
  elements,
  onApply,
  onClose,
}: {
  filters: ViewFilter[];
  categories: VgCategory[];
  elements: ReadonlyArray<FilterableElement>;
  onApply: (next: ViewFilter[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ViewFilter[]>(filters);
  const [cur, setCur] = useState<string | null>(filters[0]?.id ?? null);
  useEffect(() => {
    setDraft(filters);
  }, [filters]);
  const f = draft.find((x) => x.id === cur) ?? null;
  const update = (patch: Partial<ViewFilter>) => setDraft((d) => d.map((x) => (x.id === cur ? { ...x, ...patch } : x)));
  const matches = useMemo(() => (f ? elements.filter((e) => filterMatches(e, f)).length : 0), [f, elements]);
  // Suggestions for rule values, from the model (like Revit's value drop-down).
  const suggestions = useMemo(() => {
    const m: Partial<Record<FilterParam, string[]>> = {};
    const add = (p: FilterParam, v: string) => v && (m[p] ??= []).push(v);
    const seen = new Set<string>();
    for (const e of elements) {
      for (const [p, v] of [['Mark', e.mark], ['Level', e.level], ['Type', e.typeName], ['Grade', e.grade], ['IFC class', e.ifcClass]] as const) {
        const k = `${p}|${v}`;
        if (!seen.has(k)) {
          seen.add(k);
          add(p, v);
        }
      }
    }
    return m;
  }, [elements]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(filters);
  const create = (base?: ViewFilter) => {
    const id = newFilterId();
    const n: ViewFilter = base
      ? { ...base, id, name: `${base.name} copy`, rules: base.rules.map((r) => ({ ...r })) }
      : { id, name: `Filter ${draft.length + 1}`, categories: [], combine: 'and', rules: [{ param: 'Mark', op: 'begins with', value: '' }] };
    setDraft((d) => [...d, n]);
    setCur(id);
  };

  return (
    <div className="vg flt">
      <div className="flt-body">
        <aside className="flt-list">
          <ul role="listbox" aria-label="Filters">
            {draft.map((x) => (
              <li key={x.id} role="option" aria-selected={x.id === cur} className={x.id === cur ? 'is-on' : undefined} onClick={() => setCur(x.id)}>
                {x.name || 'Untitled'}
              </li>
            ))}
            {!draft.length ? <li className="vg-faint">No filters yet.</li> : null}
          </ul>
          <div className="flt-list__btns">
            <Button size="sm" onClick={() => create()}>New</Button>
            <Button size="sm" disabled={!f} onClick={() => f && create(f)}>Duplicate</Button>
            <Button size="sm" disabled={!f} onClick={() => { setDraft((d) => d.filter((x) => x.id !== cur)); setCur(draft.find((x) => x.id !== cur)?.id ?? null); }}>Delete</Button>
          </div>
        </aside>
        {f ? (
          <section className="flt-edit">
            <label className="vg-field">
              <span>Name</span>
              <input className="flt-input" aria-label="Filter name" value={f.name} onChange={(e) => update({ name: e.target.value })} />
            </label>
            <fieldset className="flt-cats">
              <legend>Categories <span className="vg-faint">(none ticked = all)</span></legend>
              {categories.map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={f.categories.includes(c.id)}
                    onChange={(e) => update({ categories: e.target.checked ? [...f.categories, c.id] : f.categories.filter((x) => x !== c.id) })}
                  />
                  {c.label}
                </label>
              ))}
            </fieldset>
            <div className="flt-rules">
              <div className="flt-rules__head">
                <strong>Rules</strong>
                <select aria-label="Combine rules" value={f.combine} onChange={(e) => update({ combine: e.target.value as 'and' | 'or' })}>
                  <option value="and">All rules (AND)</option>
                  <option value="or">Any rule (OR)</option>
                </select>
              </div>
              {f.rules.map((r, i) => {
                const ops = isNumeric(r.param) ? NUMBER_OPS : TEXT_OPS;
                const set = (patch: Partial<typeof r>) => update({ rules: f.rules.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={i} className="flt-rule">
                    <select aria-label={`Rule ${i + 1} parameter`} value={r.param} onChange={(e) => {
                      const p = e.target.value as FilterParam;
                      set({ param: p, op: (isNumeric(p) ? NUMBER_OPS : TEXT_OPS).includes(r.op) ? r.op : isNumeric(p) ? 'greater than' : 'equals' });
                    }}>
                      {FILTER_PARAMS.map((p) => <option key={p}>{p}</option>)}
                    </select>
                    <select aria-label={`Rule ${i + 1} operator`} value={r.op} onChange={(e) => set({ op: e.target.value as typeof r.op })}>
                      {ops.map((o) => <option key={o}>{o}</option>)}
                    </select>
                    <input className="flt-input" aria-label={`Rule ${i + 1} value`} list={`flt-sugg-${r.param}`} inputMode={isNumeric(r.param) ? 'decimal' : undefined} value={r.value} onChange={(e) => set({ value: e.target.value })} />
                    <button type="button" className="sk-icon-button" aria-label={`Remove rule ${i + 1}`} onClick={() => update({ rules: f.rules.filter((_, j) => j !== i) })}>×</button>
                  </div>
                );
              })}
              <Button size="sm" onClick={() => update({ rules: [...f.rules, { param: 'Level', op: 'equals', value: '' }] })}>Add rule</Button>
              {Object.entries(suggestions).map(([p, vals]) => (
                <datalist key={p} id={`flt-sugg-${p}`}>
                  {vals!.slice(0, 200).map((v) => <option key={v} value={v} />)}
                </datalist>
              ))}
            </div>
            <p className="flt-count">Matches <strong>{matches.toLocaleString('en-IN')}</strong> element{matches === 1 ? '' : 's'} in this model.</p>
          </section>
        ) : (
          <section className="flt-edit vg-faint">Create a filter with New, then apply it in Visibility/Graphics → Filters.</section>
        )}
      </div>
      <div className="vg-actions">
        <span className="app-spacer" />
        <Button size="sm" variant="primary" onClick={() => { if (dirty) onApply(draft); onClose(); }}>OK</Button>
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={!dirty} onClick={() => onApply(draft)}>Apply</Button>
      </div>
    </div>
  );
}
