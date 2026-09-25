import { COLOR_MODES, PALETTES, rampCss, type ColorMode, type ColorResult, type ColorSettings } from '../lib/colorBy';
import { fmtCount } from '../lib/format';

const fmtVal = (v: number, unit: string) => `${v.toLocaleString('en-IN', { maximumFractionDigits: unit === 'm³' ? 3 : 2 })} ${unit}`;

export interface ColorPanelProps {
  settings: ColorSettings;
  result: ColorResult;
  hasModel: boolean;
  onChange: (s: ColorSettings) => void;
  onSelect: (elements: number[]) => void;
}

/**
 * The element palette (after the Structura viewer): colour by category, grade, level, type, section,
 * mark, or a gradient by height, length or volume. The legend recolours a group from its swatch,
 * hides it with its check box, and selects it from its name.
 */
export function ColorPanel({ settings: s, result, hasModel, onChange, onSelect }: ColorPanelProps) {
  if (!hasModel) return <p className="app-empty-note">Open a model to colour it by grade, level, section and more.</p>;
  const set = (patch: Partial<ColorSettings>) => onChange({ ...s, ...patch });
  const mode = COLOR_MODES.find((m) => m.id === s.mode)!;
  const toggle = (key: string) => {
    const k = `${s.mode}|${key}`;
    set({ off: s.off.includes(k) ? s.off.filter((x) => x !== k) : [...s.off, k] });
  };
  return (
    <div className="app-colour">
      <div className="app-colour__label" id="colour-mode-label">Colour elements by</div>
      <div className="app-colour__modes" role="radiogroup" aria-labelledby="colour-mode-label">
        {COLOR_MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={s.mode === m.id} className={s.mode === m.id ? 'is-active' : undefined} title={m.tip} onClick={() => set({ mode: m.id as ColorMode })}>
            {m.label}
          </button>
        ))}
      </div>
      {s.mode !== 'none' && !mode.gradient ? (
        <label className="app-colour__palette">
          <span>Palette</span>
          <select className="app-select" value={s.palette} onChange={(e) => set({ palette: e.target.value })}>
            {Object.keys(PALETTES).map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
          <span className="app-colour__swatches" aria-hidden="true">
            {PALETTES[s.palette].slice(0, 6).map((c) => (
              <i key={c} style={{ background: c }} />
            ))}
          </span>
        </label>
      ) : null}
      {s.mode === 'none' ? <p className="app-empty-note">Pick a mode to colour the model. Visibility/Graphics overrides still win, as in Revit.</p> : null}
      {result.range ? (
        <div className="app-colour__range">
          <div className="app-colour__bar" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(rampCss).join(', ')})` }} />
          <div className="app-colour__scale">
            <span>{fmtVal(result.range.min, result.range.unit)}</span>
            <span>{fmtVal(result.range.max, result.range.unit)}</span>
          </div>
          <p className="app-empty-note">Elements without a {s.mode} stay grey.</p>
        </div>
      ) : null}
      {result.groups.length ? (
        <>
          <p className="app-colour__hint">Swatch: recolour · check box: show or hide · name: select the group</p>
          <ul className="app-colour__legend" aria-label={`Legend: ${mode.label}`}>
            {result.groups.map((g) => (
              <li key={g.key} className={g.hidden ? 'is-off' : undefined}>
                <input type="checkbox" checked={!g.hidden} aria-label={`Show ${g.key}`} onChange={() => toggle(g.key)} />
                <label className="app-colour__swatch" style={{ background: g.color }} title={`Recolour ${g.key}`}>
                  <input type="color" value={g.color} aria-label={`Colour for ${g.key}`} onChange={(e) => set({ custom: { ...s.custom, [`${s.mode}|${g.key}`]: e.target.value } })} />
                </label>
                <button type="button" className="app-colour__name" title={`Select ${fmtCount(g.count)} elements`} onClick={() => onSelect(g.elements)}>
                  {g.key}
                </button>
                <span className="app-colour__count">{fmtCount(g.count)}</span>
              </li>
            ))}
          </ul>
          <div className="app-colour__actions">
            <button type="button" className="app-link" disabled={!Object.keys(s.custom).some((k) => k.startsWith(`${s.mode}|`)) && !s.off.some((k) => k.startsWith(`${s.mode}|`))} onClick={() => set({ custom: Object.fromEntries(Object.entries(s.custom).filter(([k]) => !k.startsWith(`${s.mode}|`))), off: s.off.filter((k) => !k.startsWith(`${s.mode}|`)) })}>
              Reset colours and show all
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** A compact legend over the view while colouring, for screenshots and presentations. */
export function ColorLegendOverlay({ settings, result, onOpen }: { settings: ColorSettings; result: ColorResult; onOpen: () => void }) {
  if (settings.mode === 'none' || (!result.groups.length && !result.range)) return null;
  const mode = COLOR_MODES.find((m) => m.id === settings.mode)!;
  const shown = result.groups.filter((g) => !g.hidden);
  return (
    <button type="button" className="app-legend" onClick={onOpen} title="Open the Colour panel">
      <strong>{mode.label}</strong>
      {result.range ? (
        <>
          <span className="app-legend__bar" style={{ background: `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(rampCss).join(', ')})` }} />
          <span className="app-legend__scale">
            <span>{fmtVal(result.range.min, result.range.unit)}</span>
            <span>{fmtVal(result.range.max, result.range.unit)}</span>
          </span>
        </>
      ) : (
        <>
          {shown.slice(0, 8).map((g) => (
            <span key={g.key} className="app-legend__row">
              <i style={{ background: g.color }} />
              {g.key}
              <em>{fmtCount(g.count)}</em>
            </span>
          ))}
          {shown.length > 8 ? <span className="app-legend__more">and {shown.length - 8} more</span> : null}
        </>
      )}
    </button>
  );
}
