import { useEffect, useState } from 'react';
import { Button } from '@cad2bim/ui';
import { formatLength, parseLength, unitLabel } from '@cad2bim/engine';

export interface LevelRow {
  name: string;
  /** mm from ±0 */
  elevation: number;
  added: boolean;
}

/** mm → as the project shows it, signed. */
const fmt = (n: number) => formatLength(n / 1000, { signed: true });
/** typed → mm (NaN when not a length). */
const readMm = (t: string) => parseLength(t) * 1000;

/**
 * Levels as datums (docs/design/datums-and-constraints.md): each level's elevation from ±0. Changing one moves
 * everything hosted on it — columns stretch, beams and slabs move — as one undo step.
 */
export function LevelsTool({ rows, why, deleteWhy, onMove, onNew, onDelete }: { rows: LevelRow[] | null; why: string | null; deleteWhy: (name: string) => string | null; onMove: (name: string, elevation: number) => void; onNew: (name: string, elevation: number) => void; onDelete: (name: string) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const top = rows?.length ? rows[rows.length - 1] : null;
  // as Revit names a new level: the next number after the highest "Level N"
  const highest = Math.max(0, ...(rows ?? []).map((r) => Number(/^Level\s+(\d+)$/i.exec(r.name)?.[1] ?? 0)));
  const next = rows ? `Level ${highest + 1}` : '';
  const [newName, setNewName] = useState('');
  const [newElev, setNewElev] = useState('');
  useEffect(() => {
    setDraft({});
  }, [rows]);
  if (!rows) return <p className="app-geom__problem">{why ?? 'Open a model first.'}</p>;
  const commit = (name: string) => {
    const v = draft[name];
    if (v === undefined) return;
    const n = readMm(v);
    if (Number.isNaN(n)) return;
    onMove(name, n);
  };
  const newElevation = newElev ? readMm(newElev) : (top?.elevation ?? 0) + 3000;
  return (
    <div className="app-levels">
      <p className="app-geom__what">Change a level’s elevation and everything hosted on it follows (columns stretch, beams and slabs move). One undo step each.</p>
      <table className="app-levels__table">
        <thead>
          <tr>
            <th>Level</th>
            <th>Elevation ({unitLabel()} from ±0)</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => {
            const del = deleteWhy(r.name);
            return (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>
                  <input
                    inputMode="decimal"
                    aria-label={`${r.name} elevation`}
                    value={draft[r.name] ?? fmt(r.elevation)}
                    onChange={(e) => setDraft((d) => ({ ...d, [r.name]: e.target.value }))}
                    onKeyDown={(e) => (e.key === 'Enter' ? commit(r.name) : e.key === 'Escape' ? setDraft((d) => ({ ...d, [r.name]: fmt(r.elevation) })) : undefined)}
                    onBlur={() => commit(r.name)}
                  />
                </td>
                <td>{r.added ? <Button size="sm" disabled={!!del} title={del ?? undefined} onClick={() => onDelete(r.name)}>Delete</Button> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="app-levels__new">
        <input aria-label="New level name" placeholder={next} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input aria-label="New level elevation" inputMode="decimal" placeholder={fmt((top?.elevation ?? 0) + 3000)} value={newElev} onChange={(e) => setNewElev(e.target.value)} />
        <Button
          size="sm"
          variant="primary"
          disabled={Number.isNaN(newElevation)}
          onClick={() => {
            onNew(newName.trim() || next, newElevation);
            setNewName('');
            setNewElev('');
          }}
        >
          New level
        </Button>
      </div>
    </div>
  );
}
