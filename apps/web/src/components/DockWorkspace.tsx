import { createContext, forwardRef, useCallback, useContext, useImperativeHandle, useRef, type ReactNode } from 'react';
import {
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelProps,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

/** Every dockable panel in Shanku. "views" is the 3D view and drawing tabs; it always stays in the grid. */
export type PanelId = 'views' | 'properties' | 'browser' | 'activity' | 'boq' | 'keyboard' | 'console';

export const PANEL_TITLES: Record<PanelId, string> = {
  views: 'Views',
  properties: 'Properties',
  browser: 'Project browser',
  activity: 'Activity',
  boq: 'Bill of quantities',
  keyboard: 'Keyboard',
  console: 'Python console',
};
const BOTTOM: PanelId[] = ['activity', 'boq', 'keyboard', 'console'];
const LAYOUT_KEY = 'shanku.layout.v1';

const RenderCtx = createContext<(id: PanelId) => ReactNode>(() => null);

function PanelBody(props: IDockviewPanelProps) {
  const render = useContext(RenderCtx);
  return <div className="app-dock-panel">{render(props.api.id as PanelId)}</div>;
}

/** Float and dock back, as buttons on every group's tab bar. Everything stays inside the Shanku tab. */
function HeaderActions({ group, containerApi }: IDockviewHeaderActionsProps) {
  const where = group.api.location.type;
  if (group.panels.some((p) => p.id === 'views')) return null;
  const btn = (label: string, glyph: string, onClick: () => void) => (
    <button type="button" className="app-dock-action" title={label} aria-label={label} onClick={onClick}>
      {glyph}
    </button>
  );
  return (
    <div className="app-dock-actions">
      {where === 'grid' ? btn('Float', '❐', () => containerApi.addFloatingGroup(group)) : null}
      {where !== 'grid'
        ? btn('Dock', '⤓', () => {
            const views = containerApi.getPanel('views')?.group;
            group.api.moveTo({ group: views, position: group.panels.some((p) => p.id === 'properties') ? 'right' : group.panels.some((p) => p.id === 'browser') ? 'left' : 'bottom' });
          })
        : null}
    </div>
  );
}

export interface DockWorkspaceHandle {
  /** Show a panel if closed, bring it forward if it is a background tab, hide it if it is showing. */
  toggle: (id: PanelId) => void;
  open: (id: PanelId) => void;
  isOpen: (id: PanelId) => boolean;
  /** Ctrl + `: show or hide the docked bottom panels. */
  toggleBottom: () => void;
  reset: () => void;
}

export interface DockWorkspaceProps {
  render: (id: PanelId) => ReactNode;
  /** Called when panels open or close so the app can reflect state (ribbon, status bar). */
  onChange?: (open: PanelId[]) => void;
}

function addDefault(api: DockviewApi, id: PanelId) {
  const base = { id, component: 'panel', title: PANEL_TITLES[id], renderer: 'always' as const, minimumWidth: id === 'views' ? 320 : 200, minimumHeight: 120 };
  if (id === 'views') return api.addPanel(base);
  if (id === 'browser') return api.addPanel({ ...base, position: { referencePanel: 'views', direction: 'left' }, initialWidth: 270 });
  if (id === 'properties') return api.addPanel({ ...base, position: { referencePanel: 'views', direction: 'right' }, initialWidth: 310 });
  if (id === 'boq') {
    const r = document.querySelector('.dv-dockview')?.getBoundingClientRect();
    return api.addPanel({ ...base, floating: { x: 40, y: 40, width: Math.min(1080, (r?.width ?? 1200) - 80), height: Math.min(520, (r?.height ?? 700) - 80) } });
  }
  const sibling = BOTTOM.map((b) => api.getPanel(b)).find((p) => p && p.group.api.location.type === 'grid');
  if (sibling) return api.addPanel({ ...base, position: { referencePanel: sibling, direction: 'within' } });
  return api.addPanel({ ...base, position: { referencePanel: 'views', direction: 'below' }, initialHeight: 240 });
}

function defaultLayout(api: DockviewApi) {
  api.clear();
  addDefault(api, 'views');
  addDefault(api, 'browser');
  addDefault(api, 'properties');
  api.getPanel('views')?.api.setActive();
}

/** Revit-style docking inside the app: drag a tab to dock it on any side or stack it; float, move and resize; dock back. */
export const DockWorkspace = forwardRef<DockWorkspaceHandle, DockWorkspaceProps>(function DockWorkspace({ render, onChange }, ref) {
  const apiRef = useRef<DockviewApi | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const report = useCallback(() => {
    const api = apiRef.current;
    if (api) changeRef.current?.(api.panels.map((p) => p.id as PanelId));
  }, []);

  const lockViews = (api: DockviewApi) => {
    const g = api.getPanel('views')?.group;
    if (g) g.header.hidden = true; // the views keep their own tab strip ({3D}, drawings)
  };

  const save = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    try {
      const json = api.toJSON() as unknown as Record<string, unknown>;
      delete json.popoutGroups; // Shanku never opens separate browser windows
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(json));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const onReady = (e: DockviewReadyEvent) => {
    const api = e.api;
    apiRef.current = api;
    let restored = false;
    try {
      const saved = localStorage.getItem(LAYOUT_KEY);
      if (saved) {
        api.fromJSON(JSON.parse(saved));
        restored = !!api.getPanel('views');
      }
    } catch {
      restored = false;
    }
    if (!restored) defaultLayout(api);
    lockViews(api);
    api.onDidLayoutChange(() => {
      save();
      report();
    });
    // Panels dock beside the views (left, right, top, bottom) but never stack into them as a tab.
    api.onWillShowOverlay((ev) => {
      const target = (ev as unknown as { group?: { panels: Array<{ id: string }> } }).group;
      if (ev.position === 'center' && target?.panels.some((p) => p.id === 'views')) ev.preventDefault();
    });
    // Like Revit, when docks are added, moved, floated or docked back, the 3D view absorbs the space:
    // a side dock that dockview split evenly is set back to a normal width. Runs only when the dock
    // structure changes, never while the user drags a splitter, so their own sizes stand.
    let signature = '';
    let pending = 0;
    api.onDidLayoutChange(() => {
      const sig = api.groups.map((g) => `${g.id}:${g.api.location.type}:${g.panels.map((p) => p.id).join(',')}`).join('|');
      if (sig === signature) return;
      signature = sig;
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        const total = document.querySelector('.app-dock')?.getBoundingClientRect();
        if (!total) return;
        for (const g of api.groups) {
          if (g.api.location.type !== 'grid' || g.panels.some((p) => p.id === 'views')) continue;
          const tall = g.height > total.height * 0.6;
          if (tall && g.width > 380) g.api.setSize({ width: g.panels.some((p) => p.id === 'browser') ? 270 : 310 });
          else if (!tall && g.height > total.height * 0.45) g.api.setSize({ height: 240 });
        }
      });
    });
    api.onDidAddPanel(report);
    api.onDidRemovePanel(report);
    report();
  };

  useImperativeHandle(ref, () => ({
    isOpen: (id) => !!apiRef.current?.getPanel(id),
    open: (id) => {
      const api = apiRef.current;
      if (!api) return;
      const p = api.getPanel(id) ?? addDefault(api, id);
      p?.api.setActive();
    },
    toggle: (id) => {
      const api = apiRef.current;
      if (!api) return;
      const p = api.getPanel(id);
      if (!p) addDefault(api, id)?.api.setActive();
      else if (p.api.isVisible) p.api.close(); // shown: hide it, like Revit's toggles
      else p.api.setActive(); // behind another tab in its group: bring it forward
    },
    toggleBottom: () => {
      const api = apiRef.current;
      if (!api) return;
      const docked = BOTTOM.map((b) => api.getPanel(b)).filter((p) => p && p.group.api.location.type === 'grid');
      if (docked.length) docked.forEach((p) => p!.api.close());
      else addDefault(api, 'activity')?.api.setActive();
    },
    reset: () => {
      const api = apiRef.current;
      if (!api) return;
      defaultLayout(api);
      lockViews(api);
      save();
    },
  }));

  return (
    <RenderCtx.Provider value={render}>
      <DockviewReact
        className="app-dock"
        theme={{ ...themeLight, name: 'shanku', className: 'dockview-theme-light app-dock-theme' }}
        components={{ panel: PanelBody }}
        rightHeaderActionsComponent={HeaderActions}
        onReady={onReady}
        floatingGroupBounds="boundedWithinViewport"
        floatingGroupDragHandle="tabbar"
      />
    </RenderCtx.Provider>
  );
});
