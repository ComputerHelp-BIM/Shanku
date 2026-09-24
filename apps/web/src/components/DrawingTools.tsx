import { useId, useMemo, useState } from 'react';
import { Button } from '@shanku/ui';
import { objectTypeLabel, type EntityIndex, type ParsedDrawing } from '@shanku/engine';
import { DEFAULT_QUICK_SELECT, findText, quickPropertyRows, quickSelect, type QuickSelectCriteria } from '../lib/drawingTools';
import { fmtCount } from '../lib/format';

interface DrawingData {
  drawing: ParsedDrawing;
  index: EntityIndex;
  /** Visible objects (layer on, not hidden by isolation). */
  visible: number[];
}

/**
 * Quick Select (QSELECT): pick objects by type, layer and colour, in the whole drawing or inside the
 * current selection, including or excluding the matches, optionally appending. Shows the result count
 * before applying, so there are no surprises.
 */
export function QuickSelectPanel({ drawing, index, visible, selection, onApply }: DrawingData & { selection: number[]; onApply: (entities: number[]) => void }) {
  const [c, setC] = useState<QuickSelectCriteria>(DEFAULT_QUICK_SELECT);
  const id = useId();
  const set = (patch: Partial<QuickSelectCriteria>) => setC((x) => ({ ...x, ...patch }));
  // Options list only what is visible, with counts, most common first.
  const options = useMemo(() => {
    const types = new Map<string, number>();
    const layers = new Map<number, number>();
    const colors = new Map<number, number>();
    for (const e of visible) {
      const t = drawing.types[e] ?? '';
      types.set(t, (types.get(t) ?? 0) + 1);
      layers.set(index.layer[e], (layers.get(index.layer[e]) ?? 0) + 1);
      colors.set(index.color[e], (colors.get(index.color[e]) ?? 0) + 1);
    }
    const byCount = <K,>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1]);
    return { types: byCount(types), layers: byCount(layers), colors: byCount(colors) };
  }, [drawing, index, visible]);
  const result = useMemo(() => quickSelect(drawing.types, index, visible, selection, c), [drawing, index, visible, selection, c]);
  const num = (v: string) => (v === '' ? null : Number(v));

  return (
    <form
      className="app-qs"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(result);
      }}
    >
      <label htmlFor={`${id}-scope`}>Apply to</label>
      <select id={`${id}-scope`} className="app-select" value={c.scope} onChange={(e) => set({ scope: e.target.value as QuickSelectCriteria['scope'] })}>
        <option value="drawing">Entire drawing</option>
        <option value="selection" disabled={!selection.length}>
          Current selection ({fmtCount(selection.length)})
        </option>
      </select>
      <label htmlFor={`${id}-type`}>Object type</label>
      <select id={`${id}-type`} className="app-select" value={c.type ?? ''} onChange={(e) => set({ type: e.target.value || null })}>
        <option value="">Multiple (any type)</option>
        {options.types.map(([t, n]) => (
          <option key={t} value={t}>
            {objectTypeLabel(t)} ({fmtCount(n)})
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-layer`}>Layer</label>
      <select id={`${id}-layer`} className="app-select" value={c.layer ?? ''} onChange={(e) => set({ layer: num(e.target.value) })}>
        <option value="">Any layer</option>
        {options.layers.map(([l, n]) => (
          <option key={l} value={l}>
            {drawing.layers[l]?.name ?? `Layer ${l}`} ({fmtCount(n)})
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-color`}>Colour</label>
      <select id={`${id}-color`} className="app-select" value={c.color ?? ''} onChange={(e) => set({ color: num(e.target.value) })}>
        <option value="">Any colour</option>
        {options.colors.map(([k, n]) => (
          <option key={k} value={k}>
            {drawing.palette[k] === '#000000' ? 'Colour 7 (black / white)' : drawing.palette[k]?.toUpperCase()} ({fmtCount(n)})
          </option>
        ))}
      </select>
      <fieldset className="app-qs__apply">
        <legend>How to apply</legend>
        <label>
          <input type="radio" name={`${id}-apply`} checked={c.apply === 'include'} onChange={() => set({ apply: 'include' })} /> Include in new selection
        </label>
        <label>
          <input type="radio" name={`${id}-apply`} checked={c.apply === 'exclude'} onChange={() => set({ apply: 'exclude' })} /> Exclude from new selection
        </label>
        <label>
          <input type="checkbox" checked={c.append} onChange={(e) => set({ append: e.target.checked })} /> Append to current selection
        </label>
      </fieldset>
      <div className="app-qs__foot">
        <span className="app-faint" role="status">
          {fmtCount(result.length)} {result.length === 1 ? 'object' : 'objects'} will be selected
        </span>
        <Button size="sm" variant="ghost" type="button" onClick={() => setC(DEFAULT_QUICK_SELECT)}>
          Reset
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={!result.length}>
          Select
        </Button>
      </div>
    </form>
  );
}

/** Find (FIND) in the drawing's text; pick a result to select it and zoom to it. */
export function FindTextPanel({ drawing, visibleSet, onPick, onSelectAll }: { drawing: ParsedDrawing; visibleSet: Set<number>; onPick: (entity: number) => void; onSelectAll: (entities: number[]) => void }) {
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const id = useId();
  const hits = useMemo(() => findText(drawing.texts, query, { matchCase, wholeWord, isVisible: (e) => visibleSet.has(e) }), [drawing, query, matchCase, wholeWord, visibleSet]);
  const SHOWN = 300;
  return (
    <div className="app-find">
      <div className="app-find__bar">
        <label htmlFor={`${id}-q`} className="app-sr">
          Find text
        </label>
        <input id={`${id}-q`} type="search" className="app-find__input" placeholder="Find text, e.g. C12 or 230X450" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
        <label>
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case
        </label>
        <label>
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} /> Whole words
        </label>
      </div>
      <div className="app-find__meta" role="status">
        {query.trim() ? `${fmtCount(hits.length)} ${hits.length === 1 ? 'match' : 'matches'}${hits.length > SHOWN ? `, first ${SHOWN} shown` : ''}` : 'Searches TEXT, MTEXT and block attributes on visible layers.'}
        {hits.length > 1 ? (
          <Button size="sm" variant="ghost" onClick={() => onSelectAll([...new Set(hits.map((h) => h.entity))])}>
            Select all
          </Button>
        ) : null}
      </div>
      <ul className="app-find__list" aria-label="Matches">
        {hits.slice(0, SHOWN).map((h, i) => (
          <li key={`${h.entity}-${i}`}>
            <button type="button" onClick={() => onPick(h.entity)}>
              <span className="app-find__text">{h.text.replace(/\n/g, ' ⏎ ')}</span>
              <span className="app-find__layer">{drawing.layers[h.layer]?.name ?? ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Quick Properties (QP): a small panel over the drawing with the main properties of the selected
 * object, as AutoCAD shows for a polyline: Color, Layer, Linetype, Global width, Closed.
 */
export function QuickProperties({ props, count, onClose }: { props: Record<string, string | number | number[]> | null; count: number; onClose: () => void }) {
  return (
    <section className="app-qp" aria-label="Quick properties">
      <header className="app-qp__head">
        <strong>{props ? String(props.Type) : 'Loading…'}</strong>
        {count > 1 ? <span className="app-faint"> and {fmtCount(count - 1)} more</span> : null}
        <button type="button" className="app-qp__close" aria-label="Turn off Quick Properties" title="Turn off Quick Properties" onClick={onClose}>
          ×
        </button>
      </header>
      {props ? (
        <dl className="app-qp__rows">
          {quickPropertyRows(props).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
