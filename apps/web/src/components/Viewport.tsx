import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ViewCube, type Orientation } from './ViewCube';
import { Viewer, type DisplayStyle, type ParsedModel, type SelectMode, type ViewName } from '@shanku/engine';
import type { SectionBoxState } from '@shanku/engine';

export interface ViewportHandle {
  fit: (indices?: number[]) => void;
  home: () => void;
  setView: (view: ViewName) => void;
  previousView: () => boolean;
  startZoomRegion: () => void;
  cancelZoomRegion: () => void;
  setSectionBox: (indices: number[] | null) => void;
  /** Revit Zoom Out (2x) and Next Pan/Zoom; can* tell the context menu what is available. */
  zoomOut2x: () => void;
  nextView: () => boolean;
  canPrevious: () => boolean;
  canNext: () => boolean;
  /** Current section box state (null when off). */
  sectionBoxState: () => SectionBoxState | null;
  /** Restores an exact section box state (undo/redo). */
  setSectionBoxState: (st: SectionBoxState | null) => void;
}

export interface ViewportProps {
  model: ParsedModel | null;
  selection: number[];
  hidden: number[];
  displayStyle: DisplayStyle;
  onPick: (index: number | null, mode: SelectMode) => void;
  onBoxSelect: (indices: number[], mode: SelectMode) => void;
  onZoomRegionEnd?: () => void;
  onSectionBoxEdit?: (before: SectionBoxState, after: SectionBoxState) => void;
  /** Visibility/Graphics overrides for the viewer. */
  overrides?: Array<{ index: number; color: [number, number, number] | null; transparency: number; halftone: boolean }>;
  /** Temporary Hide/Isolate is active (cyan frame); `hidden` also includes elements hidden by the view. */
  temporary?: boolean;
  /** Right-click in the view. */
  onContextMenu?: (clientX: number, clientY: number) => void;
  /** Graphics → Edges */
  edges?: boolean;
  /** Reveal Hidden Elements */
  reveal?: boolean;
  /** Canvas (3D background) theme, independent of the interface theme. */
  canvasTheme?: 'follow' | 'paper' | 'ink';
}

/** Hosts the engine's Viewer and keeps it in sync with React state. */
export const Viewport = forwardRef<ViewportHandle, ViewportProps>(function Viewport(props, ref) {
  const { model, selection, hidden, displayStyle } = props;
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [orientation, setOrientation] = useState<Orientation>({ x: 0, y: 0, z: 0, w: 1 });
  const [navActive, setNavActive] = useState(false);
  // Revit-like tooltip after resting on an element for a moment.
  const [tip, setTip] = useState<{ index: number; x: number; y: number } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const orientRef = useRef<Orientation>(orientation);
  const handlers = useRef(props);
  handlers.current = props;
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!host.current) return undefined;
    try {
      viewer.current = new Viewer(host.current, {
        onPick: (i, mode) => handlers.current.onPick(i, mode),
        onBoxSelect: (ids, mode) => handlers.current.onBoxSelect(ids, mode),
        onZoomRegionEnd: () => handlers.current.onZoomRegionEnd?.(),
        onSectionBoxEdit: (a, b) => handlers.current.onSectionBoxEdit?.(a, b),
        onNavigate: (active) => {
          setNavActive(active);
          if (active) setTip(null);
        },
        onHover: (index, x, y) => {
          clearTimeout(tipTimer.current);
          setTip(null);
          if (index === null || x === undefined || y === undefined) return;
          tipTimer.current = setTimeout(() => setTip({ index, x, y }), 500);
        },
        onCamera: (q) => {
          // Only re-render the ViewCube when the orientation really changed.
          const o = orientRef.current;
          if (Math.abs(o.x - q.x) + Math.abs(o.y - q.y) + Math.abs(o.z - q.z) + Math.abs(o.w - q.w) < 1e-5) return;
          orientRef.current = { x: q.x, y: q.y, z: q.z, w: q.w };
          setOrientation(orientRef.current);
        },
      });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    }
    // Test and console hook: the live viewer (read-only use).
    (window as unknown as { __shankuViewer?: unknown }).__shankuViewer = viewer.current;
    return () => {
      clearTimeout(tipTimer.current);
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);

  // Rebuild the scene only for a different file. Re-detected marks or grades give a new model object
  // with the same geometry; rebuilding then reset the camera and the section box.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => viewer.current?.setModel(model), [model?.info]);
  useEffect(() => viewer.current?.setSelection(selection), [selection, model]);
  useEffect(() => viewer.current?.setHidden(hidden), [hidden, model]);
  useEffect(() => viewer.current?.setDisplayStyle(displayStyle), [displayStyle, model]);
  useEffect(() => viewer.current?.setEdges(props.edges ?? true), [props.edges, model]);
  useEffect(() => viewer.current?.setReveal(!!props.reveal), [props.reveal, model]);
  useEffect(() => viewer.current?.setOverrides(props.overrides ?? []), [props.overrides, model]);
  useEffect(() => viewer.current?.refreshTheme(), [props.canvasTheme]);

  useImperativeHandle(ref, () => ({
    fit: (indices) => viewer.current?.fit(indices),
    zoomOut2x: () => viewer.current?.zoomOut2x(),
    nextView: () => viewer.current?.nextView() ?? false,
    canPrevious: () => viewer.current?.canGoPrevious ?? false,
    canNext: () => viewer.current?.canGoNext ?? false,
    sectionBoxState: () => viewer.current?.sectionBox ?? null,
    setSectionBoxState: (st) => viewer.current?.setSectionBoxState(st),
    home: () => viewer.current?.home(),
    setView: (v) => viewer.current?.setView(v),
    previousView: () => viewer.current?.previousView() ?? false,
    startZoomRegion: () => viewer.current?.startZoomRegion(),
    cancelZoomRegion: () => viewer.current?.cancelZoomRegion(),
    setSectionBox: (indices) => viewer.current?.setSectionBox(indices),
  }));

  if (failed) {
    return (
      <div className="app-overlay" role="alert">
        <p className="app-overlay__title">3D view unavailable</p>
        <p className="app-overlay__text">This browser could not start WebGL 2 ({failed}). Try an up-to-date Chrome or Edge with hardware acceleration on.</p>
      </div>
    );
  }
  return (
    <div ref={host} className="app-viewport" onContextMenu={(e) => { e.preventDefault(); props.onContextMenu?.(e.clientX, e.clientY); }} data-theme={props.canvasTheme && props.canvasTheme !== 'follow' ? props.canvasTheme : undefined}>
      {model ? (
        <ViewCube
          orientation={orientation}
          onLookFrom={(d) => viewer.current?.lookFrom(d)}
          onHome={() => viewer.current?.home()}
          onOrbit={(dx, dy) => viewer.current?.orbitBy(dx, dy)}
          onSetHome={(current) => viewer.current?.setHomeView(current)}
          active={navActive}
        />
      ) : null}
      {props.reveal ? <div className="app-reveal-frame" aria-hidden="true"><span>Reveal Hidden Elements</span></div> : null}
      {!props.reveal && props.temporary ? <div className="app-temp-frame" aria-hidden="true"><span>Temporary Hide/Isolate</span></div> : null}
      {tip && model?.elements[tip.index] ? (() => {
        const e = model.elements[tip.index];
        const r = host.current?.getBoundingClientRect();
        return (
          <div className="app-tip" role="tooltip" style={{ left: tip.x - (r?.left ?? 0) + 14, top: tip.y - (r?.top ?? 0) + 18 }}>
            <strong>{e.category === 'Other' ? e.ifcClass : e.category} : {e.typeName || e.name || e.ifcClass}</strong>
            <span>{[e.mark && `Mark ${e.mark}`, e.level, `ID ${e.expressId}`].filter(Boolean).join(' · ')}</span>
          </div>
        );
      })() : null}
    </div>
  );
});
