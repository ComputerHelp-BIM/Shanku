import { DIMENSION_TOOLS, type DimensionReadout } from '@shanku/engine';

/**
 * The Dimension tool's strip over the top of the view (Revit's Options Bar): which tool, what to pick
 * next or what a click takes now, and its place in the Tab cycle. One line, so the model stays clickable.
 */
export function DimensionBar({ readout: r, onClose }: { readout: DimensionReadout; onClose: () => void }) {
  const tool = DIMENSION_TOOLS.find((t) => t.id === r.kind);
  const name = `${tool?.label ?? ''}${r.kind.startsWith('spot') ? '' : ' Dimension'}`;
  return (
    <section className="app-toolstrip" aria-label={name}>
      <strong>{name}</strong>
      <span className="app-toolstrip__prompt" aria-live="polite" title={r.prompt}>
        {r.prompt}
        {r.hover ? (
          <>
            {' · '}
            <span className="app-toolstrip__hover">{r.hover.label}</span>
            {r.hover.total > 1 ? <em>{r.hover.position} of {r.hover.total} · Tab</em> : null}
          </>
        ) : null}
      </span>
      <button type="button" className="app-toolstrip__close" aria-label="Close (Esc)" title="Close (Esc: cancel, again: close)" onClick={onClose}>
        ×
      </button>
    </section>
  );
}
