import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { DrawingViewer } from '@shanku/engine';
import type { DrawingDoc } from '../lib/useDrawings';

export interface DrawingViewHandle {
  fit: () => void;
  zoomTo: (x0: number, y0: number, x1: number, y1: number) => void;
}

/** One 2D view per open DXF. */
export const DrawingView = forwardRef<DrawingViewHandle, { doc: DrawingDoc; onCursor: (x: number, y: number) => void }>(function DrawingView({ doc, onCursor }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<DrawingViewer | null>(null);
  const cursor = useRef(onCursor);
  cursor.current = onCursor;

  useEffect(() => {
    if (!host.current) return undefined;
    const v = new DrawingViewer(host.current, { onCursor: (x, y) => cursor.current(x, y) });
    v.setDrawing(doc.drawing);
    viewer.current = v;
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, [doc.drawing]);

  useEffect(() => viewer.current?.setLayerVisibility(doc.layerOn), [doc.layerOn]);
  useImperativeHandle(ref, () => ({ fit: () => viewer.current?.fit(), zoomTo: (a, b, c, d) => viewer.current?.zoomTo(a, b, c, d) }));
  return <div ref={host} className="app-viewport" />;
});
