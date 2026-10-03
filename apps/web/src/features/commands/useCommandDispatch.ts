import { type CommandId } from '../../lib/shortcuts';
import { type useDrawings } from '../../lib/useDrawings';
import { type useHistory } from '../../lib/useHistory';
import { type useShankuModel } from '../../lib/useShankuModel';
import { isTwoD } from '../../lib/views';
import { useShortcut } from '@cad2bim/ui';
import { useCallback, useEffect } from 'react';

/** Values App declares after this feature: read through a ref, in callbacks and effects only. */
export interface CommandDispatchLate {
  dxtRef: React.MutableRefObject<{ display: import('../../../../../packages/engine/src/render/DrawingViewer').DrawingDisplay; setDisplay: (patch: Partial<import('../../../../../packages/engine/src/render/DrawingViewer').DrawingDisplay>) => void; tool: import('../../../../../packages/engine/src/render/DrawingViewer').DrawingTool | null; setTool: React.Dispatch<React.SetStateAction<import('../../../../../packages/engine/src/render/DrawingViewer').DrawingTool | null>>; menu: { x: number; y: number; point: [number, number] | null; } | null; openMenu: (x: number, y: number) => void; closeMenu: () => void; menuItems: () => import('../../lib/menu').MenuItem[]; act: (a: import('../../lib/drawingMenu').DrawingAction, point?: [number, number] | null) => void; quickProperties: boolean; setQuickProperties: (on: boolean) => void; quickSelectOpen: boolean; setQuickSelectOpen: React.Dispatch<React.SetStateAction<boolean>>; findOpen: boolean; setFindOpen: React.Dispatch<React.SetStateAction<boolean>>; index: import('../../../../../packages/engine/src/dxf/entityIndex').EntityIndex | null; visible: number[]; visibleSet: Set<number>; selectObjects: (entities: number[], zoom?: boolean) => void; commands: () => import('../../lib/commands').AppCommand[]; } | null>;
  openGeom: (mode: "move" | "rotate") => void;
  /** Revit's Modify commands (native, or for Revit-linked models the Changes for Revit route). */
  modifyCmd: (cmd: 'move' | 'copy' | 'rotate' | 'mirror' | 'array' | 'offset' | 'delete' | 'pin' | 'unpin' | 'levels' | 'grid' | 'refplane' | 'units' | 'align') => void;
  activeModelView: import('../../lib/views').ModelView | null;
  cancelSection: () => void;
  deleteDimensions: (ids: string[]) => void;
}

export interface CommandDispatchDeps {
  activeDoc: import('../../lib/useDrawings').DrawingDoc | null;
  activeView: string;
  annSel: string[];
  curSelection: React.MutableRefObject<number[]>;
  dimSel: string[];
  drawingView: React.RefObject<import('../../components/DrawingView').DrawingViewHandle>;
  dx: ReturnType<typeof useDrawings>;
  history: ReturnType<typeof useHistory>;
  m: ReturnType<typeof useShankuModel>;
  prevSelection: React.MutableRefObject<number[]>;
  sectionBox: boolean;
  sectionTool: boolean;
  setAnnSel: React.Dispatch<React.SetStateAction<string[]>>;
  setDimSel: React.Dispatch<React.SetStateAction<string[]>>;
  setDimTool: (next: import('../../../../../packages/engine/src/render/dimensions').DimensionKind | null) => void;
  setDisplayStyle: React.Dispatch<React.SetStateAction<import('../../../../../packages/engine/src/render/Viewer').DisplayStyle>>;
  setHidden: React.Dispatch<React.SetStateAction<number[]>>;
  setMeasure: (next: import('../../../../../packages/engine/src/render/measureTool').MeasureMode | ((cur: import('../../../../../packages/engine/src/render/measureTool').MeasureMode | null) => import('../../../../../packages/engine/src/render/measureTool').MeasureMode | null) | null) => void;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setOpenViews: React.Dispatch<React.SetStateAction<string[]>>;
  setReveal: React.Dispatch<React.SetStateAction<boolean>>;
  setSectionBox: React.Dispatch<React.SetStateAction<boolean>>;
  setVgOpen: React.Dispatch<React.SetStateAction<{ focus?: string | undefined; } | null>>;
  setViews: React.Dispatch<React.SetStateAction<import('../../lib/views').ModelView[]>>;
  setZoomRegion: React.Dispatch<React.SetStateAction<boolean>>;
  viewport: React.RefObject<import('../../components/Viewport').ViewportHandle>;
  viewsRef: React.MutableRefObject<import('../../lib/views').ModelView[]>;
  zoomRegion: boolean;
  late: { current: CommandDispatchLate };
}

export function useCommandDispatch(deps: CommandDispatchDeps) {
  const { activeDoc, activeView, annSel, curSelection, dimSel, drawingView, dx, history, m, prevSelection, sectionBox, sectionTool, setAnnSel, setDimSel, setDimTool, setDisplayStyle, setHidden, setMeasure, setNotice, setOpenViews, setReveal, setSectionBox, setVgOpen, setViews, setZoomRegion, viewport, viewsRef, zoomRegion, late } = deps;

  // Revit commands (two-letter sequences, Home, Esc).
  const runCommand = useCallback(
    (cmd: CommandId) => {
      if (activeDoc) {
        if (cmd === 'fit') drawingView.current?.fit();
        else if (cmd === 'previous') late.current.dxtRef.current?.act('zoomPrevious');
        else if (cmd === 'zoomRegion') late.current.dxtRef.current?.act('zoomWindow');
        else setNotice('That command works in 3D views.');
        return;
      }
      const v = viewport.current;
      const model = m.model;
      if (!v || !model) return;
      const sel = m.selection;
      const needSelection = () => {
        setNotice('Select one or more elements first.');
        return false;
      };
      switch (cmd) {
        case 'fit':
          return v.fit();
        case 'previous':
          if (!v.previousView()) setNotice('No previous view.');
          return;
        case 'zoomRegion':
          setZoomRegion(true);
          return v.startZoomRegion();
        case 'hideElement': {
          if (!sel.length) return void needSelection();
          setHidden((h) => [...new Set([...h, ...sel])]);
          return m.setSelection([]);
        }
        case 'isolateElement': {
          if (!sel.length) return void needSelection();
          const keep = new Set(sel);
          return setHidden(model.elements.filter((e) => !keep.has(e.index)).map((e) => e.index));
        }
        case 'isolateCategory': {
          if (!sel.length) return void needSelection();
          const cats = new Set(sel.map((i) => model.elements[i].category));
          return setHidden(model.elements.filter((e) => !cats.has(e.category)).map((e) => e.index));
        }
        case 'hideCategory': {
          if (!sel.length) return void needSelection();
          const cats = new Set(sel.map((i) => model.elements[i].category));
          setHidden((h) => [...new Set([...h, ...model.elements.filter((e) => cats.has(e.category)).map((e) => e.index)])]);
          return m.setSelection([]);
        }
        case 'visibilityGraphics':
          return setVgOpen({});
        case 'revealHidden':
          return setReveal((r) => !r);
        case 'unhideElement': {
          if (!sel.length) return void needSelection();
          const drop = new Set(sel);
          return setHidden((h) => h.filter((i) => !drop.has(i)));
        }
        case 'resetHidden':
          return setHidden([]);
        case 'measure':
          if (!model) return setNotice('Open a model to measure it.');
          return setMeasure((cur) => (cur ? null : 'distance'));
        case 'dimAligned':
        case 'spotElevation':
          if (!model) return setNotice('Open a model to dimension it.');
          return setDimTool(cmd === 'dimAligned' ? 'aligned' : 'spotElevation');
        case 'moveTool':
          return late.current.modifyCmd('move');
        case 'rotateTool':
          return late.current.modifyCmd('rotate');
        case 'copyTool':
          return late.current.modifyCmd('copy');
        case 'mirrorTool':
          return late.current.modifyCmd('mirror');
        case 'arrayTool':
          return late.current.modifyCmd('array');
        case 'offsetTool':
          return late.current.modifyCmd('offset');
        case 'deleteTool':
          return late.current.modifyCmd('delete');
        case 'pinTool':
          return late.current.modifyCmd('pin');
        case 'unpinTool':
          return late.current.modifyCmd('unpin');
        case 'levelsTool':
          return late.current.modifyCmd('levels');
        case 'gridTool':
          return late.current.modifyCmd('grid');
        case 'alignTool':
          return late.current.modifyCmd('align');
        case 'refPlaneTool':
          return late.current.modifyCmd('refplane');
        case 'unitsTool':
          return late.current.modifyCmd('units');
        case 'sectionBox': {
          if (isTwoD(late.current.activeModelView ?? undefined)) return setNotice('Section boxes are for 3D views; plans and sections have a view range (Properties).');
          if (!sectionBox && !sel.length) return void needSelection();
          const before = v.sectionBoxState();
          if (sectionBox) v.setSectionBox(null);
          else v.setSectionBox(sel);
          const after = v.sectionBoxState();
          // Revit records section box changes as undoable view edits
          history.run(sectionBox ? 'Remove section box' : 'Section box', (t) =>
            t.change('section-box', before, after, (st) => {
              viewport.current?.setSectionBoxState(st);
              setSectionBox(st !== null);
            }),
          );
          return sectionBox ? undefined : v.fit(sel);
        }
        case 'wireframe':
          return setDisplayStyle('wireframe');
        case 'hiddenLine':
          return setDisplayStyle('hiddenLine');
        case 'shaded':
          return setDisplayStyle('shaded');
        case 'consistent':
          return setDisplayStyle('consistent');
      }
    },
    [m, sectionBox, activeDoc],
  );

  useShortcut({ code: 'Escape' }, () => {
    if (sectionTool) return late.current.cancelSection();
    if (annSel.length) setAnnSel([]);
    if (dimSel.length) setDimSel([]);
    if (activeDoc) dx.select(activeDoc.id, null);
    else if (zoomRegion) viewport.current?.cancelZoomRegion();
    else m.setSelection([]);
  });
  useEffect(() => {
    if (curSelection.current.length && curSelection.current.join() !== m.selection.join()) prevSelection.current = curSelection.current;
    curSelection.current = m.selection;
  }, [m.selection]);

  // Delete: selected sections go with their views (Revit), as one undoable step.
  useShortcut({ code: 'Delete' }, () => {
    if (dimSel.length && activeView) {
      late.current.deleteDimensions(dimSel);
      return;
    }
    const ids = annSel.filter((id) => id.startsWith('section:'));
    if (!ids.length) return;
    const before = viewsRef.current, after = before.filter((v) => !ids.includes(v.id));
    history.run(ids.length > 1 ? `Delete ${ids.length} sections` : `Delete ${before.find((v) => v.id === ids[0])?.name ?? 'section'}`, (tx) => tx.change('views', before, after, setViews));
    setOpenViews((o) => o.filter((x) => !ids.includes(x)));
    setAnnSel([]);
  });

  // Errors outside a redraw (click handlers, promises) do not blank the page, but should not vanish:
  // they go to the Activity panel with their message.
  useEffect(() => {
    const onError = (e: ErrorEvent) => m.log(`Error: ${e.message}`, 'error');
    const onRejection = (e: PromiseRejectionEvent) => m.log(`Error: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`, 'error');
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { runCommand };
}
