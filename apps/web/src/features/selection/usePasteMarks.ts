import { parseMarkList, matchMarks, looksLikeMarks } from '../../lib/marks';
import { type useShankuModel } from '../../lib/useShankuModel';
import { isEditableTarget } from '@cad2bim/ui';
import { useState, useRef, useEffect } from 'react';

export interface PasteMarksDeps {
  inModel: (fn: () => void) => void;
  m: ReturnType<typeof useShankuModel>;
  revitLinked: boolean;
  revitSync: boolean;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  viewport: React.RefObject<import('../../components/Viewport').ViewportHandle>;
}

export function usePasteMarks(deps: PasteMarksDeps) {
  const { inModel, m, revitLinked, revitSync, setNotice, viewport } = deps;

  // ---- Paste marks to select (quick-wins B2): Ctrl + V on the model with "C1, C4, B12" copied ----
  const [marksDialog, setMarksDialog] = useState(false);
  const selectByMarks = (text: string): boolean => {
    const model = m.model;
    if (!model) return false;
    const list = parseMarkList(text);
    const r = matchMarks(model.elements, list);
    if (!r.indices.length) {
      setNotice(`None of those marks are in this model${list.length ? ` (${list.slice(0, 5).join(', ')}${list.length > 5 ? '…' : ''})` : ''}.`);
      return false;
    }
    inModel(() => {
      m.setSelection(r.indices);
      viewport.current?.fit(r.indices);
    });
    // Words from the message ("please", "check") are not marks: only report tokens that look like one.
    const missing = r.unknown.filter((u) => /^[A-Z]{1,4}-?\d{1,4}$/.test(u));
    const inRevit = revitLinked && revitSync ? ' Revit selects them too.' : '';
    setNotice(`Selected ${r.indices.length} elements for ${r.found.join(', ')}.${missing.length ? ` Not in this model: ${missing.join(', ')}.` : ''}${inRevit}`);
    return true;
  };
  const selectByMarksRef = useRef(selectByMarks);
  selectByMarksRef.current = selectByMarks;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || document.querySelector('dialog[open]')) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!looksLikeMarks(text)) return;
      if (selectByMarksRef.current(text)) e.preventDefault();
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return { marksDialog, selectByMarks, setMarksDialog };
}
