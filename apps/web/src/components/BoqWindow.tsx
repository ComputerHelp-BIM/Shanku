import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@shanku/ui';
import { CATEGORY_ORDER, siFactor, type ElementRecord, type ParsedModel } from '@shanku/engine';
import { buildBoqWorkbook, downloadFile } from '../lib/excel';
import { clearOverride, inr, itemKey, parseRate, rateFor, rateItems, setItemRate, setOverride, type RateBook } from '../lib/rates';

type Tab = 'elements' | 'levels' | 'summary' | 'rates';
type SortKey = 'mark' | 'id' | 'level' | 'category' | 'type' | 'grade' | 'length' | 'width' | 'depth' | 'height' | 'area' | 'volume' | 'rate' | 'amount';

const ROW = 26;
const MIN_W = 640;
const MIN_H = 320;
const d2 = (v: number | null) => (v === null ? '—' : inr(v, 2));
const d3 = (v: number) => inr(v, 3);

interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}
const loadGeom = (): Geometry => {
  try {
    const g = JSON.parse(localStorage.getItem('shanku.boqWindow') ?? 'null');
    if (g && [g.x, g.y, g.w, g.h].every(Number.isFinite)) return g;
  } catch {
    /* fall through */
  }
  return { x: 24, y: 24, w: 1080, h: 520 };
};

export interface BoqWindowProps {
  model: ParsedModel;
  rates: RateBook;
  onRates: (book: RateBook) => void;
  selection: number[];
  onSelect: (indices: number[], mode: 'replace' | 'add' | 'remove') => void;
  markRules: string[];
  gradeRules: string[];
  appVersion: string;
  color?: string;
  onEditGradeRules: () => void;
  onLog: (text: string, tone?: 'info' | 'error') => void;
  /** Floating over the 3D view (default) or docked in the bottom panel. */
  mode: 'floating' | 'docked';
  onDock?: () => void;
  onFloat?: () => void;
  onClose?: () => void;
}

/** The approved BOQ window: Elements, Levels, Summary, Rates; item rates with per-element overrides. */
export function BoqWindow(p: BoqWindowProps) {
  const { model, rates, onRates } = p;
  const [tab, setTab] = useState<Tab>('elements');
  const [filter, setFilter] = useState('');
  const [cat, setCat] = useState('');
  const [lvl, setLvl] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'volume', asc: false });
  const [busy, setBusy] = useState(false);
  const [geom, setGeom] = useState<Geometry>(loadGeom);
  const [minimised, setMinimised] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(400);
  const scroller = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(p.selection), [p.selection]);

  useEffect(() => {
    try {
      localStorage.setItem('shanku.boqWindow', JSON.stringify(geom));
    } catch {
      /* ignore */
    }
  }, [geom]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab, minimised]);

  // ---------- data ----------
  const els = model.elements;
  const levels = model.info.levels.map((l) => l.name);
  const cats = CATEGORY_ORDER.filter((c) => model.info.categories[c]);
  const q = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    const val = (e: ElementRecord, k: SortKey): string | number | null => {
      switch (k) {
        case 'mark': return e.mark || null;
        case 'id': return e.expressId;
        case 'level': return e.level;
        case 'category': return CATEGORY_ORDER.indexOf(e.category);
        case 'type': return e.typeName;
        case 'grade': return e.grade;
        case 'length': case 'width': case 'depth': case 'height': return e.dims[k];
        case 'area': return e.area;
        case 'volume': return e.volume;
        case 'rate': return rateFor(e, rates).rate;
        case 'amount': return rateFor(e, rates).amount;
      }
    };
    const list = els.filter(
      (e) =>
        (!cat || e.category === cat) &&
        (!lvl || e.level === lvl) &&
        (!q || [e.mark, e.level, e.typeName, e.grade, String(e.expressId)].some((s) => s.toLowerCase().includes(q))),
    );
    const dir = sort.asc ? 1 : -1;
    return list.sort((a, b) => {
      const x = val(a, sort.key), y = val(b, sort.key);
      if (x === null || x === '') return 1;
      if (y === null || y === '') return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * dir;
    });
  }, [els, cat, lvl, q, sort, rates]);

  const items = useMemo(() => rateItems(els, rates).sort((a, b) => CATEGORY_ORDER.indexOf(a.category as never) - CATEGORY_ORDER.indexOf(b.category as never) || a.grade.localeCompare(b.grade)), [els, rates]);
  const levelRows = useMemo(() => {
    const f = siFactor(model.info.units.length);
    const map = new Map<string, { level: string; elev: number | null; category: string; count: number; volume: number; amount: number; ids: number[] }>();
    for (const e of els) {
      const k = `${e.level}\u0000${e.category}`;
      let r = map.get(k);
      if (!r) {
        const lv = model.info.levels.find((l) => l.name === e.level);
        map.set(k, (r = { level: e.level || '(no level)', elev: lv?.elevation != null ? lv.elevation * f : null, category: e.category, count: 0, volume: 0, amount: 0, ids: [] }));
      }
      r.count++;
      r.volume += e.volume;
      r.amount += rateFor(e, rates).amount ?? 0;
      r.ids.push(e.index);
    }
    return [...map.values()].sort((a, b) => (a.elev ?? 1e9) - (b.elev ?? 1e9) || CATEGORY_ORDER.indexOf(a.category as never) - CATEGORY_ORDER.indexOf(b.category as never));
  }, [els, rates, model.info]);

  const totals = useMemo(() => {
    let volume = 0, area = 0, amount = 0;
    for (const e of visible) {
      volume += e.volume;
      area += e.area ?? 0;
      amount += rateFor(e, rates).amount ?? 0;
    }
    return { volume, area, amount };
  }, [visible, rates]);
  const overrides = Object.keys(rates.overrides).length;
  const missing = items.filter((i) => i.rate === null).length;

  // ---------- rate editing ----------
  const commitRate = (e: ElementRecord, text: string, override: boolean) => {
    const v = parseRate(text);
    if (v === null) return false;
    onRates(override ? setOverride(rates, e.globalId, v) : setItemRate(clearOverride(rates, e.globalId), itemKey(e), v));
    return true;
  };
  const rateKeys = (e: ElementRecord) => (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (!commitRate(e, ev.currentTarget.value, ev.altKey)) ev.currentTarget.value = ev.currentTarget.defaultValue;
      else ev.currentTarget.defaultValue = ev.currentTarget.value; // committed: the blur below must not commit again
      ev.currentTarget.blur();
    } else if (ev.key === 'Escape') {
      ev.stopPropagation();
      ev.currentTarget.value = ev.currentTarget.defaultValue;
      ev.currentTarget.blur();
    }
  };
  const toggleOverride = (e: ElementRecord) => (ev: ReactMouseEvent) => {
    ev.preventDefault();
    const r = rateFor(e, rates);
    if (r.source === 'override') onRates(clearOverride(rates, e.globalId));
    else if (r.rate !== null) onRates(setOverride(rates, e.globalId, r.rate));
  };

  const exportXlsx = async () => {
    setBusy(true);
    try {
      const buf = await buildBoqWorkbook({ info: model.info, elements: els, rates, markRules: p.markRules, gradeRules: p.gradeRules, appVersion: p.appVersion });
      const base = model.info.fileName.replace(/\.ifc$/i, '');
      downloadFile(buf, `${base} - BOQ.xlsx`);
      p.onLog(`Exported ${base} - BOQ.xlsx (Summary, Levels, Elements, Rates, About).`);
    } catch (e) {
      p.onLog(`BOQ export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  // ---------- window drag / resize ----------
  const drag = (kind: 'move' | 'resize') => (ev: ReactPointerEvent) => {
    if (p.mode !== 'floating' || ev.button !== 0 || (kind === 'move' && (ev.target as HTMLElement).closest('button'))) return;
    ev.preventDefault();
    const start = { px: ev.clientX, py: ev.clientY, ...geom };
    const parent = (ev.currentTarget as HTMLElement).closest('.app-drop')?.getBoundingClientRect();
    const move = (e: PointerEvent) => {
      const dx = e.clientX - start.px, dy = e.clientY - start.py;
      setGeom(() => {
        if (kind === 'resize') return { x: start.x, y: start.y, w: Math.max(MIN_W, start.w + dx), h: Math.max(MIN_H, start.h + dy) };
        const maxX = parent ? parent.width - 80 : Infinity, maxY = parent ? parent.height - 38 : Infinity;
        return { w: start.w, h: start.h, x: Math.min(maxX, Math.max(-start.w + 80, start.x + dx)), y: Math.min(maxY, Math.max(0, start.y + dy)) };
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKeyWin = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && !(ev.target instanceof HTMLInputElement) && p.onClose) {
      ev.stopPropagation();
      p.onClose();
    }
  };

  // ---------- render helpers ----------
  const Th = ({ k, label, num }: { k: SortKey; label: string; num?: boolean }) => (
    <th
      className={num ? 'n' : undefined}
      aria-sort={sort.key === k ? (sort.asc ? 'ascending' : 'descending') : 'none'}
      onClick={() => setSort((s) => (s.key === k ? { key: k, asc: !s.asc } : { key: k, asc: true }))}
    >
      {label}
      {sort.key === k ? <span className="bq-ar">{sort.asc ? ' ▴' : ' ▾'}</span> : null}
    </th>
  );
  const selectRow = (ids: number[]) => (ev: ReactMouseEvent) => {
    if ((ev.target as HTMLElement).tagName === 'INPUT') return;
    p.onSelect(ids, ev.ctrlKey || ev.metaKey ? 'add' : ev.shiftKey ? 'remove' : 'replace');
  };

  const first = Math.max(0, Math.floor(scrollTop / ROW) - 10);
  const last = Math.min(visible.length, first + Math.ceil(viewH / ROW) + 20);

  const body = (
    <>
      <div className="bq-tabs" role="tablist">
        {(['elements', 'levels', 'summary', 'rates'] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : undefined} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="bq-tools">
        {tab === 'elements' ? (
          <>
            <input className="bq-in" placeholder="Filter by mark, level, type, grade…" aria-label="Filter elements" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <select className="bq-sel" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Category: All</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="bq-sel" aria-label="Level" value={lvl} onChange={(e) => setLvl(e.target.value)}>
              <option value="">Level: All</option>
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </>
        ) : null}
        <span className="app-spacer" />
        <span className="bq-chip">
          {rates.edited.length} item rate{rates.edited.length === 1 ? '' : 's'} edited · {overrides} override{overrides === 1 ? '' : 's'}
          {missing ? ` · ${missing} without a rate` : ''}
        </span>
        <Button size="sm" onClick={p.onEditGradeRules}>Grade rules…</Button>
        <Button size="sm" variant="primary" onClick={exportXlsx} disabled={busy}>{busy ? 'Exporting…' : 'Export Excel'}</Button>
      </div>
      <div className="bq-scroll" ref={scroller} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        {tab === 'elements' ? (
          <table className="bq-table">
            <thead>
              <tr className="grp">
                <th className="stk" />
                <th colSpan={5}>Element</th>
                <th colSpan={4}>Dimensions (m)</th>
                <th colSpan={2}>Quantity</th>
                <th colSpan={2}>Cost</th>
              </tr>
              <tr className="cols">
                <Th k="mark" label="Mark" />
                <Th k="id" label="Element ID" />
                <Th k="level" label="Level" />
                <Th k="category" label="Category" />
                <Th k="type" label="Type" />
                <Th k="grade" label="Grade / material" />
                <Th k="length" label="Length" num />
                <Th k="width" label="Width" num />
                <Th k="depth" label="Depth" num />
                <Th k="height" label="Height" num />
                <Th k="area" label="Area (m²)" num />
                <Th k="volume" label="Volume (m³)" num />
                <Th k="rate" label="Rate (₹/m³)" num />
                <Th k="amount" label="Amount (₹)" num />
              </tr>
            </thead>
            <tbody>
              {first > 0 ? <tr style={{ height: first * ROW }} aria-hidden="true" /> : null}
              {visible.slice(first, last).map((e) => {
                const r = rateFor(e, rates);
                const edited = r.source === 'item' && rates.edited.includes(itemKey(e));
                return (
                  <tr key={e.index} className={selected.has(e.index) ? 'sel' : undefined} onClick={selectRow([e.index])}>
                    <td className="stk">{e.mark || <span className="bq-faint">—</span>}</td>
                    <td className="mono">{e.expressId}</td>
                    <td>{e.level || '—'}</td>
                    <td>{e.category}</td>
                    <td className="bq-type" title={e.typeName}>{e.typeName || '—'}</td>
                    <td>{e.grade || '—'}</td>
                    {(['length', 'width', 'depth', 'height'] as const).map((k) => (
                      <td key={k} className={e.dims[k] === null ? 'na' : 'n dim'}>{d2(e.dims[k])}</td>
                    ))}
                    <td className={e.area === null ? 'na' : 'n'}>{d2(e.area)}</td>
                    <td className="n">{d3(e.volume)}</td>
                    <td
                      className={['rate', r.source === 'override' ? 'ovr' : edited ? 'edited' : ''].join(' ')}
                      title={r.source === 'override' ? `Override · item rate ${rates.items[itemKey(e)] !== undefined ? '₹' + inr(rates.items[itemKey(e)], 0) : 'not set'}` : `Item rate: ${e.category} · ${e.grade}`}
                      onContextMenu={toggleOverride(e)}
                    >
                      <input
                        key={`${e.globalId}-${r.rate}`}
                        aria-label={`Rate for ${e.mark || e.expressId}`}
                        defaultValue={r.rate === null ? '' : inr(r.rate, 0)}
                        placeholder="—"
                        onKeyDown={rateKeys(e)}
                        onBlur={(ev) => {
                          if (ev.currentTarget.value !== ev.currentTarget.defaultValue && !commitRate(e, ev.currentTarget.value, false)) ev.currentTarget.value = ev.currentTarget.defaultValue;
                        }}
                      />
                    </td>
                    <td className="n amt">{r.amount === null ? '—' : inr(r.amount)}</td>
                  </tr>
                );
              })}
              {last < visible.length ? <tr style={{ height: (visible.length - last) * ROW }} aria-hidden="true" /> : null}
            </tbody>
            <tfoot>
              <tr>
                <th className="stk" scope="row">Total</th>
                <td colSpan={9} className="bq-faint">{visible.length.toLocaleString('en-IN')} elements{visible.length !== els.length ? ' (filtered)' : ''}</td>
                <td className="n">{inr(totals.area)}</td>
                <td className="n">{d3(totals.volume)}</td>
                <td />
                <td className="n">₹ {inr(totals.amount)}</td>
              </tr>
            </tfoot>
          </table>
        ) : tab === 'levels' ? (
          <table className="bq-table">
            <thead>
              <tr className="cols">
                <th>Level</th><th className="n">Elevation (m)</th><th>Category</th><th className="n">Count</th><th className="n">Volume (m³)</th><th className="n">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {levelRows.map((r) => (
                <tr key={`${r.level}-${r.category}`} onClick={selectRow(r.ids)}>
                  <td>{r.level}</td><td className="n dim">{r.elev === null ? '—' : inr(r.elev, 3)}</td><td>{r.category}</td>
                  <td className="n">{r.count.toLocaleString('en-IN')}</td><td className="n">{d3(r.volume)}</td><td className="n amt">{r.amount ? inr(r.amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th><td /><td /><td className="n">{els.length.toLocaleString('en-IN')}</td>
                <td className="n">{d3(levelRows.reduce((s, r) => s + r.volume, 0))}</td><td className="n">₹ {inr(levelRows.reduce((s, r) => s + r.amount, 0))}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="bq-table">
            <thead>
              <tr className="cols">
                <th>Category</th><th>Grade / material</th><th className="n">Count</th><th className="n">Volume (m³)</th><th>Unit</th><th className="n">Rate (₹)</th><th className="n">Overrides</th><th className="n">Amount (₹)</th>
                {tab === 'rates' ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const ids = els.filter((e) => itemKey(e) === it.key).map((e) => e.index);
                return (
                  <tr key={it.key} onClick={selectRow(ids)}>
                    <td>{it.category}</td><td>{it.grade}</td><td className="n">{it.count.toLocaleString('en-IN')}</td><td className="n">{d3(it.volume)}</td><td>m³</td>
                    <td className={['rate', rates.edited.includes(it.key) ? 'edited' : ''].join(' ')}>
                      <input
                        key={`${it.key}-${it.rate}`}
                        aria-label={`Rate for ${it.category} ${it.grade}`}
                        defaultValue={it.rate === null ? '' : inr(it.rate, 0)}
                        placeholder="—"
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') {
                            const v = parseRate(ev.currentTarget.value);
                            if (v !== null) {
                              onRates(setItemRate(rates, it.key, v));
                              ev.currentTarget.defaultValue = ev.currentTarget.value;
                            } else ev.currentTarget.value = ev.currentTarget.defaultValue;
                            ev.currentTarget.blur();
                          } else if (ev.key === 'Escape') {
                            ev.stopPropagation();
                            ev.currentTarget.value = ev.currentTarget.defaultValue;
                            ev.currentTarget.blur();
                          }
                        }}
                        onBlur={(ev) => {
                          const v = parseRate(ev.currentTarget.value);
                          if (ev.currentTarget.value !== ev.currentTarget.defaultValue && v !== null) onRates(setItemRate(rates, it.key, v));
                        }}
                      />
                    </td>
                    <td className="n">{it.overrides || '—'}</td><td className="n amt">{it.amount ? inr(it.amount) : '—'}</td>
                    {tab === 'rates' ? (
                      <td>
                        <button
                          type="button"
                          className="app-link"
                          disabled={!it.overrides}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            let b = rates;
                            for (const e of els) if (itemKey(e) === it.key) b = clearOverride(b, e.globalId);
                            onRates(b);
                          }}
                        >
                          Clear overrides
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th><td /><td className="n">{els.length.toLocaleString('en-IN')}</td><td className="n">{d3(items.reduce((s, i) => s + i.volume, 0))}</td><td /><td />
                <td className="n">{overrides || '—'}</td><td className="n">₹ {inr(items.reduce((s, i) => s + i.amount, 0))}</td>{tab === 'rates' ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <div className="bq-foot">
        <span>Enter sets the item rate · Alt + Enter overrides this element · Right-click a rate to switch · Click a row to select</span>
        <span className="app-spacer" />
        <span>{model.elements.some((e) => e.quantitySource === 'geometry') ? 'Some volumes from geometry' : 'Volumes: IFC base quantities'}</span>
      </div>
    </>
  );

  if (p.mode === 'docked') return <div className="bq-docked" onKeyDown={onKeyWin}>{body}</div>;

  return (
    <section
      className={['bq-win', minimised && 'is-min'].filter(Boolean).join(' ')}
      style={{ left: geom.x, top: geom.y, width: geom.w, height: minimised ? undefined : geom.h, ['--doc' as string]: p.color ?? 'var(--accent)' }}
      role="dialog"
      aria-label="Bill of quantities"
      onKeyDown={onKeyWin}
    >
      <div className="bq-title" onPointerDown={drag('move')}>
        <h3>Bill of quantities</h3>
        <span className="bq-file">{model.info.fileName} · {els.length.toLocaleString('en-IN')} elements</span>
        <span className="app-spacer" />
        <button type="button" className="bq-ib" title="Dock to the bottom panel" aria-label="Dock" onClick={p.onDock}>⤓</button>
        <button type="button" className="bq-ib" title={minimised ? 'Restore' : 'Minimise'} aria-label={minimised ? 'Restore' : 'Minimise'} onClick={() => setMinimised((m) => !m)}>{minimised ? '▢' : '–'}</button>
        <button type="button" className="bq-ib" title="Close (Esc)" aria-label="Close" onClick={p.onClose}>×</button>
      </div>
      {minimised ? null : body}
      {minimised ? null : <div className="bq-grip" onPointerDown={drag('resize')} aria-hidden="true" />}
    </section>
  );
}

