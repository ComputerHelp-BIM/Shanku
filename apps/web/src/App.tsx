import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  AppShell,
  BottomPanel,
  Button,
  CommandSearch,
  IconButton,
  LocalIndicator,
  Ribbon,
  RibbonButton,
  RibbonGroup,
  RibbonTabs,
  StatusBar,
  StatusChip,
  TitleBar,
  ViewTabs,
  isEditableTarget,
  useShortcut,
  useTheme,
} from '@shanku/ui';
import { CATEGORY_PLURAL, ENGINE_VERSION, type Category, type DisplayStyle } from '@shanku/engine';
import { Browser } from './components/Browser';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Viewport, type ViewportHandle } from './components/Viewport';
import { fmtCount } from './lib/format';
import { fileFromDrop, pickIfcFile } from './lib/openFile';
import { useShankuModel } from './lib/useShankuModel';
import { SHORTCUT_HELP, createSequenceReader, type CommandId } from './lib/shortcuts';

const APP_VERSION = '0.2.0';
const STYLES: Array<{ id: DisplayStyle; label: string; keys: string }> = [
  { id: 'shaded', label: 'Shaded', keys: 'SD' },
  { id: 'consistent', label: 'Consistent', keys: 'CO' },
  { id: 'hiddenLine', label: 'Hidden line', keys: 'HL' },
  { id: 'wireframe', label: 'Wireframe', keys: 'WF' },
];
const RIBBON_TABS = ['Model', 'View', 'Manage'].map((label) => ({ id: label.toLowerCase(), label }));

function ThemeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" />
    </svg>
  );
}

export function App() {
  const { preference, cycle } = useTheme();
  const m = useShankuModel();
  const viewport = useRef<ViewportHandle>(null);
  const search = useRef<HTMLInputElement>(null);
  const [ribbonTab, setRibbonTab] = useState('model');
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState('activity');
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('shaded');
  const [sectionBox, setSectionBox] = useState(false);
  const [zoomRegion, setZoomRegion] = useState(false);

  // A new model starts with nothing hidden and no section box.
  useEffect(() => {
    setHidden([]);
    setSectionBox(false);
  }, [m.model]);

  const openFromDisk = useCallback(async () => {
    try {
      const file = await pickIfcFile();
      if (file) await m.open(file);
    } catch (e) {
      m.log(e instanceof Error ? e.message : String(e), 'error');
    }
  }, [m]);

  const openSample = useCallback(async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}samples/sample-frame.ifc`);
    if (!res.ok) return m.log('The sample model could not be loaded.', 'error');
    await m.open({ name: 'sample-frame.ifc', bytes: await res.arrayBuffer() });
  }, [m]);

  // Revit commands (two-letter sequences, Home, Esc).
  const runCommand = useCallback(
    (cmd: CommandId) => {
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
        case 'resetHidden':
          return setHidden([]);
        case 'sectionBox':
          if (sectionBox) {
            v.setSectionBox(null);
            return setSectionBox(false);
          }
          if (!sel.length) return void needSelection();
          v.setSectionBox(sel);
          setSectionBox(true);
          return v.fit(sel);
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
    [m, sectionBox],
  );

  useShortcut({ code: 'Escape' }, () => {
    if (zoomRegion) viewport.current?.cancelZoomRegion();
    else m.setSelection([]);
  });
  useShortcut({ code: 'Home' }, () => viewport.current?.home());
  const commandRef = useRef(runCommand);
  commandRef.current = runCommand;
  useEffect(() => {
    const read = createSequenceReader();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isEditableTarget(e.target)) return;
      if (!/^Key[A-Z]$/.test(e.code)) return;
      const cmd = read(e.code.slice(3), performance.now());
      if (cmd) {
        e.preventDefault();
        commandRef.current(cmd);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = e.currentTarget.value;
    const hit = m.find(q);
    if (hit === null) {
      setNotice(m.model ? `No element matches "${q}".` : 'Open a model first.');
      return;
    }
    m.setSelection([hit]);
    viewport.current?.fit([hit]);
    e.currentTarget.select();
  };

  const selectCategory = (c: Category) => m.selectWhere((cat) => cat === c);
  const selectLevel = (l: string) => m.selectWhere((_, level) => level === l);

  const info = m.model?.info;
  const sel = m.selection;
  const selLabel =
    !m.model || sel.length === 0
      ? 'Nothing selected'
      : sel.length === 1
        ? (() => {
            const e = m.model.elements[sel[0]];
            return `${e.category === 'Other' ? e.ifcClass : e.category} ${e.name || e.expressId}`;
          })()
        : `${fmtCount(sel.length)} elements`;

  const load = m.load;
  return (
    <AppShell
      titleBar={
        <TitleBar
          fileName={info?.fileName ?? 'No model open'}
          saveState={info ? 'Opened from this device' : undefined}
          search={<CommandSearch ref={search} onKeyDown={onSearchKey} placeholder="Find by Element ID, GlobalId or name…   Ctrl + K" />}
          actions={
            <>
              <IconButton label={`Theme: ${preference}. Switch theme`} onClick={cycle}>
                <ThemeIcon />
              </IconButton>
              <Button size="sm" disabled title="Accounts arrive with cloud features. Everything here works without one.">
                Sign in
              </Button>
            </>
          }
        />
      }
      ribbonTabs={<RibbonTabs tabs={RIBBON_TABS} activeId={ribbonTab} onChange={setRibbonTab} />}
      ribbon={
        <Ribbon label="Model">
          <RibbonGroup label="Open">
            <RibbonButton icon="ifc" label="IFC" onClick={openFromDisk} shortcutHint="opens from this device" />
            <RibbonButton icon="dxf" label="DXF" disabled shortcutHint="next release" />
          </RibbonGroup>
          <RibbonGroup label="Structure">
            {(['column', 'beam', 'wall', 'slab', 'footing'] as const).map((k) => (
              <RibbonButton key={k} icon={k} label={k[0].toUpperCase() + k.slice(1)} twoTone disabled shortcutHint="modelling arrives in 0.2" />
            ))}
          </RibbonGroup>
          <RibbonGroup label="View">
            <RibbonButton icon="view3d" label="3D" onClick={() => viewport.current?.home()} shortcutHint="Home" />
            <RibbonButton icon="plan" label="Top" onClick={() => viewport.current?.setView('top')} />
            <RibbonButton icon="elevation" label="Front" onClick={() => viewport.current?.setView('front')} />
          </RibbonGroup>
          <RibbonGroup label="Select">
            <RibbonButton icon="byid" label="By ID" onClick={() => search.current?.focus()} shortcutHint="Ctrl + K" />
          </RibbonGroup>
          <RibbonGroup label="Section">
            <RibbonButton icon="section" label="Box" active={sectionBox} disabled={!m.model} onClick={() => runCommand('sectionBox')} shortcutHint="BX" />
          </RibbonGroup>
        </Ribbon>
      }
      left={
        <>
          <PropertiesPanel model={m.model} selection={sel} properties={m.properties} />
          <Browser model={m.model} onSelectLevel={selectLevel} onSelectCategory={selectCategory} />
        </>
      }
      viewTabs={<ViewTabs tabs={[{ id: '3d', label: '{3D}' }]} activeId="3d" onSelect={() => {}} />}
      viewport={
        <div
          className={['app-drop', dragging && 'is-dragging', hidden.length > 0 && 'is-isolated'].filter(Boolean).join(' ')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragging(false);
            try {
              const file = await fileFromDrop(e);
              if (file) await m.open(file);
            } catch (err) {
              setNotice(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          <Viewport
            ref={viewport}
            model={m.model}
            selection={sel}
            hidden={hidden}
            displayStyle={displayStyle}
            onPick={m.pick}
            onBoxSelect={m.boxSelect}
            onZoomRegionEnd={() => setZoomRegion(false)}
          />
          {m.model && (hidden.length || sectionBox || zoomRegion) ? (
            <div className="app-viewstate" role="status">
              {hidden.length ? <span>Temporary hide/isolate · HR resets</span> : null}
              {sectionBox ? <span>Section box · BX removes</span> : null}
              {zoomRegion ? <span>Drag a region to zoom · Esc cancels</span> : null}
            </div>
          ) : null}
          {load.status === 'idle' && !m.model ? (
            <div className="app-overlay">
              <p className="app-overlay__title">Open an IFC model</p>
              <p className="app-overlay__text">Drop an .ifc file here or choose one. It is read on this device and never uploaded.</p>
              <div className="app-overlay__actions">
                <Button variant="primary" onClick={openFromDisk}>
                  Open IFC file
                </Button>
                <Button onClick={openSample}>Try the sample frame</Button>
              </div>
            </div>
          ) : null}
          {load.status === 'loading' ? (
            <div className="app-overlay" role="status" aria-live="polite">
              <p className="app-overlay__title">Opening {load.fileName}</p>
              <p className="app-overlay__text">
                {load.total ? `${fmtCount(load.done)} of ${fmtCount(load.total)} elements` : 'Reading the file…'}
              </p>
              <div className="app-progress" aria-hidden="true">
                <div className="app-progress__bar" style={{ width: `${load.total ? (100 * load.done) / load.total : 5}%` }} />
              </div>
            </div>
          ) : null}
          {load.status === 'error' ? (
            <div className="app-overlay" role="alert">
              <p className="app-overlay__title">That file didn’t open</p>
              <p className="app-overlay__text">{load.message}</p>
              <div className="app-overlay__actions">
                <Button variant="primary" onClick={openFromDisk}>
                  Choose another file
                </Button>
              </div>
            </div>
          ) : null}
          {notice ? (
            <p className="app-notice" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      }
      viewBar={
        <>
          <Button size="sm" variant="ghost" onClick={() => viewport.current?.fit()} title="Zoom to fit (ZF)">
            Fit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => viewport.current?.home()} title="Default 3D view (Home)">
            Home
          </Button>
          <Button size="sm" variant="ghost" onClick={() => viewport.current?.setView('top')}>
            Top
          </Button>
          <Button size="sm" variant="ghost" onClick={() => viewport.current?.setView('front')}>
            Front
          </Button>
          <Button size="sm" variant="ghost" onClick={() => viewport.current?.setView('right')}>
            Right
          </Button>
          <span className="app-divider" aria-hidden="true" />
          <div className="app-segmented" role="radiogroup" aria-label="Visual style">
            {STYLES.map((st) => (
              <button
                key={st.id}
                type="button"
                role="radio"
                aria-checked={displayStyle === st.id}
                className={displayStyle === st.id ? 'is-active' : undefined}
                title={`${st.label} (${st.keys})`}
                onClick={() => setDisplayStyle(st.id)}
              >
                {st.label}
              </button>
            ))}
          </div>
          <span className="app-divider" aria-hidden="true" />
          <Button size="sm" variant="ghost" onClick={() => runCommand('sectionBox')} disabled={!m.model || (!sectionBox && !sel.length)} title="Section box around the selection (BX)">
            Section box: {sectionBox ? 'On' : 'Off'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => runCommand('resetHidden')} disabled={!hidden.length} title="Reset temporary hide/isolate (HR)">
            Reset hidden
          </Button>
        </>
      }
      bottomPanel={
        <BottomPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          activeId={panelTab}
          onTabChange={setPanelTab}
          tabs={[
            {
              id: 'activity',
              label: 'Activity',
              content: m.activity.length ? (
                <ol className="app-activity">
                  {m.activity.map((a) => (
                    <li key={a.id} className={a.tone === 'error' ? 'is-error' : undefined}>
                      <time>{a.time.toLocaleTimeString()}</time> {a.text}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="app-empty-note">Nothing yet. Open a model and its load times appear here.</p>
              ),
            },
            {
              id: 'keyboard',
              label: 'Keyboard',
              content: (
                <table className="app-keys">
                  <tbody>
                    {SHORTCUT_HELP.map((k) => (
                      <tr key={k.keys}>
                        <th scope="row">{k.keys}</th>
                        <td>{k.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ),
            },
            {
              id: 'console',
              label: 'Python console',
              content: <p className="app-empty-note">The Python console arrives in a later release.</p>,
            },
          ]}
        />
      }
      statusBar={
        <StatusBar>
          <span className="app-sel">
            {sel.length ? <span className="app-sel__dot" aria-hidden="true" /> : null}
            {selLabel}
          </span>
          {info ? <span className="app-divider" aria-hidden="true" /> : null}
          {info
            ? Object.entries(info.categories).map(([c, n]) => (
                <StatusChip key={c}>
                  {CATEGORY_PLURAL[c as Category]} {fmtCount(n ?? 0)}
                </StatusChip>
              ))
            : null}
          <span className="app-spacer" />
          <LocalIndicator />
          <span className="app-divider" aria-hidden="true" />
          <span className="app-faint">
            {info ? `${info.schema} · ${info.units.length} · ` : ''}v{APP_VERSION} · engine {ENGINE_VERSION}
          </span>
        </StatusBar>
      }
    />
  );
}
