import { useMemo, useState } from 'react';
import { Button } from '@shanku/ui';
import { CATEGORY_PLURAL, buildBoq, type BoqKey, type ParsedModel } from '@shanku/engine';
import { buildBoqWorkbook, downloadFile } from '../lib/excel';

const KEYS: Array<{ id: BoqKey; label: string }> = [
  { id: 'level', label: 'Level' },
  { id: 'category', label: 'Category' },
  { id: 'grade', label: 'Grade / material' },
];
const n3 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const n2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = new Intl.NumberFormat('en-IN');

export interface BoqPanelProps {
  model: ParsedModel | null;
  markRules: string[];
  gradeRules: string[];
  appVersion: string;
  onSelect: (indices: number[]) => void;
  onEditGradeRules: () => void;
  onLog: (text: string, tone?: 'info' | 'error') => void;
}

/** Concrete BOQ grouped by any mix of level, category and grade; click a row to select its elements. */
export function BoqPanel({ model, markRules, gradeRules, appVersion, onSelect, onEditGradeRules, onLog }: BoqPanelProps) {
  const [groupBy, setGroupBy] = useState<BoqKey[]>(['level', 'category', 'grade']);
  const [busy, setBusy] = useState(false);
  const boq = useMemo(() => (model ? buildBoq(model.elements, model.info.levels, groupBy) : null), [model, groupBy]);

  if (!model || !boq) return <p className="app-empty-note">Open an IFC model to see its bill of quantities.</p>;

  const toggle = (k: BoqKey) =>
    setGroupBy((g) => (g.includes(k) ? g.filter((x) => x !== k) : KEYS.map((x) => x.id).filter((x) => x === k || g.includes(x))));

  const exportXlsx = async () => {
    setBusy(true);
    try {
      const buf = await buildBoqWorkbook({ info: model.info, boq, elements: model.elements, markRules, gradeRules, appVersion });
      const base = model.info.fileName.replace(/\.ifc$/i, '');
      downloadFile(buf, `${base} - BOQ.xlsx`);
      onLog(`Exported ${base} - BOQ.xlsx: ${boq.rows.length} rows, ${n3.format(boq.total.volume)} m³.`);
    } catch (e) {
      onLog(`BOQ export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-boq">
      <div className="app-boq__tools">
        <span className="app-boq__label">Group by</span>
        {KEYS.map((k) => (
          <label key={k.id} className="app-boq__toggle">
            <input type="checkbox" checked={groupBy.includes(k.id)} onChange={() => toggle(k.id)} />
            {k.label}
          </label>
        ))}
        <button type="button" className="app-link" onClick={onEditGradeRules}>
          Grade rules…
        </button>
        <span className="app-spacer" />
        <span className="app-boq__note">
          {boq.total.fromGeometry ? `${n0.format(boq.total.fromGeometry)} elements measured from geometry (no IFC quantities)` : 'All volumes from IFC base quantities'}
        </span>
        <Button size="sm" variant="primary" onClick={exportXlsx} disabled={busy}>
          {busy ? 'Exporting…' : 'Export Excel'}
        </Button>
      </div>
      <table className="app-boq__table">
        <thead>
          <tr>
            {groupBy.map((k) => (
              <th key={k} scope="col">
                {KEYS.find((x) => x.id === k)!.label}
              </th>
            ))}
            <th scope="col" className="num">Count</th>
            <th scope="col" className="num">Volume (m³)</th>
            <th scope="col" className="num">Length (m)</th>
            <th scope="col" className="num">Area (m²)</th>
          </tr>
        </thead>
        <tbody>
          {boq.rows.map((r, i) => (
            <tr key={i} tabIndex={0} onClick={() => onSelect(r.elements)} onKeyDown={(e) => e.key === 'Enter' && onSelect(r.elements)} title="Select these elements">
              {groupBy.map((k) => (
                <td key={k}>{k === 'category' && r.category ? CATEGORY_PLURAL[r.category] : r[k]}</td>
              ))}
              <td className="num">{n0.format(r.count)}</td>
              <td className="num">{n3.format(r.volume)}</td>
              <td className="num">{r.length ? n2.format(r.length) : '—'}</td>
              <td className="num">{r.area ? n2.format(r.area) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={Math.max(1, groupBy.length)}>Total</th>
            <td className="num">{n0.format(boq.total.count)}</td>
            <td className="num">{n3.format(boq.total.volume)}</td>
            <td className="num">{boq.total.length ? n2.format(boq.total.length) : '—'}</td>
            <td className="num">{boq.total.area ? n2.format(boq.total.area) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
