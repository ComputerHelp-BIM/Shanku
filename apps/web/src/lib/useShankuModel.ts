import { clearModel as clearSavedModel, saveModel as saveSessionModel } from './session';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_GRADE_RULES, DEFAULT_MARK_RULES, IfcClient, mergeModels, type Category, type MergeResult, type ParsedModel, type PropertyGroup, type SelectMode } from '@shanku/engine';
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
  const modelRef = useRef<ParsedModel | null>(null);
  modelRef.current = model;
  const [selection, setSelection] = useState<number[]>([]);
  const [properties, setProperties] = useState<{ index: number; groups: PropertyGroup[] | null; error?: string } | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const logId = useRef(0);
  const [markRules, setMarkRulesState] = useState<string[]>(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem('shanku.markRules') ?? 'null');
      return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : [...DEFAULT_MARK_RULES];
    } catch {
      return [...DEFAULT_MARK_RULES];
    }
  });
  const markRulesRef = useRef(markRules);
  markRulesRef.current = markRules;
  const [gradeRules, setGradeRulesState] = useState<string[]>(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem('shanku.gradeRules') ?? 'null');
      return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : [...DEFAULT_GRADE_RULES];
    } catch {
      return [...DEFAULT_GRADE_RULES];
    }
  });
  const gradeRulesRef = useRef(gradeRules);
  gradeRulesRef.current = gradeRules;

  const log = useCallback((text: string, tone: ActivityEntry['tone'] = 'info') => {
    setActivity((a) => [...a.slice(-199), { id: ++logId.current, time: new Date(), text, tone }]);
  }, []);

  useEffect(() => {
    const client = new IfcClient(`${import.meta.env.BASE_URL}wasm/`);
    clientRef.current = client;
    client.ready().catch((e: Error) => log(`The IFC engine failed to start: ${e.message}`, 'error'));
    return () => client.dispose();
  }, [log]);

  /** Closes the open model: frees it in the worker and clears selection and properties. */
  const close = useCallback(() => {
    void clearSavedModel();
    clientRef.current?.closeModel();
    setModel(null);
    setSelection([]);
    setProperties(null);
    setLoad({ status: 'idle' });
  }, []);

  const open = useCallback(
    async (file: PickedFile) => {
      const client = clientRef.current;
      if (!client) return;
      const size = file.bytes.byteLength;
      const keep = file.bytes.slice(0); // the worker takes the original buffer; keep a copy for the session
      setLoad({ status: 'loading', fileName: file.name, done: 0, total: 0 });
      setSelection([]);
      setProperties(null);
      const t0 = performance.now();
      try {
        const parsed = await client.open(
          file.name,
          file.bytes,
          (p) => setLoad({ status: 'loading', fileName: file.name, done: p.done, total: p.total }),
          markRulesRef.current,
          gradeRulesRef.current,
        );
        const wall = performance.now() - t0;
        setModel(parsed);
        void saveSessionModel({ name: file.name, bytes: keep }); // restored after a reload
        setLoad({ status: 'ready' });
        const t = parsed.info.timings;
        log(
          `Opened ${file.name} (${fmtBytes(size)}): ${fmtCount(parsed.info.elementCount)} elements, ` +
            `${fmtCount(parsed.info.triangleCount)} triangles in ${fmtMs(wall)} ` +
            `(read ${fmtMs(t.open)}, relations ${fmtMs(t.relations)}, geometry ${fmtMs(t.geometry)}).`,
        );
        const c = parsed.info.compatibility;
        log(`Format: ${c.format} (${c.level}). ${c.notes.join(' ')}`, c.level === 'limited' ? 'error' : 'info');
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setLoad({ status: 'error', message: `${file.name} could not be opened. ${message}` });
        log(`Could not open ${file.name}: ${message}`, 'error');
      }
    },
    [log],
  );

  /**
   * Live update from Revit: opens a partial export of changed elements beside the model, merges it
   * (changed elements in place, deleted ones out, new ones added) and keeps the selection by
   * GlobalId. Returns the merge result so the app can carry its own per-element state across.
   */
  const applyUpdate = useCallback(
    async (fileName: string, bytes: ArrayBuffer | null, deleted: string[]): Promise<MergeResult | null> => {
      const client = clientRef.current;
      const cur = modelRef.current;
      if (!client || !cur) return null;
      const empty: ParsedModel = { info: cur.info, elements: [], mesh: { positions: new Float32Array(), normals: new Float32Array(), elementIds: new Float32Array(), indices: new Uint32Array() }, edges: { positions: new Float32Array(), elementIds: new Float32Array() }, coordination: cur.coordination };
      const patch = bytes ? await client.openPatch(fileName, bytes, markRulesRef.current, gradeRulesRef.current) : empty;
      const r = mergeModels(cur, patch, deleted, patch.elements[0]?.source ?? 0);
      modelRef.current = r.model;
      setModel(r.model);
      setSelection((sel) => sel.flatMap((i) => (r.indexMap.has(i) ? [r.indexMap.get(i)!] : [])));
      return r;
    },
    [],
  );

  /** Changes the mark rules, saves them, and re-detects marks on the open model. */
  const setMarkRules = useCallback(
    async (rules: string[]) => {
      setMarkRulesState(rules);
      try {
        window.localStorage.setItem('shanku.markRules', JSON.stringify(rules));
      } catch {
        /* storage unavailable: rules apply for this session */
      }
      const client = clientRef.current;
      if (!client || !model) return;
      const found = await client.marks(rules);
      const byId = new Map(found.map(([id, mark, src]) => [id, [mark, src] as const]));
      setModel((cur) =>
        cur
          ? {
              ...cur,
              elements: cur.elements.map((e) => {
                const hit = byId.get(e.expressId);
                return { ...e, mark: hit?.[0] ?? '', markSource: hit?.[1] ?? '' };
              }),
            }
          : cur,
      );
      log(`Mark rules updated: ${found.length.toLocaleString('en-IN')} elements have a mark.`);
    },
    [model, log],
  );

  /** Changes the grade rules, saves them, and re-detects grades (falling back to IFC material names). */
  const setGradeRules = useCallback(
    async (rules: string[]) => {
      setGradeRulesState(rules);
      try {
        window.localStorage.setItem('shanku.gradeRules', JSON.stringify(rules));
      } catch {
        /* storage unavailable */
      }
      const client = clientRef.current;
      if (!client || !model) return;
      const found = await client.grades(rules);
      const byId = new Map(found.map(([id, g, src]) => [id, [g, src] as const]));
      setModel((cur) =>
        cur ? { ...cur, elements: cur.elements.map((e) => ({ ...e, grade: byId.get(e.expressId)?.[0] ?? '', gradeSource: byId.get(e.expressId)?.[1] ?? '' })) } : cur,
      );
      log(`Grade rules updated: ${found.filter((f) => f[2] !== 'IfcMaterial').length.toLocaleString('en-IN')} elements matched a rule; the rest use their IFC material.`);
    },
    [model, log],
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
      ?.properties(el.expressId, el.source ?? 0) // an updated element reads from its update's file
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
        els.find((e) => e.mark && e.mark.toLowerCase() === q.toLowerCase()) ||
        els.find((e) => e.name.toLowerCase() === q.toLowerCase()) ||
        els.find((e) => e.tag === q) ||
        els.find((e) => e.name.toLowerCase().includes(q.toLowerCase()));
      return hit ? hit.index : null;
    },
    [model],
  );

  return useMemo(
    () => ({ load, model, selection, setSelection, properties, activity, log, open, applyUpdate, pick, boxSelect, selectWhere, find, markRules, setMarkRules, gradeRules, setGradeRules, close }),
    [close, load, model, selection, properties, activity, log, open, applyUpdate, pick, boxSelect, selectWhere, find, markRules, setMarkRules, gradeRules, setGradeRules],
  );
}
