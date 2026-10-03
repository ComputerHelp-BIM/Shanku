import { useEffect, useState } from 'react';
import { Button } from '@cad2bim/ui';
import { geometryProblem, readNumber, type GeometryEdit } from '../lib/editChecks';

/**
 * Revit's Move (MV) and Rotate (RO) for the selection, with typed values: a move in mm along the model's
 * axes (Revit's own: the IFC cad2bim reads from Revit is exported on them), a rotation in degrees
 * (counter-clockwise seen from above) about each element's centre or the selection's. The edit is staged
 * in Changes for Revit; Revit moves the elements when it is applied, and cad2bim shows the result then.
 */
export function EditGeometry({ mode, count, disabledWhy, onMode, onStage, onClose }: { mode: 'move' | 'rotate'; count: number; disabledWhy?: string | null; onMode: (m: 'move' | 'rotate') => void; onStage: (g: GeometryEdit) => void; onClose: () => void }) {
  const [dx, setDx] = useState('');
  const [dy, setDy] = useState('');
  const [dz, setDz] = useState('');
  const [angle, setAngle] = useState('');
  const [about, setAbout] = useState<'each' | 'group'>('each');
  useEffect(() => {
    setDx('');
    setDy('');
    setDz('');
    setAngle('');
  }, [mode]);
  const g: GeometryEdit = mode === 'move' ? { kind: 'move', dx: readNumber(dx), dy: readNumber(dy), dz: readNumber(dz) } : { kind: 'rotate', angle: readNumber(angle), about };
  const touched = mode === 'move' ? dx + dy + dz !== '' : angle !== '';
  const problem = disabledWhy ?? (touched ? geometryProblem(g) : null);
  const ready = !disabledWhy && touched && !geometryProblem(g);
  const stage = () => {
    if (!ready) return;
    onStage(g);
    onClose();
  };
  const field = (label: string, value: string, set: (v: string) => void, unit: string, auto = false) => (
    <label className="app-geom__field">
      <span>{label}</span>
      <input autoFocus={auto} inputMode="decimal" value={value} placeholder="0" onChange={(e) => set(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' ? stage() : e.key === 'Escape' ? onClose() : undefined)} aria-label={`${label} (${unit})`} />
      <em>{unit}</em>
    </label>
  );
  return (
    <div className="app-geom">
      <div className="app-geom__modes" role="tablist" aria-label="Tool">
        <button type="button" role="tab" aria-selected={mode === 'move'} onClick={() => onMode('move')}>
          Move <kbd>MV</kbd>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'rotate'} onClick={() => onMode('rotate')}>
          Rotate <kbd>RO</kbd>
        </button>
      </div>
      <p className="app-geom__what">
        {count === 1 ? '1 selected element' : `${count.toLocaleString('en-IN')} selected elements`}
        {mode === 'move' ? ', along the model’s axes (Revit’s X, Y and Z).' : ', about a vertical axis; positive turns counter-clockwise seen from above.'}
      </p>
      {mode === 'move' ? (
        <div className="app-geom__fields">
          {field('ΔX', dx, setDx, 'mm', true)}
          {field('ΔY', dy, setDy, 'mm')}
          {field('ΔZ', dz, setDz, 'mm')}
        </div>
      ) : (
        <div className="app-geom__fields">
          {field('Angle', angle, setAngle, '°', true)}
          <fieldset className="app-geom__about">
            <legend>About</legend>
            <label>
              <input type="radio" checked={about === 'each'} onChange={() => setAbout('each')} /> each element’s centre
            </label>
            <label>
              <input type="radio" checked={about === 'group'} onChange={() => setAbout('group')} /> the selection’s centre
            </label>
          </fieldset>
        </div>
      )}
      {problem ? <p className="app-geom__problem">{problem}</p> : <p className="app-geom__hint">Staged in Changes for Revit: check, then apply. Revit moves the elements; cad2bim shows them once Revit has.</p>}
      <div className="app-geom__buttons">
        <Button size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!ready} onClick={stage}>
          {mode === 'move' ? 'Stage the move' : 'Stage the rotation'}
        </Button>
      </div>
    </div>
  );
}
