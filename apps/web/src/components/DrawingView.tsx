import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { DrawingViewer } from '@shanku/engine';
import type { DrawingDoc } from '../lib/useDrawings';

export interface DrawingViewHandle {
  fit: () => void;
  zoomTo: (x0: number, y0: number, x1: number, y1: number) => void;
}

/** One 2D view per open DXF. */
export const DrawingView = forwardRef<DrawingViewHandle, { doc: DrawingDoc; onCursor: (x: number, y: number) => void; onSelect: (entity: number | null) => void }>(function DrawingView({ doc, onCursor, onSelect }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<DrawingViewer | null>(null);
  const cursor = useRef(onCursor);
  cursor.current = onCursor;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!host.current) return undefined;
    const v = new DrawingViewer(host.current, { onCursor: (x, y) => cursor.current(x, y), onSelect: (e) => selectRef.current(e) });
    v.setDrawing(doc.drawing);
    viewer.current = v;
    (window as unknown as { __shankuDrawing?: unknown }).__shankuDrawing = v; // test and console hook
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, [doc.drawing]);

  useEffect(() => viewer.current?.setLayerVisibility(doc.layerOn), [doc.layerOn]);
  // Keep the highlight in step with selection changes made outside the view (e.g. Esc).
  useEffect(() => viewer.current?.select(doc.selected?.entity ?? null), [doc.selected?.entity]);
  useImperativeHandle(ref, () => ({ fit: () => viewer.current?.fit(), zoomTo: (a, b, c, d) => viewer.current?.zoomTo(a, b, c, d) }));
  return <div ref={host} className="app-viewport" />;
});
