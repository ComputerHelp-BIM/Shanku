import { Button } from '@cad2bim/ui';
import { formatLength, type DisplayUnits, type LengthUnit } from '@cad2bim/engine';

const UNITS: Array<[LengthUnit, string]> = [['mm', 'Millimetres'], ['cm', 'Centimetres'], ['m', 'Metres'], ['ft-in', 'Feet and fractional inches']];

/** Project Units (UN): how lengths are shown and typed in this project, as Revit's Project Units. */
export function ProjectUnits({ units, onChange, onClose }: { units: DisplayUnits; onChange: (u: DisplayUnits) => void; onClose: () => void }) {
  const ft = units.length === 'ft-in';
  const sample = [3.2, 101, -2.0525];
  return (
    <div className="app-units">
      <label>
        Length
        <select value={units.length} onChange={(e) => onChange({ ...units, length: e.target.value as LengthUnit, decimals: e.target.value === 'ft-in' ? 2 : units.decimals })} aria-label="Length unit">
          {UNITS.map(([u, l]) => (
            <option key={u} value={u}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        {ft ? 'Rounding' : 'Decimal places'}
        <select value={units.decimals} onChange={(e) => onChange({ ...units, decimals: Number(e.target.value) })} aria-label={ft ? 'Inch rounding' : 'Decimal places'}>
          {(ft ? ['1"', '1/2"', '1/4"', '1/8"', '1/16"'] : ['0', '1', '2', '3', '4']).map((l, i) => (
            <option key={l} value={i}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        Digit grouping
        <select value={units.grouping} onChange={(e) => onChange({ ...units, grouping: e.target.value as DisplayUnits['grouping'] })} aria-label="Digit grouping">
          <option value="indian">Indian (1,01,000)</option>
          <option value="international">International (101,000)</option>
          <option value="none">None (101000)</option>
        </select>
      </label>
      <p className="app-units__sample" aria-label="Sample">
        {sample.map((s) => formatLength(s, { units, symbol: !ft, signed: true })).join('    ')}
      </p>
      <p className="app-geom__hint">cad2bim keeps every length in millimetres inside, exactly; these settings change only how lengths are shown and typed. Typing a unit always wins (3.2m, 450 mm, 10'6").</p>
      <div className="app-geom__buttons">
        <Button size="sm" variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
