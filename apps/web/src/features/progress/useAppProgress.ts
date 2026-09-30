import { fmtCount } from '../../lib/format';
import { updateTask, endTask, startTask, useTasks } from '../../lib/progress';
import { type useDrawings } from '../../lib/useDrawings';
import { type usePipeline } from '../../lib/usePipeline';
import { useEffect, useRef } from 'react';

export interface AppProgressDeps {
  bridge: import('../../lib/revitBridge').RevitBridge;
  dx: ReturnType<typeof useDrawings>;
  load: import('../../lib/useShankuModel').LoadState;
  pipeline: ReturnType<typeof usePipeline>;
}

export function useAppProgress(deps: AppProgressDeps) {
  const { bridge, dx, load, pipeline } = deps;
  // ---- Revit's own progress (Export to Revit): the rising frame fills in as Revit builds
  useEffect(
    () =>
      bridge.onProgress((p) => {
        if (p.total <= 0) return;
        const fraction = typeof p.fraction === 'number' ? p.fraction : Math.min(1, p.done / p.total);
        const busy = !!p.busy;
        updateTask('revit', {
          phase: p.phase,
          fraction,
          busy,
          detail: busy ? undefined : p.task === 'create' ? `${fmtCount(p.done)} of ${fmtCount(p.total)} elements` : `${fmtCount(p.done)} of ${fmtCount(p.total)} types tried`,
        });
      }),
    [bridge],
  );
  // ---- Long operations report to the progress store (lib/progress → BuildProgress)
  useEffect(() => {
    if (load.status !== 'loading') return void endTask('open-ifc');
    const known = load.total > 0;
    const patch = {
      title: `Opening ${load.fileName}`,
      phase: known ? 'Building the 3D geometry' : 'Reading the file and its properties',
      fraction: known ? load.done / load.total : null,
      detail: known ? `${fmtCount(load.done)} of ${fmtCount(load.total)} elements` : undefined,
    };
    if (!tasksNow().some((t) => t.id === 'open-ifc')) startTask('open-ifc', patch.title, patch.phase, patch.fraction);
    updateTask('open-ifc', patch);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dx.loading) return void endTask('open-dxf');
    if (!tasksNow().some((t) => t.id === 'open-dxf')) startTask('open-dxf', `Opening ${dx.loading.name}`, dx.loading.phase);
    else updateTask('open-dxf', { phase: dx.loading.phase });
  }, [dx.loading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const phase = pipeline.state?.phase;
    if (!phase) return void endTask('dxf-3d');
    const title = `DXF → 3D${pipeline.state?.fileName ? `: ${pipeline.state.fileName}` : ''}`;
    if (!tasksNow().some((t) => t.id === 'dxf-3d')) startTask('dxf-3d', title, phase);
    else updateTask('dxf-3d', { title, phase });
  }, [pipeline.state?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const tasks = useTasks();
  const tasksNow = () => tasksRef.current;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  return { tasks };
}
