import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IfcClient, type Category, type ParsedModel, type PropertyGroup, type SelectMode } from '@shanku/engine';
import { fmtBytes, fmtCount, fmtMs } from './format';
import type { PickedFile } from './openFile';

export interface ActivityEntry {
  id: number;
  time: Date;
  text: string;
  tone: 'info' | 'error';
}

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; fileName: string; done: number; total: number }
  | { status: 'ready' }
  | { status: 'error'; message: string };

/** Owns the IFC worker, the open model, the selection and on-demand properties. */
export function useShankuModel() {
  const clientRef = useRef<IfcClient | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'idle' });
  const [model, setModel] = useState<ParsedModel | null>(null);
  const [selection, setSelection] = useState<number[]>([]);
  const [properties, setProperties] = useState<{ index: number; groups: PropertyGroup[] | null; error?: string } | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const logId = useRef(0);

  const log = useCallback((text: string, tone: ActivityEntry['tone'] = 'info') => {
    setActivity((a) => [...a.slice(-199), { id: ++logId.current, time: new Date(), text, tone }]);
  }, []);

  useEffect(() => {
    const client = new IfcClient(`${import.meta.env.BASE_URL}wasm/`);
    clientRef.current = client;
    client.ready().catch((e: Error) => log(`The IFC engine failed to start: ${e.message}`, 'error'));
    return () => client.dispose();
  }, [log]);

  const open = useCallback(
    async (file: PickedFile) => {
      const client = clientRef.current;
      if (!client) return;
      const size = file.bytes.byteLength;
      setLoad({ status: 'loading', fileName: file.name, done: 0, total: 0 });
      setSelection([]);
      setProperties(null);
      const t0 = performance.now();
      try {
        const parsed = await client.open(file.name, file.bytes, (p) =>
          setLoad({ status: 'loading', fileName: file.name, done: p.done, total: p.total }),
        );
        const wall = performance.now() - t0;
        setModel(parsed);
        setLoad({ status: 'ready' });
        const t = parsed.info.timings;
        log(
          `Opened ${file.name} (${fmtBytes(size)}): ${fmtCount(parsed.info.elementCount)} elements, ` +
            `${fmtCount(parsed.info.triangleCount)} triangles in ${fmtMs(wall)} ` +
            `(read ${fmtMs(t.open)}, relations ${fmtMs(t.relations)}, geometry ${fmtMs(t.geometry)}).`,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLoad({ status: 'error', message: `${file.name} could not be opened. ${message}` });
        log(`Could not open ${file.name}: ${message}`, 'error');
      }
    },
    [log],
  );

  // Properties for a single selected element, newest request wins.
  const propRequest = useRef(0);
  useEffect(() => {
    if (!model || selection.length !== 1) {
      setProperties(null);
      return;
    }
    const index = selection[0];
    const el = model.elements[index];
    const req = ++propRequest.current;
    setProperties({ index, groups: null });
    clientRef.current
      ?.properties(el.expressId)
      .then((groups) => req === propRequest.current && setProperties({ index, groups }))
      .catch((e: Error) => req === propRequest.current && setProperties({ index, groups: [], error: e.message }));
  }, [model, selection]);

  /** Revit click rules: plain click replaces, Ctrl adds, Shift removes; empty space clears (plain only). */
  const pick = useCallback((index: number | null, mode: SelectMode) => {
    setSelection((cur) => {
      if (index === null) return mode === 'replace' ? [] : cur;
      if (mode === 'add') return cur.includes(index) ? cur : [...cur, index];
      if (mode === 'remove') return cur.filter((i) => i !== index);
      return [index];
    });
  }, []);

  const boxSelect = useCallback((indices: number[], mode: SelectMode) => {
    setSelection((cur) => {
      if (mode === 'add') return [...new Set([...cur, ...indices])];
      if (mode === 'remove') {
        const drop = new Set(indices);
        return cur.filter((i) => !drop.has(i));
      }
      return indices;
    });
  }, []);

  const selectWhere = useCallback(
    (predicate: (category: Category, level: string) => boolean) => {
      if (!model) return;
      setSelection(model.elements.filter((e) => predicate(e.category, e.level)).map((e) => e.index));
    },
    [model],
  );

  /** Finds an element by Element ID (express id), GlobalId, or name. */
  const find = useCallback(
    (query: string): number | null => {
      if (!model) return null;
      const q = query.trim();
      if (!q) return null;
      const els = model.elements;
      const hit =
        (/^\d+$/.test(q) && els.find((e) => e.expressId === Number(q))) ||
        els.find((e) => e.globalId === q) ||
        els.find((e) => e.name.toLowerCase() === q.toLowerCase()) ||
        els.find((e) => e.tag === q) ||
        els.find((e) => e.name.toLowerCase().includes(q.toLowerCase()));
      return hit ? hit.index : null;
    },
    [model],
  );

  return useMemo(
    () => ({ load, model, selection, setSelection, properties, activity, log, open, pick, boxSelect, selectWhere, find }),
    [load, model, selection, properties, activity, log, open, pick, boxSelect, selectWhere, find],
  );
}
