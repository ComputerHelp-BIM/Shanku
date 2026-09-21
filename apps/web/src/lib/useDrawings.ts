import { useCallback, useEffect, useRef, useState } from 'react';
import { DxfClient, type ParsedDrawing } from '@shanku/engine';
import { nextDocColor } from './documents';
import type { PickedFile } from './openFile';

export interface DrawingDoc {
  id: string;
  name: string;
  color: string;
  drawing: ParsedDrawing;
  layerOn: boolean[];
  /** User override when the file's $INSUNITS is wrong (common in client files). */
  units: string;
}

/** Open DXF drawings, one 2D view tab each. */
export function useDrawings(colorsInUse: () => string[], log: (text: string, tone?: 'info' | 'error') => void) {
  const client = useRef<DxfClient | null>(null);
  const [docs, setDocs] = useState<DrawingDoc[]>([]);
  const [loading, setLoading] = useState<{ name: string; phase: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => () => client.current?.dispose(), []);

  const open = useCallback(
    async (file: PickedFile): Promise<string | null> => {
      client.current ??= new DxfClient();
      setLoading({ name: file.name, phase: 'Preparing…' });
      const t0 = performance.now();
      try {
        const drawing = await client.current.open(file.name, file.bytes, (phase) => setLoading({ name: file.name, phase }));
        const id = `dxf-${++seq.current}`;
        const color = nextDocColor([...colorsInUse(), ...docs.map((d) => d.color)]);
        setDocs((ds) => [...ds, { id, name: file.name, color, drawing, layerOn: drawing.layers.map((l) => l.on), units: drawing.info.units }]);
        const i = drawing.info;
        log(
          `Opened ${file.name}: ${i.segments.toLocaleString('en-IN')} lines, ${i.polygons.toLocaleString('en-IN')} fills, ` +
            `${i.texts.toLocaleString('en-IN')} texts on ${i.layers} layers in ${((performance.now() - t0) / 1000).toFixed(1)} s ` +
            `(${i.release}, declared units ${i.units}).`,
        );
        return id;
      } catch (e) {
        log(`Could not open ${file.name}: ${e instanceof Error ? e.message : String(e)}`, 'error');
        throw e;
      } finally {
        setLoading(null);
      }
    },
    [colorsInUse, docs, log],
  );

  const close = useCallback((id: string) => setDocs((ds) => ds.filter((d) => d.id !== id)), []);
  const update = useCallback((id: string, patch: Partial<Pick<DrawingDoc, 'layerOn' | 'units'>>) => {
    setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  return { docs, loading, open, close, update };
}
