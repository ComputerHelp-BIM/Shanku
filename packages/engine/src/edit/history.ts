/**
 * Undo and redo for parametric edits: each action is one Change (the affected elements before and after),
 * so Ctrl + Z restores exactly what the action touched — one step per action, as in Revit.
 */
import type { ParamElement } from '../model/parametric';
import type { EditResult } from './ops';

export type ElementDoc = ReadonlyMap<string, ParamElement>;

export interface Change {
  label: string;
  /** The affected elements as they were (absent: created by this change). */
  before: ParamElement[];
  /** As they are after (absent: deleted by this change). */
  after: ParamElement[];
}

export interface History {
  past: Change[];
  future: Change[];
}
export const emptyHistory = (): History => ({ past: [], future: [] });

/** An edit's result as a Change against the document (null: nothing to do). */
export function changeOf(doc: ElementDoc, label: string, r: EditResult): Change | null {
  const ids = new Set([...r.changed.map((e) => e.id), ...r.deleted]);
  const before = [...ids].map((id) => doc.get(id)).filter((e): e is ParamElement => !!e);
  const after = [...r.changed, ...r.created];
  if (!after.length && !r.deleted.length) return null;
  return { label, before, after };
}

export function apply(doc: ElementDoc, ch: Change, direction: 'forward' | 'back' = 'forward'): ElementDoc {
  const [from, to] = direction === 'forward' ? [ch.before, ch.after] : [ch.after, ch.before];
  const next = new Map(doc);
  for (const e of from) next.delete(e.id);
  for (const e of to) next.set(e.id, e);
  return next;
}

export function commit(doc: ElementDoc, h: History, ch: Change | null): { doc: ElementDoc; history: History } {
  if (!ch) return { doc, history: h };
  return { doc: apply(doc, ch), history: { past: [...h.past, ch].slice(-200), future: [] } };
}
export function undo(doc: ElementDoc, h: History): { doc: ElementDoc; history: History; label: string | null } {
  const ch = h.past[h.past.length - 1];
  if (!ch) return { doc, history: h, label: null };
  return { doc: apply(doc, ch, 'back'), history: { past: h.past.slice(0, -1), future: [ch, ...h.future] }, label: ch.label };
}
export function redo(doc: ElementDoc, h: History): { doc: ElementDoc; history: History; label: string | null } {
  const ch = h.future[0];
  if (!ch) return { doc, history: h, label: null };
  return { doc: apply(doc, ch), history: { past: [...h.past, ch], future: h.future.slice(1) }, label: ch.label };
}
