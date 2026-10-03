import { useEffect, useState } from 'react';
import { Button } from '@cad2bim/ui';
import { formatLength } from '@cad2bim/engine';
import type { Datum } from '../features/datums/useDatums';

/** Grids and reference planes: rename (Enter) and delete, each one undo step. */
export function DatumsList({ datums, onRename, onDelete }: { datums: Datum[]; onRename: (id: string, name: string) => void; onDelete: (id: string) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft({});
  }, [datums]);
  if (!datums.length) return <p className="app-geom__hint">No grids or reference planes yet: in a plan, Grid (GR) or Reference Plane (RP), then click two points or type a length.</p>;
  return (
    <table className="app-levels__table" aria-label="Grids and reference planes">
      <thead>
        <tr>
          <th>Grids and reference planes</th>
          <th>Length</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {datums.map((d) => (
          <tr key={d.id}>
            <td>
              <input
                aria-label={`${d.kind === 'grid' ? 'Grid' : 'Reference plane'} name`}
                placeholder={d.kind === 'grid' ? 'Grid' : 'Reference plane'}
                value={draft[d.id] ?? d.name}
                onChange={(e) => setDraft((x) => ({ ...x, [d.id]: e.target.value }))}
                onKeyDown={(e) => (e.key === 'Enter' ? onRename(d.id, draft[d.id] ?? d.name) : undefined)}
                onBlur={() => draft[d.id] !== undefined && onRename(d.id, draft[d.id])}
              />
            </td>
            <td>{formatLength(Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) / 1000, { symbol: true })}</td>
            <td>
              <Button size="sm" onClick={() => onDelete(d.id)}>
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
