import { DockPanel, PropertyRow, PropertySection, TypeSelector, type IconName } from '@shanku/ui';
import type { Category, ElementRecord, ParsedModel, PropertyGroup } from '@shanku/engine';
import { fmtBytes, fmtCount, fmtMs, fmtValue } from '../lib/format';

const ICON: Record<Category, IconName> = {
  Column: 'column',
  Beam: 'beam',
  Slab: 'slab',
  Wall: 'wall',
  Footing: 'footing',
  Pile: 'footing',
  Rebar: 'rebar',
  Stair: 'elevation',
  Member: 'beam',
  Plate: 'slab',
  Other: 'view3d',
};

const common = <T,>(items: T[]): T | null => (items.every((v) => v === items[0]) ? items[0] : null);

export interface PropertiesPanelProps {
  model: ParsedModel | null;
  selection: number[];
  properties: { index: number; groups: PropertyGroup[] | null; error?: string } | null;
  onEditMarkRules: () => void;
}

const LEVEL_LABEL = { recommended: 'Recommended', supported: 'Supported', limited: 'Limited', experimental: 'Experimental' } as const;

export function PropertiesPanel({ model, selection, properties, onEditMarkRules }: PropertiesPanelProps) {
  if (!model) {
    return (
      <DockPanel title="Properties">
        <p className="app-empty-note">Open a model to see properties.</p>
      </DockPanel>
    );
  }

  if (selection.length === 0) {
    const i = model.info;
    return (
      <DockPanel title="Properties">
        <TypeSelector icon="view3d" category="Model" typeName={i.projectName || i.fileName} />
        <PropertySection title="File">
          <PropertyRow label="Name" value={i.fileName} />
          <PropertyRow label="Size" value={fmtBytes(i.fileSize)} />
          <PropertyRow label="Schema" value={i.schema} />
          <PropertyRow label="Length unit" value={i.units.length} />
        </PropertySection>
        <PropertySection title="Compatibility">
          <div className="app-compat">
            <span className={`app-compat__badge is-${i.compatibility.level}`}>{LEVEL_LABEL[i.compatibility.level]}</span>
            <span className="app-compat__format">{i.compatibility.format}</span>
          </div>
          <ul className="app-compat__notes">
            {i.compatibility.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </PropertySection>
        <PropertySection title="Model">
          <PropertyRow label="Elements" value={fmtCount(i.elementCount)} />
          <PropertyRow label="With a mark" value={fmtCount(model.elements.filter((e) => e.mark).length)} />
          <PropertyRow label="Levels" value={fmtCount(i.levels.length)} />
          <PropertyRow label="Triangles" value={fmtCount(i.triangleCount)} readOnly />
          <PropertyRow label="Opened in" value={fmtMs(i.timings.total)} readOnly />
        </PropertySection>
      </DockPanel>
    );
  }

  if (selection.length > 1) {
    const els = selection.map((s) => model.elements[s]);
    const cat = common(els.map((e) => e.category));
    const type = common(els.map((e) => e.typeName));
    const level = common(els.map((e) => e.level));
    return (
      <DockPanel title="Properties">
        <TypeSelector icon={cat ? ICON[cat] : 'view3d'} category={`${fmtCount(els.length)} elements`} typeName={cat ? `${cat}` : 'Mixed categories'} />
        <PropertySection title="Common">
          <PropertyRow label="Category" value={cat} varies={cat === null} />
          <PropertyRow label="Mark" value={common(els.map((e) => e.mark)) || null} varies={common(els.map((e) => e.mark)) === null} />
          <PropertyRow label="Type" value={type || null} varies={type === null} />
          <PropertyRow label="Level" value={level || null} varies={level === null} />
        </PropertySection>
      </DockPanel>
    );
  }

  const el: ElementRecord = model.elements[selection[0]];
  const groups = properties?.index === el.index ? properties.groups : null;
  return (
    <DockPanel title="Properties">
      <TypeSelector icon={ICON[el.category]} category={el.category === 'Other' ? el.ifcClass : `${el.category} · ${el.ifcClass}`} typeName={el.typeName || el.name || el.ifcClass} />
      <PropertySection title="Identity">
        <PropertyRow label="Element ID" value={el.expressId} mono />
        <PropertyRow label="GlobalId" value={el.globalId} mono />
        <PropertyRow label="Name" value={el.name || null} />
        <PropertyRow label="Mark" value={el.mark || '—'} />
        {el.markSource ? <PropertyRow label="Mark from" value={el.markSource} readOnly /> : null}
        <div className="app-inline-action">
          <button type="button" className="app-link" onClick={onEditMarkRules}>
            Mark rules…
          </button>
        </div>
      </PropertySection>
      <PropertySection title="Constraints">
        <PropertyRow label="Level" value={el.level || null} />
      </PropertySection>
      {groups === null ? (
        <p className="app-empty-note">Loading properties…</p>
      ) : properties?.error ? (
        <p className="app-empty-note">Properties could not be read: {properties.error}</p>
      ) : (
        groups.map((g, gi) => (
          <PropertySection key={`${g.name}-${gi}`} title={g.name}>
            {g.items.map((p, pi) => (
              <PropertyRow key={`${p.name}-${pi}`} label={p.name} value={fmtValue(p.value)} unit={p.value === null ? undefined : p.unit || undefined} readOnly={g.kind === 'qto'} />
            ))}
          </PropertySection>
        ))
      )}
    </DockPanel>
  );
}
