import { saveDrawings, type SavedFile } from './session';
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
  /** Selected DXF objects (indices into drawing.handles); props are those of the first one. */
  selected: { entities: number[]; props: Record<string, string | number | number[]> | null } | null;
}

/** Open DXF drawings, one 2D view tab each. */
export function useDrawings(colorsInUse: () => string[], log: (text: string, tone?: 'info' | 'error') => void) {
  const client = useRef<DxfClient | null>(null);
  const [docs, setDocs] = useState<DrawingDoc[]>([]);
  const docsRef = useRef(docs);
  /** Open drawings' bytes, persisted so a reload brings them back. */
  const saved = useRef(new Map<string, SavedFile>());
  docsRef.current = docs;
  const [loading, setLoading] = useState<{ name: string; phase: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => () => client.current?.dispose(), []);

  const open = useCallback(
    async (file: PickedFile): Promise<string | null> => {
      client.current ??= new DxfClient();
      const keep = file.bytes.slice(0); // the worker takes the original buffer; keep a copy for the session
      setLoading({ name: file.name, phase: 'Preparing…' });
      const t0 = performance.now();
      try {
        const drawing = await client.current.open(file.name, file.bytes, (phase) => setLoading({ name: file.name, phase }));
        const id = `dxf-${++seq.current}`;
        saved.current.set(id, { name: file.name, bytes: keep });
        void saveDrawings([...saved.current.values()]);
        const color = nextDocColor([...colorsInUse(), ...docs.map((d) => d.color)]);
        setDocs((ds) => [...ds, { id, name: file.name, color, drawing, layerOn: drawing.layers.map((l) => l.on), units: drawing.info.units, selected: null }]);
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

  const close = useCallback((id: string) => {
    saved.current.delete(id);
    void saveDrawings([...saved.current.values()]);
    setDocs((ds) => {
      const d = ds.find((x) => x.id === id);
      if (d) client.current?.forget(d.drawing.drawingId); // the worker keeps each drawing open for selection
      return ds.filter((x) => x.id !== id);
    });
  }, []);

  /** Selects a DXF object (or clears with null) and loads its properties from the worker. */
  const select = useCallback((id: string, entities: number[] | null) => {
    const list = entities?.length ? entities : null;
    setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, selected: list ? { entities: list, props: null } : null } : d)));
    if (!list) return;
    const doc = docsRef.current.find((d) => d.id === id);
    if (!doc || !client.current) return;
    void client.current.entity(doc.drawing.drawingId, doc.drawing.handles[list[0]]).then((props) =>
      setDocs((ds) => ds.map((d) => (d.id === id && d.selected?.entities[0] === list[0] ? { ...d, selected: { entities: list, props } } : d))),
    );
  }, []);

  const update = useCallback((id: string, patch: Partial<Pick<DrawingDoc, 'layerOn' | 'units'>>) => {
    setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  /** The shared DXF worker (Python + ezdxf), also used by the DXF -> 3D pipeline. */
  const getClient = useCallback(() => (client.current ??= new DxfClient()), []);

  return { docs, loading, open, close, update, select, getClient };
}
