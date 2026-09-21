import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Viewer, type DisplayStyle, type ParsedModel, type SelectMode, type ViewName } from '@shanku/engine';

export interface ViewportHandle {
  fit: (indices?: number[]) => void;
  home: () => void;
  setView: (view: ViewName) => void;
  previousView: () => boolean;
  startZoomRegion: () => void;
  cancelZoomRegion: () => void;
  setSectionBox: (indices: number[] | null) => void;
}

export interface ViewportProps {
  model: ParsedModel | null;
  selection: number[];
  hidden: number[];
  displayStyle: DisplayStyle;
  onPick: (index: number | null, mode: SelectMode) => void;
  onBoxSelect: (indices: number[], mode: SelectMode) => void;
  onZoomRegionEnd?: () => void;
}

/** Hosts the engine's Viewer and keeps it in sync with React state. */
export const Viewport = forwardRef<ViewportHandle, ViewportProps>(function Viewport(props, ref) {
  const { model, selection, hidden, displayStyle } = props;
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
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
      });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    }
    return () => {
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => viewer.current?.setModel(model), [model]);
  useEffect(() => viewer.current?.setSelection(selection), [selection, model]);
  useEffect(() => viewer.current?.setHidden(hidden), [hidden, model]);
  useEffect(() => viewer.current?.setDisplayStyle(displayStyle), [displayStyle, model]);

  useImperativeHandle(ref, () => ({
    fit: (indices) => viewer.current?.fit(indices),
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
  return <div ref={host} className="app-viewport" />;
});
