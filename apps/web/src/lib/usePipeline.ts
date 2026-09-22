import { useCallback, useRef, useState } from 'react';
import type { DxfClient, PipelineQa } from '@shanku/engine';
import type { PipelineState } from '../components/PipelinePanel';
import { downloadFile } from './excel';
import { pickFile, type PickedFile } from './openFile';

interface Deps {
  getClient: () => DxfClient;
  /** Opens the drawing in a 2D tab (for "Show"). */
  openDrawing: (file: PickedFile) => Promise<unknown>;
  /** Opens the built IFC as the model. */
  openModel: (file: PickedFile) => Promise<unknown>;
  log: (text: string, tone?: 'info' | 'error') => void;
  /** The review window: show it. */
  showWindow: () => void;
}

/** DXF -> 3D: pick, analyse, edit level names and heights, build, download. */
export function usePipeline({ getClient, openDrawing, openModel, log, showWindow }: Deps) {
  const [state, setState] = useState<PipelineState | null>(null);
  const ifcText = useRef('');
  const patch = (p: Partial<PipelineState>) => setState((s) => (s ? { ...s, ...p } : s));

  const start = useCallback(async () => {
    let file: PickedFile | null = null;
    try {
      file = await pickFile('dxf');
    } catch (e) {
      log(e instanceof Error ? e.message : String(e), 'error');
    }
    if (!file) return;
    const forDrawing = file.bytes.slice(0); // the pipeline call transfers the original buffer
    showWindow();
    ifcText.current = '';
    setState({ fileName: file.name, summary: null, names: {}, heights: {}, phase: 'Starting Python (first time about 15 MB)…', built: null, error: null });
    try {
      const { summary } = await getClient().pipeline({}, { fileName: file.name, bytes: file.bytes }, (t) => patch({ phase: t }));
      patch({ summary, phase: null });
      log(`DXF → 3D read ${file.name}: ${summary.levels.length} levels, ${summary.counts.reduce((n, c) => n + c.count, 0).toLocaleString('en-IN')} elements, ${summary.qa.length} checks.`);
      void openDrawing({ name: file.name, bytes: forDrawing }).catch(() => undefined);
    } catch (e) {
      patch({ phase: null, error: e instanceof Error ? e.message : String(e) });
    }
  }, [getClient, log, openDrawing, showWindow]);

  const build = useCallback(async () => {
    if (!state?.summary) return;
    const base = state.fileName.replace(/\.dxf$/i, '');
    patch({ phase: 'Building the 3D model…', error: null });
    try {
      const { summary, ifc } = await getClient().pipeline({ build: true, names: state.names, heights: state.heights, project: base, source: state.fileName });
      ifcText.current = ifc;
      const ifcName = `${base}.ifc`;
      await openModel({ name: ifcName, bytes: new TextEncoder().encode(ifc).buffer as ArrayBuffer });
      patch({ summary, phase: null, built: { ifcName, elements: summary.report?.elements ?? 0, openings: summary.report?.openings ?? 0 } });
    } catch (e) {
      patch({ phase: null, error: e instanceof Error ? e.message : String(e) });
    }
  }, [getClient, openModel, state]);

  const download = useCallback(() => {
    if (state?.built) downloadFile(new TextEncoder().encode(ifcText.current).buffer as ArrayBuffer, state.built.ifcName, 'application/x-step');
  }, [state]);

  const setName = (n: number, name: string) => setState((s) => (s ? { ...s, names: { ...s.names, [n]: name } } : s));
  const setHeight = (n: number, h: number) => setState((s) => (s ? { ...s, heights: { ...s.heights, [n]: h } } : s));

  return { state, start, build, download, setName, setHeight };
}

/** The rectangle to zoom to for a check (its bounds, or a box around its point). */
export function qaFocus(q: PipelineQa): [number, number, number, number] | null {
  return q.bounds ?? (q.at ? [q.at[0] - 800, q.at[1] - 800, q.at[0] + 800, q.at[1] + 800] : null);
}
