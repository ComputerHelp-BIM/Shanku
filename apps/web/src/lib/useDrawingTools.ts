import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { DEFAULT_DRAWING_DISPLAY, indexEntities, type CrosshairSize, type DrawingDisplay, type DrawingTool, type History } from '@shanku/engine';
import type { DrawingViewHandle } from '../components/DrawingView';
import type { AppCommand } from './commands';
import { drawingMenu, type DrawingAction } from './drawingMenu';
import { countObjects, formatPoint, nextObjectVisibility, propsAsText, selectSimilar, visibleObjects, type ObjectVisibility } from './drawingTools';
import type { MenuItem } from './menu';
import type { DrawingDoc } from './useDrawings';

const DISPLAY_KEY = 'shanku.dxf.display';
const QP_KEY = 'shanku.dxf.quickProperties';

function loadDisplay(): DrawingDisplay {
  try {
    const v = JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? 'null') as Partial<DrawingDisplay> | null;
    if (!v || typeof v !== 'object') return DEFAULT_DRAWING_DISPLAY;
    return {
      grid: typeof v.grid === 'boolean' ? v.grid : DEFAULT_DRAWING_DISPLAY.grid,
      ucsIcon: typeof v.ucsIcon === 'boolean' ? v.ucsIcon : DEFAULT_DRAWING_DISPLAY.ucsIcon,
      crosshair: v.crosshair === 'off' || v.crosshair === 'small' || v.crosshair === 'full' ? v.crosshair : DEFAULT_DRAWING_DISPLAY.crosshair,
    };
  } catch {
    return DEFAULT_DRAWING_DISPLAY;
  }
}

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the setting lasts for this visit */
  }
}

/** Repeat names, as AutoCAD shows them ("Repeat ZOOM"). */
const REPEAT_LABEL: Partial<Record<DrawingAction, string>> = {
  isolate: 'Isolate Objects',
  hide: 'Hide Objects',
  endIsolation: 'End Object Isolation',
  pan: 'Pan',
  zoom: 'Zoom',
  zoomWindow: 'Zoom Window',
  zoomPrevious: 'Zoom Previous',
  zoomExtents: 'Zoom Extents',
  zoomSelection: 'Zoom to Selection',
  selectSimilar: 'Select Similar',
  quickSelect: 'Quick Select',
  count: 'Count',
  find: 'Find',
};

export interface DrawingToolsDeps {
  doc: DrawingDoc | null;
  view: RefObject<DrawingViewHandle | null>;
  select: (docId: string, entities: number[] | null) => void;
  update: (docId: string, patch: Partial<Pick<DrawingDoc, 'objects'>>) => void;
  history: History;
  undo: () => void;
  redo: () => void;
  notify: (text: string) => void;
  log: (text: string) => void;
  /** Dock panels: Properties ('properties') and Layers ('browser' while a drawing is active). */
  panelOpen: (id: 'properties' | 'browser') => boolean;
  togglePanel: (id: 'properties' | 'browser') => void;
}

/**
 * The AutoCAD layer of the 2D view: grid, UCS icon and crosshair settings, the transparent view tools,
 * object isolation (undoable), the two right-click menus, Quick Select, Find, Count and Quick Properties.
 * App.tsx places the pieces; the behaviour lives here so it stays out of the 3D code.
 */
export function useDrawingTools(deps: DrawingToolsDeps) {
  const { doc } = deps;
  const d = useRef(deps);
  d.current = deps;
  const [display, setDisplayState] = useState<DrawingDisplay>(loadDisplay);
  const [tool, setTool] = useState<DrawingTool | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; point: [number, number] | null } | null>(null);
  const [last, setLast] = useState<DrawingAction | null>(null);
  const [quickProperties, setQp] = useState<boolean>(() => {
    try {
      return localStorage.getItem(QP_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [quickSelectOpen, setQuickSelectOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  const setDisplay = useCallback((patch: Partial<DrawingDisplay>) => {
    setDisplayState((cur) => {
      const next = { ...cur, ...patch };
      store(DISPLAY_KEY, next);
      return next;
    });
  }, []);
  const setQuickProperties = useCallback((on: boolean) => {
    setQp(on);
    store(QP_KEY, on);
  }, []);

  const drawing = doc?.drawing ?? null;
  const index = useMemo(() => (drawing ? indexEntities(drawing) : null), [drawing]);
  const visible = useMemo(() => (index && doc ? visibleObjects(index, doc.layerOn, doc.objects) : []), [index, doc?.layerOn, doc?.objects]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleSet = useMemo(() => new Set(visible), [visible]);
  const selection = doc?.selected?.entities ?? [];

  /** Selects objects in the active drawing and, optionally, zooms to them. */
  const selectObjects = useCallback((entities: number[], zoom = false) => {
    const cur = d.current;
    if (!cur.doc) return;
    cur.select(cur.doc.id, entities.length ? entities : null);
    if (zoom && entities.length) cur.view.current?.zoomToObjects(entities);
  }, []);

  const setObjects = (action: 'isolate' | 'hide' | 'endIsolation') => {
    const cur = d.current;
    if (!cur.doc) return;
    const id = cur.doc.id;
    const before: ObjectVisibility | null = cur.doc.objects;
    const after = nextObjectVisibility(before, action === 'endIsolation' ? 'end' : action, cur.doc.selected?.entities ?? []);
    if (after === before) return;
    const n = cur.doc.selected?.entities.length ?? 0;
    const name = action === 'isolate' ? `Isolate ${n} ${n === 1 ? 'object' : 'objects'}` : action === 'hide' ? `Hide ${n} ${n === 1 ? 'object' : 'objects'}` : 'End object isolation';
    cur.history.run(name, (t) => t.change(`dxf-objects:${id}`, before, after, (v) => cur.update(id, { objects: v })));
    if (action !== 'endIsolation') cur.select(id, null); // AutoCAD drops the selection once objects are isolated or hidden
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      d.current.notify(`Copied ${what} to the clipboard.`);
    } catch {
      d.current.notify('The browser did not allow copying. Select the text in Properties and press Ctrl + C.');
    }
  };

  const act = (a: DrawingAction, point: [number, number] | null = null): void => {
    const cur = d.current;
    const v = cur.view.current;
    const docNow = cur.doc;
    if (!docNow || !index) return;
    const sel = docNow.selected?.entities ?? [];
    if (a !== 'repeat' && REPEAT_LABEL[a]) setLast(a);
    switch (a) {
      case 'repeat':
        if (last) act(last, point);
        return;
      case 'copyPoint':
        if (point) void copy(formatPoint(point[0], point[1]), 'the point coordinates');
        return;
      case 'copyProps':
        if (docNow.selected?.props) void copy(propsAsText(docNow.selected.props), sel.length > 1 ? 'the first object’s properties' : 'the properties');
        else cur.notify('Properties are still loading. Try again in a moment.');
        return;
      case 'copyHandles':
        void copy(sel.map((e) => docNow.drawing.handles[e]).join('\n'), sel.length === 1 ? 'the handle' : `${sel.length} handles`);
        return;
      case 'isolate':
      case 'hide':
      case 'endIsolation':
        return setObjects(a);
      case 'undo':
        return cur.undo();
      case 'redo':
        return cur.redo();
      case 'pan':
      case 'zoom':
      case 'zoomWindow':
        setTool(a);
        cur.notify(a === 'zoomWindow' ? 'Zoom Window: drag a rectangle. Esc cancels.' : `${a === 'pan' ? 'Pan: drag to move the drawing' : 'Zoom: drag up to zoom in, down to zoom out'}. Esc, Enter or right-click ends.`);
        return;
      case 'zoomPrevious':
        if (!v?.previous()) cur.notify('No previous view.');
        return;
      case 'zoomExtents':
        return v?.fit();
      case 'zoomSelection':
        if (!v?.zoomToObjects(sel)) cur.notify('The selection is not visible.');
        return;
      case 'selectSimilar': {
        const next = selectSimilar(docNow.drawing.types, index, sel, visible);
        selectObjects(next);
        cur.notify(`Select Similar: ${next.length.toLocaleString('en-IN')} objects with the same type, layer and colour.`);
        return;
      }
      case 'deselectAll':
        return cur.select(docNow.id, null);
      case 'quickSelect':
        return setQuickSelectOpen(true);
      case 'find':
        return setFindOpen(true);
      case 'count': {
        const c = countObjects(docNow.drawing.types, index, sel.length ? sel : visible);
        const top = c.byType.slice(0, 6).map(([t, n]) => `${n.toLocaleString('en-IN')} ${t}`).join(', ');
        const more = c.byType.length > 6 ? ` and ${c.byType.length - 6} more types` : '';
        const text = `${sel.length ? 'Selection' : 'Visible objects'}: ${c.total.toLocaleString('en-IN')} on ${c.layers} ${c.layers === 1 ? 'layer' : 'layers'} (${top}${more}).`;
        cur.log(`Count in ${docNow.name}. ${text}`);
        cur.notify(text);
        return;
      }
      case 'properties':
        return cur.togglePanel('properties');
      case 'layers':
        return cur.togglePanel('browser');
      case 'quickProperties':
        return setQuickProperties(!quickProperties);
      case 'grid':
        return setDisplay({ grid: !display.grid });
      case 'ucsIcon':
        return setDisplay({ ucsIcon: !display.ucsIcon });
      default:
        if (a.startsWith('crosshair:')) setDisplay({ crosshair: a.slice('crosshair:'.length) as CrosshairSize });
    }
  };

  const openMenu = (x: number, y: number) => setMenu({ x, y, point: d.current.view.current?.worldAt(x, y) ?? null });

  const menuItems = (): MenuItem[] => {
    const cur = d.current;
    return drawingMenu(
      {
        selectionCount: selection.length,
        last: last ? REPEAT_LABEL[last] ?? null : null,
        isolated: !!doc?.objects,
        undo: cur.history.canUndo ? cur.history.undoList[0] ?? null : null,
        redo: cur.history.canRedo ? cur.history.redoList[0] ?? null : null,
        canPrevious: cur.view.current?.canPrevious() ?? false,
        display,
        quickProperties,
        propertiesOpen: cur.panelOpen('properties'),
        layersOpen: cur.panelOpen('browser'),
      },
      (a) => act(a, menu?.point ?? null),
    );
  };

  /** The same actions in the command palette (Ctrl + K), greyed out without a drawing. */
  const commands = (): AppCommand[] => {
    const has = !!doc;
    const hasSel = selection.length > 0;
    const why = has ? undefined : 'open a DXF drawing';
    const whySel = !has ? 'open a DXF drawing' : hasSel ? undefined : 'select objects first';
    const c = (id: string, title: string, group: AppCommand['group'], a: DrawingAction, extra: Partial<AppCommand> = {}, needSel = false): AppCommand => ({
      id: `dxf.${id}`,
      title,
      group,
      enabled: (needSel ? whySel : why) === undefined,
      why: needSel ? whySel : why,
      keywords: 'dxf drawing 2d autocad',
      run: () => act(a),
      ...extra,
    });
    return [
      c('grid', 'Drawing grid', 'View', 'grid', { keys: 'F7', checked: display.grid, keywords: 'dxf autocad gridmode' }),
      c('ucsIcon', 'Drawing UCS icon', 'View', 'ucsIcon', { checked: display.ucsIcon, keywords: 'dxf autocad origin axes' }),
      c('crosshairSmall', 'Crosshair: small', 'View', 'crosshair:small', { checked: display.crosshair === 'small', keywords: 'dxf autocad cursor cursorsize' }),
      c('crosshairFull', 'Crosshair: full screen', 'View', 'crosshair:full', { checked: display.crosshair === 'full', keywords: 'dxf autocad cursor cursorsize' }),
      c('crosshairOff', 'Crosshair: off (arrow)', 'View', 'crosshair:off', { checked: display.crosshair === 'off', keywords: 'dxf autocad cursor pointer' }),
      c('pan', 'Pan (drag to move the drawing)', 'View', 'pan', { keywords: 'dxf autocad realtime hand' }),
      c('zoom', 'Zoom (drag up or down)', 'View', 'zoom', { keywords: 'dxf autocad realtime' }),
      c('zoomWindow', 'Zoom window', 'View', 'zoomWindow', { keys: 'ZR', keywords: 'dxf autocad region rectangle' }),
      c('zoomPrevious', 'Zoom previous', 'View', 'zoomPrevious', { keys: 'ZP', keywords: 'dxf autocad back' }),
      c('zoomSelection', 'Zoom to selection', 'View', 'zoomSelection', {}, true),
      c('isolate', 'Isolate objects', 'Visibility', 'isolate', { keywords: 'dxf autocad isolateobjects' }, true),
      c('hide', 'Hide objects', 'Visibility', 'hide', { keywords: 'dxf autocad hideobjects' }, true),
      c('endIsolation', 'End object isolation', 'Visibility', 'endIsolation', { enabled: !!doc?.objects, why: !has ? why : doc?.objects ? undefined : 'nothing is isolated or hidden', keywords: 'dxf autocad unisolateobjects show all' }),
      c('selectSimilar', 'Select similar', 'Select', 'selectSimilar', { keywords: 'dxf autocad selectsimilar same type layer' }, true),
      c('quickSelect', 'Quick select…', 'Select', 'quickSelect', { keywords: 'dxf autocad qselect filter type layer colour' }),
      c('find', 'Find text…', 'Select', 'find', { keywords: 'dxf autocad find search text mtext attribute' }),
      c('count', 'Count objects', 'Select', 'count', { keywords: 'dxf autocad count quantity' }),
      c('quickProperties', 'Quick properties', 'Windows', 'quickProperties', { checked: quickProperties, keywords: 'dxf autocad qp' }),
    ];
  };

  return {
    display,
    setDisplay,
    tool,
    setTool,
    menu,
    openMenu,
    closeMenu: () => setMenu(null),
    menuItems,
    act,
    quickProperties,
    setQuickProperties,
    quickSelectOpen,
    setQuickSelectOpen,
    findOpen,
    setFindOpen,
    index,
    visible,
    visibleSet,
    selectObjects,
    commands,
  };
}
