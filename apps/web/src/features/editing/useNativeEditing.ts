/**
 * Native editing (docs/design/native-editing.md, stage 1): Revit's Modify tools on Shanku's own parametric
 * model. The model is built from the open IFC the first time it is needed (model/parametric: clean shapes
 * convert, the rest stays reference); each edit is one transaction — one Ctrl + Z — and reaches the 3D
 * view as a patch merged like a live update. Edits are kept on this device as they happen and saved in the
 * project; models linked to Revit keep the Changes for Revit route until Sync with Revit (stage 3).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { arrayLinear, changeOf, copy, deriveElement, levelDatums, rehost, type LevelDatum, elementPatch, isReference, kindForCategory, mirror, move, newGlobalId, offset, pin, remove, rotate, trianglesOf, type EditResult, type ElementRecord, type History, type ParamElement, type Pt } from '@shanku/engine';
import type { ModifyRequest } from '../../lib/editChecks';
import { endTask, startTask } from '../../lib/progress';
import { loadEdits, saveEdits, type SavedEdits } from '../../lib/session';
import type { useShankuModel } from '../../lib/useShankuModel';

/** The touched elements in one state: as they are, and the ids absent in it. */
interface EditState {
  present: ParamElement[];
  absent: string[];
}

export interface NativeEditingDeps {
  m: ReturnType<typeof useShankuModel>;
  history: History;
  setNotice: (n: string | null) => void;
  /** Linked to Revit: edits go through Changes for Revit (until Sync with Revit). */
  revitLinked: boolean;
}

export function useNativeEditing({ m, history, setNotice, revitLinked }: NativeEditingDeps) {
  const doc = useRef(new Map<string, ParamElement>());
  const refs = useRef(new Map<string, string>()); // GlobalId → why it stays reference
  const records = useRef(new Map<string, ElementRecord>()); // GlobalId → the record an element (or its copies) takes
  const original = useRef(new Set<string>()); // GlobalIds in the model as opened
  const levels = useRef<LevelDatum[]>([]); // the model's levels: elements are hosted on them (Revit's way)
  const edited = useRef(new Map<string, ParamElement | null>()); // since opening: as now, or null (deleted)
  // A model is "opened" when it has no revision (merges, ours and Revit's live updates, add one) and is not the
  // one last seen: the parametric model is built once per opening, and edits reset only then.
  const opened = useRef(0);
  const seen = useRef<unknown>(null);
  const builtFor = useRef(-1);
  const [edits, setEdits] = useState(0); // how many elements differ from the model as opened
  const [openTick, setOpenTick] = useState(0);
  const [version, setVersion] = useState(0); // every edit: what is kept is saved again
  const info = m.model?.info;
  const fileName = info?.fileName;
  if (m.model && !m.model.revision && m.model.info !== seen.current) {
    seen.current = m.model.info;
    opened.current += 1;
  }

  /** The parametric model for the open model (built once per model; a large model takes about a second). */
  const ensure = useCallback((): boolean => {
    const model = m.model;
    if (!model) return false;
    if (builtFor.current === opened.current) return true;
    startTask('edit', 'Preparing to edit', 'Reading the model as parametric elements…');
    try {
      doc.current = new Map();
      refs.current = new Map();
      records.current = new Map();
      original.current = new Set();
      levels.current = levelDatums(model);
      for (const e of model.elements) {
        records.current.set(e.globalId, e);
        original.current.add(e.globalId);
        const kind = kindForCategory(e.category, e.ifcClass);
        if (!kind) continue;
        const r = deriveElement({ id: e.globalId, kind, mark: e.mark, material: e.grade || null, level: e.level, type: e.typeName }, trianglesOf(model.mesh, e.index), e.volume);
        if (isReference(r)) refs.current.set(e.globalId, r.reason);
        else doc.current.set(e.globalId, rehost(r, levels.current));
      }
      builtFor.current = opened.current;
      return true;
    } finally {
      endTask('edit');
    }
  }, [m.model]);

  /** Brings the model to a state of the touched elements (the transaction's apply). */
  const applyState = useCallback(
    (s: EditState, select?: string[]) => {
      for (const id of s.absent) doc.current.delete(id);
      for (const e of s.present) doc.current.set(e.id, e);
      for (const e of s.present) edited.current.set(e.id, e);
      for (const id of s.absent) {
        if (original.current.has(id)) edited.current.set(id, null);
        else edited.current.delete(id);
      }
      const model = m.model;
      if (!model) return;
      const items = s.present.flatMap((e) => {
        const record = records.current.get(e.id);
        return record ? [{ record, element: e }] : [];
      });
      m.applyEdit(elementPatch(model, items), s.absent, select);
      setEdits(edited.current.size);
      setVersion((v) => v + 1);
    },
    [m],
  );

  // a model opened: its parametric model is rebuilt when needed, its kept edits come back
  const openCount = opened.current;
  useEffect(() => {
    if (openCount !== openTick) setOpenTick(openCount);
  }, [openCount, openTick]);
  useEffect(() => {
    edited.current = new Map();
    setEdits(0);
    const name = fileName;
    if (!name || revitLinked || !openTick) return;
    void loadEdits<ParamElement>(name).then((kept) => {
      if (!kept || (!kept.elements.length && !kept.deleted.length) || !ensure()) return;
      for (const e of kept.elements) if (!records.current.has(e.id)) {
        const like = [...doc.current.values()].find((d) => d.kind === e.kind && d.mark === e.mark);
        const rec = like && records.current.get(like.id);
        if (rec) records.current.set(e.id, rec);
      }
      applyState({ present: kept.elements, absent: kept.deleted });
      setNotice(`${kept.elements.length + kept.deleted.length} edited element${kept.elements.length + kept.deleted.length === 1 ? '' : 's'} restored.`);
    });
  }, [openTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // edits are kept on this device as they happen
  useEffect(() => {
    const name = fileName;
    if (!name || builtFor.current !== opened.current) return;
    const t = window.setTimeout(() => {
      const kept: SavedEdits<ParamElement> = { elements: [], deleted: [] };
      for (const [id, e] of edited.current) {
        if (e) kept.elements.push(e);
        else kept.deleted.push(id);
      }
      void saveEdits(name, kept);
    }, 300);
    return () => window.clearTimeout(t);
  }, [version, fileName]);

  /** Why the selection cannot be edited now, or null. */
  const whyNot = (): string | null => {
    if (!m.model) return 'Open a model first.';
    if (revitLinked) return 'This model is linked to Revit: its edits go through Changes for Revit (Sync with Revit comes next).';
    if (!m.selection.length) return 'Select the elements to modify first.';
    return null;
  };

  /**
   * Runs a Modify operation on the selection as one transaction. Copies and mirrored copies become the
   * selection, as in Revit; what could not be changed is said with the reason.
   */
  const run = useCallback(
    (label: string, op: (els: ParamElement[], newId: () => string) => EditResult) => {
      const why = whyNot();
      if (why) return setNotice(why);
      if (!ensure() || !m.model) return;
      const picked = m.selection.map((i) => m.model!.elements[i]).filter(Boolean);
      const els: ParamElement[] = [];
      const skipped: string[] = [];
      for (const r of picked) {
        const e = doc.current.get(r.globalId);
        if (e) els.push(e);
        else skipped.push(`${r.mark || r.name}: ${refs.current.get(r.globalId) ? `kept as reference (${refs.current.get(r.globalId)})` : 'not a structural element Shanku edits yet'}`);
      }
      const raw = op(els, () => newGlobalId());
      // hosted on the same levels; a vertical move changes offsets, not absolute heights (Revit's way)
      const res = { ...raw, changed: raw.changed.map((e) => rehost(e, levels.current)), created: raw.created.map((e) => rehost(e, levels.current)) };
      // copies take the record (category, type, properties) of the element they came from
      for (const c of res.created) {
        const from = els.find((e) => e.kind === c.kind && e.mark === c.mark) ?? els[0];
        const rec = from && records.current.get(from.id);
        if (rec) records.current.set(c.id, rec);
      }
      const ch = changeOf(doc.current, label, res);
      const refused = [...skipped, ...res.refused.map((r) => `${doc.current.get(r.id)?.mark || r.id}: ${r.reason}`)];
      if (!ch) return setNotice(refused.length ? `Nothing changed. ${refused.slice(0, 3).join('; ')}${refused.length > 3 ? ` and ${refused.length - 3} more` : ''}.` : 'Nothing changed.');
      const before: EditState = { present: ch.before, absent: ch.after.filter((a) => !ch.before.some((b) => b.id === a.id)).map((a) => a.id) };
      const after: EditState = { present: ch.after, absent: ch.before.filter((b) => !ch.after.some((a) => a.id === b.id)).map((b) => b.id) };
      const select = res.created.length ? res.created.map((e) => e.id) : undefined;
      history.run(label, (t) => t.change('elements', before, after, (s: EditState) => applyState(s, s === after ? select : undefined)));
      const n = res.changed.length + res.created.length + res.deleted.length;
      setNotice(`${label}: ${n} element${n === 1 ? '' : 's'}.${refused.length ? ` Not changed: ${refused.slice(0, 2).join('; ')}${refused.length > 2 ? ` and ${refused.length - 2} more` : ''}.` : ''}`);
      m.log(`${label}: ${n} element${n === 1 ? '' : 's'} (native edit; Ctrl + Z undoes it).`);
    },
    [m, history, ensure, applyState, setNotice, revitLinked], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** An element's plan centre (point: its centre; line: its midpoint; outline: its vertices' mean). */
  const centreOf = (e: ParamElement): Pt => {
    if (e.center) return e.center;
    if (e.start && e.end) return [(e.start[0] + e.end[0]) / 2, (e.start[1] + e.end[1]) / 2];
    const o = e.outline ?? [[0, 0]];
    return [o.reduce((s, p) => s + p[0], 0) / o.length, o.reduce((s, p) => s + p[1], 0) / o.length];
  };
  const groupCentre = (els: ParamElement[]): Pt => {
    const cs = els.map(centreOf);
    return [cs.reduce((s, p) => s + p[0], 0) / (cs.length || 1), cs.reduce((s, p) => s + p[1], 0) / (cs.length || 1)];
  };
  const join = (rs: EditResult[]): EditResult => ({ changed: rs.flatMap((r) => r.changed), created: rs.flatMap((r) => r.created), deleted: rs.flatMap((r) => r.deleted), refused: rs.flatMap((r) => r.refused) });

  /** The Modify dialog's request, as one transaction. */
  const perform = (r: ModifyRequest) => {
    switch (r.kind) {
      case 'move':
        return run('Move', (els) => move(els, r.dx, r.dy, r.dz));
      case 'copy':
        return run('Copy', (els, id) => copy(els, r.dx, r.dy, r.dz, id));
      case 'rotate':
        return run('Rotate', (els) => (r.about === 'group' ? rotate(els, r.angle, groupCentre(els)) : join(els.map((e) => rotate([e], r.angle, centreOf(e))))));
      case 'mirror':
        return run('Mirror', (els, id) => {
          const c = groupCentre(els);
          const t = ((r.axis === 'vertical' ? 90 : r.axis === 'horizontal' ? 0 : r.angle) * Math.PI) / 180;
          return mirror(els, c, [c[0] + Math.cos(t) * 1000, c[1] + Math.sin(t) * 1000], { copy: r.copy, newId: id });
        });
      case 'array':
        return run('Array', (els, id) => arrayLinear(els, r.dx, r.dy, r.dz, r.count, id));
      case 'offset':
        return run('Offset', (els, id) => offset(els, r.distance, { copy: r.copy, newId: id }));
    }
  };
  const del = () => run('Delete', (els) => remove(els));
  const setPinned = (on: boolean) => run(on ? 'Pin' : 'Unpin', (els) => pin(els, on));

  return { nativePerform: perform, nativeDelete: del, nativePin: setPinned, nativeWhy: whyNot, nativeEditCount: edits };
}
