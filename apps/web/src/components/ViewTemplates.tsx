import { useEffect, useRef, useState } from 'react';
import { Button } from '@shanku/ui';
import { exportTemplates, importTemplates, templateFromView, type TemplateIncludes, type ViewState, type ViewTemplate } from '../lib/viewTemplates';
import { isEmptyOverride } from '../lib/visibility';

const STYLE_LABEL: Record<string, string> = { shaded: 'Shaded', consistent: 'Consistent Colors', hiddenLine: 'Hidden Line', wireframe: 'Wireframe' };

/** Revit's View Templates dialog: list, create from the current view, include switches, apply, share. */
export function ViewTemplatesDialog({
  templates,
  current,
  onChange,
  onApplyToView,
  onClose,
  onLog,
  focus,
}: {
  templates: ViewTemplate[];
  current: ViewState;
  onChange: (next: ViewTemplate[]) => void;
  onApplyToView: (t: ViewTemplate) => void;
  onClose: () => void;
  onLog: (text: string, tone?: 'info' | 'error') => void;
  /** Open on this template, with its name ready to edit (after Create Template from Current View). */
  focus?: { id: string; rename: boolean } | null;
}) {
  const [sel, setSel] = useState<string | null>(focus?.id ?? templates[0]?.id ?? null);
  const [renaming, setRenaming] = useState(!!focus?.rename);
  useEffect(() => {
    if (!focus) return;
    setSel(focus.id);
    setRenaming(focus.rename);
  }, [focus]);
  const file = useRef<HTMLInputElement>(null);
  const t = templates.find((x) => x.id === sel) ?? null;
  const update = (patch: Partial<ViewTemplate>) => t && onChange(templates.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
  const inc = (k: keyof TemplateIncludes, v: boolean) => t && update({ include: { ...t.include, [k]: v } });

  const create = () => {
    const name = `Structural 3D ${templates.length + 1}`;
    const n = templateFromView(name, current);
    onChange([...templates, n]);
    setSel(n.id);
    setRenaming(true);
  };
  const exportAll = () => {
    const blob = new Blob([exportTemplates(templates)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shanku-view-templates.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const added = importTemplates(await f.text(), templates);
      onChange([...templates, ...added]);
      setSel(added[0]?.id ?? sel);
      onLog(`Imported ${added.length} view template${added.length === 1 ? '' : 's'} from ${f.name}.`);
    } catch (e) {
      onLog(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const rows: Array<[keyof TemplateIncludes, string, string]> = t
    ? [
        ['categories', 'V/G Overrides Model', `${Object.values(t.categories).filter((o) => !isEmptyOverride(o)).length} categories overridden`],
        ['filters', 'V/G Overrides Filters', t.applied.length ? t.applied.map((a) => t.filters.find((f) => f.id === a.filterId)?.name ?? '?').join(', ') : 'None'],
        ['visualStyle', 'Visual Style', STYLE_LABEL[t.displayStyle] ?? t.displayStyle],
        ['edges', 'Edges', t.edges ? 'On' : 'Off'],
      ]
    : [];

  return (
    <div className="vg flt">
      <div className="flt-body">
        <aside className="flt-list">
          <ul role="listbox" aria-label="View templates">
            {templates.map((x) => (
              <li key={x.id} role="option" aria-selected={x.id === sel} className={x.id === sel ? 'is-on' : undefined} onClick={() => { setSel(x.id); setRenaming(false); }}>
                {x.name}
              </li>
            ))}
            {!templates.length ? <li className="vg-faint">No templates yet. Create one from the current view.</li> : null}
          </ul>
          <div className="flt-list__btns">
            <Button size="sm" onClick={create}>New from view</Button>
            <Button size="sm" disabled={!t} onClick={() => { if (!t) return; const d = { ...structuredClone(t), id: `${t.id}c${Date.now().toString(36)}`, name: `${t.name} copy` }; onChange([...templates, d]); setSel(d.id); }}>Duplicate</Button>
            <Button size="sm" disabled={!t} onClick={() => setRenaming(true)}>Rename</Button>
            <Button size="sm" disabled={!t} onClick={() => { if (!t) return; onChange(templates.filter((x) => x.id !== t.id)); setSel(templates.find((x) => x.id !== t.id)?.id ?? null); }}>Delete</Button>
          </div>
        </aside>
        {t ? (
          <section className="flt-edit">
            {renaming ? (
              <label className="vg-field">
                <span>Name</span>
                <input className="flt-input" aria-label="Template name" autoFocus value={t.name} onChange={(e) => update({ name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && setRenaming(false)} onBlur={() => setRenaming(false)} />
              </label>
            ) : (
              <h3 className="vt-name">{t.name}</h3>
            )}
            <table className="vg-table">
              <thead>
                <tr>
                  <th>View Property</th>
                  <th>Value</th>
                  <th className="c">Include</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([k, label, value]) => (
                  <tr key={k} className={t.include[k] ? undefined : 'is-off'}>
                    <td>{label}</td>
                    <td className="vt-value">{value}</td>
                    <td className="c"><input type="checkbox" aria-label={`Include ${label}`} checked={t.include[k]} onChange={(e) => inc(k, e.target.checked)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <Button size="sm" onClick={() => update({ ...templateFromView(t.name, current), id: t.id, include: t.include })}>Update from current view</Button>
            </div>
            <p className="vg-faint">Templates are kept in this browser. Export them to share with your team; element overrides stay with the view, as in Revit.</p>
          </section>
        ) : (
          <section className="flt-edit vg-faint">Set up the view (Visibility/Graphics, filters, visual style), then create a template from it.</section>
        )}
      </div>
      <div className="vg-actions">
        <Button size="sm" onClick={() => file.current?.click()}>Import…</Button>
        <Button size="sm" disabled={!templates.length} onClick={exportAll}>Export…</Button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
        <span className="app-spacer" />
        <Button size="sm" variant="primary" disabled={!t} onClick={() => t && onApplyToView(t)}>Apply to current view</Button>
        <Button size="sm" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
