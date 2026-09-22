import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@shanku/ui';
import { DEFAULT_MARK_RULES, type ElementRecord } from '@shanku/engine';

export interface MarkRulesDialogProps {
  open: boolean;
  rules: string[];
  elements: readonly ElementRecord[];
  onSave: (rules: string[]) => void;
  onClose: () => void;
}

/**
 * Edit the property names Shanku reads as an element's mark, in priority order.
 * "ID" matches any property set; "01--COLUMN_M.ID" matches only that set.
 */
export function MarkRulesDialog({ open, rules, elements, onSave, onClose }: MarkRulesDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<string[]>(rules);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setDraft(rules);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open, rules]);

  const found = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of elements) if (e.markSource) m.set(e.markSource, (m.get(e.markSource) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [elements]);

  const move = (i: number, d: number) =>
    setDraft((r) => {
      const n = [...r];
      const j = i + d;
      if (j < 0 || j >= n.length) return r;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <dialog ref={ref} className="app-dialog" onClose={onClose} aria-labelledby="mark-rules-title">
      <h2 id="mark-rules-title" className="app-dialog__title">
        Mark rules
      </h2>
      <p className="app-dialog__text">
        Property names read as the element's mark, first match wins. Write <code>ID</code> to match any property set, or{' '}
        <code>01--COLUMN_M.ID</code> for one set only. Names are not case-sensitive.
      </p>
      <ol className="app-rules">
        {draft.map((r, i) => (
          <li key={i}>
            <input aria-label={`Rule ${i + 1}`} value={r} onChange={(e) => setDraft((d) => d.map((x, k) => (k === i ? e.target.value : x)))} />
            <button type="button" className="sk-icon-button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="sk-icon-button" aria-label="Move down" disabled={i === draft.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button type="button" className="sk-icon-button" aria-label={`Remove ${r || 'rule'}`} onClick={() => setDraft((d) => d.filter((_, k) => k !== i))}>
              ×
            </button>
          </li>
        ))}
      </ol>
      <div className="app-dialog__row">
        <Button size="sm" onClick={() => setDraft((d) => [...d, ''])}>
          Add rule
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDraft([...DEFAULT_MARK_RULES])}>
          Reset to defaults
        </Button>
      </div>
      {found.length ? (
        <p className="app-dialog__text">
          Found in this model: {found.map(([src, n]) => `${src} (${n.toLocaleString('en-IN')})`).join(', ')}.
        </p>
      ) : (
        <p className="app-dialog__text">No marks found in this model with the current rules.</p>
      )}
      <div className="app-dialog__actions">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            onSave(draft.map((r) => r.trim()).filter(Boolean));
            onClose();
          }}
        >
          Save and re-detect
        </Button>
      </div>
    </dialog>
  );
}
