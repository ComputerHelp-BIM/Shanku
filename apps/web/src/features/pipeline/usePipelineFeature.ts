import { type useDrawings } from '../../lib/useDrawings';
import { usePipeline, qaFocus } from '../../lib/usePipeline';
import { type useShankuModel } from '../../lib/useShankuModel';
import { type PipelineQa } from '@shanku/engine';
import { useCallback } from 'react';

export interface PipelineFeatureDeps {
  drawingView: React.RefObject<import('../../components/DrawingView').DrawingViewHandle>;
  dx: ReturnType<typeof useDrawings>;
  m: ReturnType<typeof useShankuModel>;
  setActiveView: React.Dispatch<React.SetStateAction<string>>;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  toggleWin: (k: "keys" | "revit" | "boq" | "pipeline" | "guide" | "changes" | "typeProps" | "exportRevit" | "editGeom", v?: boolean | undefined) => void;
}

export function usePipelineFeature(deps: PipelineFeatureDeps) {
  const { drawingView, dx, m, setActiveView, setNotice, toggleWin } = deps;

  // ---- DXF -> 3D pipeline
  const pipeline = usePipeline({
    getClient: dx.getClient,
    openDrawing: dx.open,
    openModel: async (f) => {
      await m.open(f);
      setActiveView('3d');
    },
    log: m.log,
    showWindow: () => toggleWin('pipeline', true),
  });
  const pipe = pipeline.state;

  const showQa = useCallback(
    (q: PipelineQa) => {
      const doc = dx.docs.find((d) => d.name === pipe?.fileName);
      if (!doc) return setNotice('The drawing is still opening in 2D; try again in a moment.');
      setActiveView(doc.id);
      const b = qaFocus(q);
      if (b) setTimeout(() => drawingView.current?.zoomTo(b[0], b[1], b[2], b[3]), 80);
    },
    [dx.docs, pipe?.fileName],
  );

  return { pipe, pipeline, showQa };
}
