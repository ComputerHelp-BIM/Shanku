import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, type ReactNode } from 'react';
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

/** Float, pop out to its own window, dock back, as buttons on every group's tab bar. */
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
      {where !== 'popout' ? btn('Pop out to a new window', '↗', () => void containerApi.addPopoutGroup(group, { popoutUrl: `${import.meta.env.BASE_URL}popout.html` })) : null}
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
  const base = { id, component: 'panel', title: PANEL_TITLES[id], renderer: 'always' as const };
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

/** Revit-style docking: panels dock left, right or bottom, stack as tabs, float, or pop out to their own window. */
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
    if (g) {
      g.locked = 'no-drop-target'; // other panels dock around the views, never into them
      g.header.hidden = true;
    }
  };

  const save = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    try {
      const json = api.toJSON() as unknown as Record<string, unknown>;
      delete json.popoutGroups; // pop-out windows are not restored on reload (browsers block them)
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

  // Keep pop-out windows on the same theme as the main window.
  useEffect(() => {
    const sync = () => {
      const api = apiRef.current;
      const theme = document.documentElement.getAttribute('data-theme');
      for (const g of api?.groups ?? []) {
        const loc = g.api.location;
        if (loc.type === 'popout') {
          const root = loc.getWindow().document.documentElement;
          if (theme) root.setAttribute('data-theme', theme);
          else root.removeAttribute('data-theme');
        }
      }
    };
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const t = setInterval(sync, 1000); // also catches newly opened pop-outs
    return () => {
      mo.disconnect();
      clearInterval(t);
    };
  }, []);

  return (
    <RenderCtx.Provider value={render}>
      <DockviewReact
        className="app-dock"
        theme={{ ...themeLight, name: 'shanku', className: 'dockview-theme-light app-dock-theme' }}
        components={{ panel: PanelBody }}
        rightHeaderActionsComponent={HeaderActions}
        onReady={onReady}
        floatingGroupBounds="boundedWithinViewport"
        popoutUrl={`${import.meta.env.BASE_URL}popout.html`}
      />
    </RenderCtx.Provider>
  );
});
