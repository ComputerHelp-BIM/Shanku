import { useEffect, useState } from 'react';
import { Button } from '@cad2bim/ui';
import { parseLength, unitLabel } from '@cad2bim/engine';
import { modifyProblem, readNumber, type ModifyKind, type ModifyRequest } from '../lib/editChecks';

const TITLE: Record<ModifyKind, string> = { move: 'Move', copy: 'Copy', rotate: 'Rotate', mirror: 'Mirror', array: 'Array', offset: 'Offset' };
const KEYS: Record<ModifyKind, string> = { move: 'MV', copy: 'CO', rotate: 'RO', mirror: 'MM', array: 'AR', offset: 'OF' };
const WHAT: Record<ModifyKind, string> = {
  move: 'along the model’s axes (X east, Y north, Z up).',
  copy: 'copied by a distance along the model’s axes; the copies become the selection.',
  rotate: 'about a vertical axis; positive turns counter-clockwise seen from above.',
  mirror: 'about an axis through the selection’s centre; a mirrored copy unless Copy is cleared, as in Revit.',
  array: 'copies in a row: the spacing between each, and how many in all (the original included).',
  offset: 'beams and walls moved parallel to themselves; positive to the left of start → end.',
};

/**
 * Revit's Modify tools with typed values (stage 1): Move, Copy, Rotate, Mirror, Array, Offset on cad2bim's own
 * model. Picking points, snaps and temporary dimensions come next; Delete, Pin and Unpin need no dialog.
 */
export function ModifyTool({ kind, count, disabledWhy, onKind, onApply, onClose }: { kind: ModifyKind; count: number; disabledWhy: string | null; onKind: (k: ModifyKind) => void; onApply: (r: ModifyRequest) => void; onClose: () => void }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [about, setAbout] = useState<'each' | 'group'>('each');
  const [axis, setAxis] = useState<'horizontal' | 'vertical' | 'angle'>('vertical');
  const [copy, setCopy] = useState(true);
  useEffect(() => {
    setV({});
    setCopy(kind !== 'offset');
  }, [kind]);
  /** a length typed in Project Units → mm (empty: 0) */
  const n = (k: string) => ((v[k] ?? '').trim() === '' ? 0 : parseLength(v[k]) * 1000);
  const num = (k: string) => readNumber(v[k] ?? '');
  const req: ModifyRequest =
    kind === 'move' || kind === 'copy'
      ? { kind, dx: n('dx'), dy: n('dy'), dz: n('dz') }
      : kind === 'rotate'
        ? { kind, angle: num('angle'), about }
        : kind === 'mirror'
          ? { kind, axis, angle: num('axisAngle'), copy }
          : kind === 'array'
            ? { kind, dx: n('dx'), dy: n('dy'), dz: n('dz'), count: v.count ? readNumber(v.count) : 2 }
            : { kind, distance: n('distance'), copy };
  const touched = kind === 'mirror' || Object.values(v).some((x) => x !== '');
  const problem = disabledWhy ?? (touched ? modifyProblem(req) : null);
  const ready = !disabledWhy && touched && !modifyProblem(req);
  const apply = () => {
    if (!ready) return;
    onApply(req);
    onClose();
  };
  const field = (key: string, label: string, unit: string, auto = false, placeholder = '0') => (
    <label className="app-geom__field">
      <span>{label}</span>
      <input autoFocus={auto} inputMode="decimal" value={v[key] ?? ''} placeholder={placeholder} onChange={(e) => setV((o) => ({ ...o, [key]: e.target.value }))} onKeyDown={(e) => (e.key === 'Enter' ? apply() : e.key === 'Escape' ? onClose() : undefined)} aria-label={`${label} (${unit})`} />
      <em>{unit}</em>
    </label>
  );
  const radio = <T extends string>(value: T, cur: T, set: (x: T) => void, label: string) => (
    <label>
      <input type="radio" checked={cur === value} onChange={() => set(value)} /> {label}
    </label>
  );
  return (
    <div className="app-geom">
      <div className="app-geom__modes" role="tablist" aria-label="Tool">
        {(Object.keys(TITLE) as ModifyKind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => onKind(k)}>
            {TITLE[k]} <kbd>{KEYS[k]}</kbd>
          </button>
        ))}
      </div>
      <p className="app-geom__what">
        {count === 1 ? '1 selected element' : `${count.toLocaleString('en-IN')} selected elements`}, {WHAT[kind]}
      </p>
      <div className="app-geom__fields">
        {kind === 'move' || kind === 'copy' || kind === 'array' ? (
          <>
            {field('dx', kind === 'array' ? 'Spacing X' : 'ΔX', unitLabel(), true)}
            {field('dy', kind === 'array' ? 'Spacing Y' : 'ΔY', unitLabel())}
            {field('dz', kind === 'array' ? 'Spacing Z' : 'ΔZ', unitLabel())}
            {kind === 'array' ? field('count', 'Count', 'in all', false, '2') : null}
          </>
        ) : null}
        {kind === 'rotate' ? (
          <>
            {field('angle', 'Angle', '°', true)}
            <fieldset className="app-geom__about">
              <legend>About</legend>
              {radio('each', about, setAbout, 'each element’s centre')}
              {radio('group', about, setAbout, 'the selection’s centre')}
            </fieldset>
          </>
        ) : null}
        {kind === 'mirror' ? (
          <fieldset className="app-geom__about">
            <legend>Axis through the selection’s centre</legend>
            {radio('vertical', axis, setAxis, 'vertical (mirrors east ↔ west)')}
            {radio('horizontal', axis, setAxis, 'horizontal (mirrors north ↔ south)')}
            {radio('angle', axis, setAxis, 'at an angle')}
            {axis === 'angle' ? field('axisAngle', 'Axis angle', '° from X', true) : null}
          </fieldset>
        ) : null}
        {kind === 'offset' ? field('distance', 'Distance', unitLabel(), true) : null}
        {kind === 'mirror' || kind === 'offset' ? (
          <label className="app-geom__check">
            <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> Copy (keep the original)
          </label>
        ) : null}
      </div>
      {problem ? <p className="app-geom__problem">{problem}</p> : <p className="app-geom__hint">One undo step (Ctrl + Z). Pinned elements and elements kept as reference are left as they are, with the reason.</p>}
      <div className="app-geom__buttons">
        <Button size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!ready} onClick={apply}>
          {TITLE[kind]}
        </Button>
      </div>
    </div>
  );
}
