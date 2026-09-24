import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { DrawingViewer, type DrawingDisplay, type DrawingTool } from '@shanku/engine';
import type { DrawingDoc } from '../lib/useDrawings';
import { hiddenMask } from '../lib/drawingTools';

export interface DrawingViewHandle {
  fit: () => void;
  zoomTo: (x0: number, y0: number, x1: number, y1: number) => void;
  /** Zoom Previous; false when there is no earlier view. */
  previous: () => boolean;
  canPrevious: () => boolean;
  /** Zoom to these objects; false when none of them is visible. */
  zoomToObjects: (entities: number[]) => boolean;
  /** Real drawing coordinates under a client point. */
  worldAt: (clientX: number, clientY: number) => [number, number] | null;
}

export interface DrawingViewProps {
  doc: DrawingDoc;
  onCursor: (x: number, y: number) => void;
  onSelect: (entities: number[]) => void;
  canvasTheme?: 'follow' | 'paper' | 'ink';
  describe?: (entity: number) => Promise<Record<string, string | number | number[]> | null>;
  /** Grid, UCS icon and crosshair. */
  display: DrawingDisplay;
  /** Running transparent tool (Pan, Zoom, Zoom Window), or null. */
  tool: DrawingTool | null;
  onToolEnd: () => void;
  onContextMenu: (clientX: number, clientY: number) => void;
  children?: ReactNode;
}

/** One 2D view per open DXF, AutoCAD-like: grid, UCS icon, crosshair and the right-click menus. */
export const DrawingView = forwardRef<DrawingViewHandle, DrawingViewProps>(function DrawingView({ doc, onCursor, onSelect, canvasTheme, describe, display, tool, onToolEnd, onContextMenu, children }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<DrawingViewer | null>(null);
  const cursor = useRef(onCursor);
  cursor.current = onCursor;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const describeRef = useRef(describe);
  describeRef.current = describe;
  const toolEndRef = useRef(onToolEnd);
  toolEndRef.current = onToolEnd;
  const menuRef = useRef(onContextMenu);
  menuRef.current = onContextMenu;
  const displayRef = useRef(display);
  displayRef.current = display;
  // Tooltip after resting on an object: type, layer and its main size, fetched from the worker.
  const [tip, setTip] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tipFor = useRef<number | null>(null);

  useEffect(() => {
    if (!host.current) return undefined;
    const v = new DrawingViewer(host.current, {
      onCursor: (x, y) => cursor.current(x, y),
      onSelect: (e) => selectRef.current(e),
      onToolEnd: () => toolEndRef.current(),
      onContextMenu: (x, y) => {
        clearTimeout(tipTimer.current);
        tipFor.current = null;
        setTip(null);
        menuRef.current(x, y);
      },
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
    v.setDisplay(displayRef.current);
    v.setDrawing(doc.drawing);
    viewer.current = v;
    (window as unknown as { __shankuDrawing?: unknown }).__shankuDrawing = v; // test and console hook
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, [doc.drawing]);

  useEffect(() => viewer.current?.setLayerVisibility(doc.layerOn), [doc.layerOn]);
  useEffect(() => viewer.current?.setHiddenObjects(hiddenMask(doc.objects, doc.drawing.handles.length)), [doc.objects, doc.drawing]);
  useEffect(() => viewer.current?.setDisplay(display), [display]);
  useEffect(() => viewer.current?.setTool(tool), [tool]);
  // Keep the highlight in step with selection changes made outside the view (e.g. Esc).
  useEffect(() => viewer.current?.select(doc.selected?.entities ?? null), [doc.selected?.entities]);
  useEffect(() => viewer.current?.refreshTheme(), [canvasTheme]);
  useImperativeHandle(ref, () => ({
    fit: () => viewer.current?.fit(),
    zoomTo: (a, b, c, d) => viewer.current?.zoomTo(a, b, c, d),
    previous: () => viewer.current?.previousView() ?? false,
    canPrevious: () => viewer.current?.canPrevious ?? false,
    zoomToObjects: (e) => viewer.current?.zoomToObjects(e) ?? false,
    worldAt: (x, y) => viewer.current?.worldAt(x, y) ?? null,
  }));
  return (
    <div ref={host} className="app-viewport" data-theme={canvasTheme && canvasTheme !== 'follow' ? canvasTheme : undefined} onPointerLeave={() => { clearTimeout(tipTimer.current); tipFor.current = null; setTip(null); }}>
      {tip ? (
        <div className="app-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.text}</strong>
          <span>{tip.sub}</span>
        </div>
      ) : null}
      {children}
    </div>
  );
});
