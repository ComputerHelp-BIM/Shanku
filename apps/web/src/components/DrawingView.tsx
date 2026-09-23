import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { DrawingViewer } from '@shanku/engine';
import type { DrawingDoc } from '../lib/useDrawings';

export interface DrawingViewHandle {
  fit: () => void;
  zoomTo: (x0: number, y0: number, x1: number, y1: number) => void;
}

/** One 2D view per open DXF. */
export const DrawingView = forwardRef<DrawingViewHandle, { doc: DrawingDoc; onCursor: (x: number, y: number) => void; onSelect: (entities: number[]) => void; canvasTheme?: 'follow' | 'paper' | 'ink'; describe?: (entity: number) => Promise<Record<string, string | number | number[]> | null> }>(function DrawingView({ doc, onCursor, onSelect, canvasTheme, describe }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<DrawingViewer | null>(null);
  const cursor = useRef(onCursor);
  cursor.current = onCursor;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const describeRef = useRef(describe);
  describeRef.current = describe;
  // Tooltip after resting on an object: type, layer and its main size, fetched from the worker.
  const [tip, setTip] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tipFor = useRef<number | null>(null);

  useEffect(() => {
    if (!host.current) return undefined;
    const v = new DrawingViewer(host.current, {
      onCursor: (x, y) => cursor.current(x, y),
      onSelect: (e) => selectRef.current(e),
      onHover: (entity, x, y) => {
        if (entity === tipFor.current && entity !== null) return;
        tipFor.current = entity;
        clearTimeout(tipTimer.current);
        setTip(null);
        if (entity === null || !describeRef.current) return;
        tipTimer.current = setTimeout(async () => {
          const p = await describeRef.current?.(entity);
          if (!p || tipFor.current !== entity) return;
          const size = p.Area !== undefined ? `Area ${Number(p.Area).toLocaleString('en-IN')}` : p.Length !== undefined ? `Length ${Number(p.Length).toLocaleString('en-IN')}` : p.Radius !== undefined ? `Radius ${p.Radius}` : p.Contents !== undefined ? `“${String(p.Contents).slice(0, 40)}”` : '';
          const r = host.current?.getBoundingClientRect();
          setTip({ x: x - (r?.left ?? 0) + 14, y: y - (r?.top ?? 0) + 18, text: `${p.Type} · ${p.Layer}`, sub: [size, `Handle ${p.Handle}`].filter(Boolean).join(' · ') });
        }, 500);
      },
    });
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
  useEffect(() => viewer.current?.select(doc.selected?.entities ?? null), [doc.selected?.entities]);
  useEffect(() => viewer.current?.refreshTheme(), [canvasTheme]);
  useImperativeHandle(ref, () => ({ fit: () => viewer.current?.fit(), zoomTo: (a, b, c, d) => viewer.current?.zoomTo(a, b, c, d) }));
  return (
    <div ref={host} className="app-viewport" data-theme={canvasTheme && canvasTheme !== 'follow' ? canvasTheme : undefined} onPointerLeave={() => { clearTimeout(tipTimer.current); tipFor.current = null; setTip(null); }}>
      {tip ? (
        <div className="app-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.text}</strong>
          <span>{tip.sub}</span>
        </div>
      ) : null}
    </div>
  );
});
