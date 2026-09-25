import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Button } from '@shanku/ui';
import { CATEGORY_ORDER, siFactor, type ElementRecord, type ParsedModel } from '@shanku/engine';
import { buildBoqWorkbook, downloadFile } from '../lib/excel';
import { clearOverride, effectiveRebar, inr, itemKey, itemRate, lastProfile, parseRate, rateFor, rateItems, rememberProfile, setItemRate, setOverride, type RateBook } from '../lib/rates';
import { CITY_PROFILES, ESTIMATED_GRADES, GRADES, profileFor, profileRate, type RateProfileValues } from '../lib/rateProfiles';
import { describeScope, scopeElements, type BoqScope } from '../lib/boqScope';
import { bandWarning, emptyRebar, rebarEstimate } from '../lib/rebar';

type Tab = 'elements' | 'levels' | 'summary' | 'rates';
type SortKey = 'mark' | 'id' | 'level' | 'category' | 'type' | 'grade' | 'length' | 'width' | 'depth' | 'height' | 'area' | 'volume' | 'rate' | 'amount';

const ROW = 26;
const d2 = (v: number | null) => (v === null ? '—' : inr(v, 2));
const d3 = (v: number) => inr(v, 3);

export interface BoqWindowProps {
  model: ParsedModel;
  rates: RateBook;
  onRates: (book: RateBook) => void;
  selection: number[];
  /** Elements hidden in the active view, for the "Visible elements only" scope. */
  hidden: readonly number[];
  onSelect: (indices: number[], mode: 'replace' | 'add' | 'remove') => void;
  markRules: string[];
  gradeRules: string[];
  appVersion: string;
  onEditGradeRules: () => void;
  onLog: (text: string, tone?: 'info' | 'error') => void;
}

/** Content of the BOQ window: Elements, Levels, Summary, Rates; item rates with per-element overrides. */
export function BoqWindow(p: BoqWindowProps) {
  const { model, rates, onRates } = p;
  const [tab, setTab] = useState<Tab>('elements');
  const [filter, setFilter] = useState('');
  const [cat, setCat] = useState('');
  const [lvl, setLvl] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'volume', asc: false });
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<BoqScope>({ kind: 'model' });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(400);
  const scroller = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(p.selection), [p.selection]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab]);

  // ---------- data ----------
  const levels = model.info.levels.map((l) => l.name);
  // Everything below counts only the elements in scope, and says so (scopeSentence).
  const els = useMemo(
    () => scopeElements(model.elements, scope, { hidden: new Set(p.hidden), selection: new Set(p.selection), levels: model.info.levels.map((l) => l.name) }),
    [model, scope, p.hidden, p.selection],
  );
  const scopeSentence = describeScope(scope, els.length, model.elements.length);
  // Typed steel values (rates.rebar) sit on top of the profile's; the estimate uses both.
  const rebarSettings = rates.rebar ?? emptyRebar();
  const steel = useMemo(() => effectiveRebar(rates), [rates]);
  const rebar = useMemo(() => rebarEstimate(els, steel), [els, steel]);
  const setRebar = (patch: Partial<typeof rebarSettings>) => onRates({ ...rates, rebar: { ...rebarSettings, ...patch } });
  // ---- rate profile (city): change a value once, every item that uses it follows
  const profile = rates.profile ?? lastProfile();
  const cityName = CITY_PROFILES.find((c) => c.id === profile.id)?.name ?? 'Custom';
  const setProfile = (next: typeof profile) => {
    rememberProfile(next);
    onRates({ ...rates, profile: next });
  };
  const setProfileValue = (patch: Partial<RateProfileValues>) => setProfile({ ...profile, values: { ...profile.values, ...patch } });
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
      const buf = await buildBoqWorkbook({ info: model.info, elements: els, rates, markRules: p.markRules, gradeRules: p.gradeRules, appVersion: p.appVersion, scope: scopeSentence });
      const base = model.info.fileName.replace(/\.ifc$/i, '');
      downloadFile(buf, `${base} - BOQ.xlsx`);
      p.onLog(`Exported ${base} - BOQ.xlsx (Summary, Levels, Elements, Rates${rebar.rows.some((r) => r.ratio !== null) ? ', Reinforcement' : ''}, About). ${scopeSentence}.`);
    } catch (e) {
      p.onLog(`BOQ export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
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
      <div className="bq-scope" role="group" aria-label="What the BOQ counts">
        <label>
          <span>Count</span>
          <select
            className="bq-sel"
            value={scope.kind}
            onChange={(e) => {
              const k = e.target.value as BoqScope['kind'];
              setScope(k === 'levels' ? { kind: 'levels', from: levels[0] ?? '', to: levels[levels.length - 1] ?? '' } : { kind: k });
            }}
          >
            <option value="model">Whole model</option>
            <option value="visible">Visible in this view</option>
            <option value="selection" disabled={!p.selection.length}>Selection ({p.selection.length.toLocaleString('en-IN')})</option>
            <option value="levels" disabled={!levels.length}>Levels…</option>
          </select>
        </label>
        {scope.kind === 'levels' ? (
          <>
            <select className="bq-sel" aria-label="From level" value={scope.from} onChange={(e) => setScope({ ...scope, from: e.target.value })}>
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <span className="bq-faint">to</span>
            <select className="bq-sel" aria-label="To level" value={scope.to} onChange={(e) => setScope({ ...scope, to: e.target.value })}>
              {levels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </>
        ) : null}
        <span className="bq-scope__text" role="status">{scopeSentence}</span>
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
        {rebar.kg > 0 ? <span className="bq-chip" title="Reinforcement estimate from steel ratios (Rates tab)">Steel ≈ {inr(rebar.kg / 1000, 2)} t</span> : null}
        <span className="bq-chip">
          {rates.edited.length} item rate{rates.edited.length === 1 ? '' : 's'} edited · {overrides} override{overrides === 1 ? '' : 's'}
          {missing ? ` · ${missing} without a rate` : ''}
        </span>
        <label className="bq-profile" title="Default rates for items without a typed rate. Change values in Rates → Rate profile.">
          <span>Rates</span>
          <select className="bq-sel" aria-label="Rate profile" value={profile.id} onChange={(e) => setProfile(profileFor(e.target.value))}>
            {CITY_PROFILES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
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
                      className={['rate', r.source === 'override' ? 'ovr' : edited ? 'edited' : r.source === 'profile' ? 'prof' : ''].join(' ')}
                      title={r.source === 'override' ? `Override · item rate ${itemRate(rates, e).rate !== null ? '₹' + inr(itemRate(rates, e).rate!, 0) : 'not set'}` : r.source === 'profile' ? `From the rate profile (${cityName}). Type a rate to set it for this item.` : `Item rate: ${e.category} · ${e.grade}`}
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
        {tab === 'rates' ? (
          <section className="bq-rebar bq-profile-edit" aria-labelledby="bq-profile-title">
            <h3 id="bq-profile-title">Rate profile: {cityName}</h3>
            <p className="bq-faint">
              Every item without a typed rate uses these values: concrete by grade plus formwork, times the city factor and escalation. Change a value once and every item follows. Base: CPWD DSR 2023 (Delhi, April 2023 prices). {CITY_PROFILES.find((c) => c.id === profile.id)?.note}. Grades marked * and the formwork areas are Shanku estimates. Replace them with your own tender rates.
            </p>
            <div className="bq-profile-grid">
              <fieldset>
                <legend>Concrete, ₹/m³ (Delhi base)</legend>
                {GRADES.map((g) => (
                  <NumberField key={g} label={`${g}${ESTIMATED_GRADES.includes(g) ? ' *' : ''}`} value={profile.values.concrete[g]} onChange={(v) => setProfileValue({ concrete: { ...profile.values.concrete, [g]: v } })} />
                ))}
              </fieldset>
              <fieldset>
                <legend>Formwork, ₹/m² and m² per m³</legend>
                {(['Column', 'Beam', 'Slab', 'Wall', 'Footing', 'Stair'] as const).map((c) => (
                  <div key={c} className="bq-pair">
                    <NumberField label={c} value={profile.values.formwork[c] ?? 0} onChange={(v) => setProfileValue({ formwork: { ...profile.values.formwork, [c]: v } })} />
                    <NumberField label="m²/m³" value={profile.values.formworkArea[c] ?? 0} onChange={(v) => setProfileValue({ formworkArea: { ...profile.values.formworkArea, [c]: v } })} />
                  </div>
                ))}
              </fieldset>
              <fieldset>
                <legend>City, escalation, steel</legend>
                <NumberField label="City factor" value={profile.values.cityFactor} step={0.01} onChange={(v) => setProfileValue({ cityFactor: v })} />
                <NumberField label="Escalation %" value={Math.round(profile.values.escalation * 1000) / 10} step={0.5} onChange={(v) => setProfileValue({ escalation: v / 100 })} />
                <NumberField label="Steel ₹/kg" value={profile.values.steel} onChange={(v) => setProfileValue({ steel: v })} />
                <label className="bq-field">
                  <span>Grade if not named</span>
                  <select className="bq-sel" value={profile.values.defaultGrade} onChange={(e) => setProfileValue({ defaultGrade: e.target.value as typeof profile.values.defaultGrade })}>
                    {GRADES.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="app-link" onClick={() => setProfile(profileFor(profile.id))}>
                  Reset this profile
                </button>
              </fieldset>
            </div>
            <table className="bq-table">
              <thead>
                <tr className="cols">
                  <th>Item</th><th>Priced as</th><th className="n">Concrete (₹/m³)</th><th className="n">Formwork (₹/m³)</th><th className="n">Profile rate (₹/m³)</th><th>Used</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const pr = profileRate(profile.values, it.category as never, it.grade);
                  const typed = rates.items[it.key] !== undefined;
                  return (
                    <tr key={it.key}>
                      <td>{it.category} · {it.grade}</td>
                      <td>{pr ? `${pr.grade}${pr.gradeAssumed ? ' (assumed)' : ''}${pr.estimatedGrade ? ' *' : ''}` : '—'}</td>
                      <td className="n">{pr ? inr(pr.concrete, 0) : '—'}</td>
                      <td className="n">{pr ? inr(pr.formwork, 0) : '—'}</td>
                      <td className="n amt">{pr ? inr(pr.rate, 0) : '—'}</td>
                      <td>{typed ? <span className="bq-faint">typed rate {inr(rates.items[it.key], 0)}</span> : pr ? 'profile' : <span className="bq-faint">no rate</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}
        {tab === 'rates' ? (
          <section className="bq-rebar" aria-labelledby="bq-rebar-title">
            <h3 id="bq-rebar-title">Reinforcement (estimate)</h3>
            <p className="bq-faint">Steel from ratios: kg of steel per m³ of concrete, before bar bending schedules exist. A ratio outside the usual range is flagged.</p>
            <table className="bq-table">
              <thead>
                <tr className="cols">
                  <th>Category</th><th className="n">Concrete (m³)</th><th className="n">Ratio (kg/m³)</th><th>Usual range</th><th className="n">Steel (kg)</th><th className="n">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {rebar.rows.map((r) => {
                  const warn = r.ratio === null ? null : bandWarning(r.category, r.ratio);
                  return (
                    <tr key={r.category} className={warn ? 'warn' : undefined}>
                      <td>{r.category}</td>
                      <td className="n">{d3(r.volume)}</td>
                      <td className={['rate', warn ? 'bad' : ''].join(' ')} title={warn ?? undefined}>
                        <input
                          key={`${r.category}-${r.ratio}-${rebarSettings.ratios[r.category] ?? 'p'}`}
                          aria-label={`Steel ratio for ${r.category}, kg per m³`}
                          className={rebarSettings.ratios[r.category] === undefined ? 'prof' : undefined}
                          title={rebarSettings.ratios[r.category] === undefined ? 'From the rate profile; type to change, clear to go back' : undefined}
                          aria-invalid={warn ? true : undefined}
                          aria-describedby={warn ? `bq-warn-${r.category}` : undefined}
                          defaultValue={r.ratio === null ? '' : String(r.ratio)}
                          placeholder="—"
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') ev.currentTarget.blur();
                            else if (ev.key === 'Escape') {
                              ev.stopPropagation();
                              ev.currentTarget.value = ev.currentTarget.defaultValue;
                              ev.currentTarget.blur();
                            }
                          }}
                          onBlur={(ev) => {
                            const raw = ev.currentTarget.value.trim();
                            if (raw === ev.currentTarget.defaultValue) return;
                            const ratios = { ...rebarSettings.ratios };
                            if (raw === '') delete ratios[r.category];
                            else {
                              const v = parseRate(raw);
                              if (v === null) return void (ev.currentTarget.value = ev.currentTarget.defaultValue);
                              ratios[r.category] = v;
                            }
                            setRebar({ ratios });
                          }}
                        />
                      </td>
                      <td>
                        {r.band ? `${r.band[0]}–${r.band[1]}` : <span className="bq-faint">—</span>}
                        {warn ? <span id={`bq-warn-${r.category}`} className="bq-warn" role="alert"> ⚠ {warn}</span> : null}
                      </td>
                      <td className="n">{r.kg === null ? '—' : inr(r.kg, 0)}</td>
                      <td className="n amt">{r.amount === null ? '—' : inr(r.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="n">{d3(rebar.rows.reduce((a, r) => a + r.volume, 0))}</td>
                  <td colSpan={2} className="bq-rebar__rate">
                    <label>
                      Steel rate (₹/kg){' '}
                      <input
                        key={`rate-${steel.rate}-${rebarSettings.rate}`}
                        className="bq-in bq-in--num"
                        aria-label="Steel rate, rupees per kg"
                        defaultValue={steel.rate === null ? '' : String(steel.rate)}
                        placeholder="—"
                        onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()}
                        onBlur={(ev) => {
                          const raw = ev.currentTarget.value.trim();
                          if (raw === ev.currentTarget.defaultValue) return;
                          const v = raw === '' ? null : parseRate(raw);
                          if (raw !== '' && v === null) return void (ev.currentTarget.value = ev.currentTarget.defaultValue);
                          setRebar({ rate: v });
                        }}
                      />
                    </label>
                  </td>
                  <td className="n">{inr(rebar.kg, 0)} kg{rebar.kg >= 1000 ? ` (${inr(rebar.kg / 1000, 2)} t)` : ''}</td>
                  <td className="n">₹ {inr(rebar.amount)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        ) : null}
      </div>
      <div className="bq-foot">
        <span>Enter sets the item rate · Alt + Enter overrides this element · Right-click a rate to switch · Click a row to select</span>
        <span className="app-spacer" />
        <span>{model.elements.some((e) => e.quantitySource === 'geometry') ? 'Some volumes from geometry' : 'Volumes: IFC base quantities'}</span>
      </div>
    </>
  );

  return <div className="bq-docked">{body}</div>;
}

/** A labelled number that commits on Enter or blur; Esc puts the old value back. */
function NumberField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="bq-field">
      <span>{label}</span>
      <input
        key={value}
        className="bq-in bq-in--num"
        type="number"
        step={step}
        min={0}
        defaultValue={value}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') ev.currentTarget.blur();
          else if (ev.key === 'Escape') {
            ev.stopPropagation();
            ev.currentTarget.value = String(value);
            ev.currentTarget.blur();
          }
        }}
        onBlur={(ev) => {
          const v = Number(ev.currentTarget.value);
          if (ev.currentTarget.value.trim() === '' || !Number.isFinite(v) || v < 0) ev.currentTarget.value = String(value);
          else if (v !== value) onChange(v);
        }}
      />
    </label>
  );
}
